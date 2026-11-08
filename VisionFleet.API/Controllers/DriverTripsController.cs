
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using VisionFleet.API.Data;

namespace VisionFleet.API.Controllers
{
    [ApiController]
    [Route("api/driver/trips")]
    [Authorize(Roles = "Driver")]
    public class DriverTripsController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;

        public DriverTripsController(VisionFleetDbContext context)
        {
            _context = context;
        }

        private int? GetCurrentDriverId()
        {
            string? value = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            return int.TryParse(value, out int id)
                ? id
                : null;
        }

        // Use the existing SQL schedule lock.
        // The lock belongs to the transaction.
        private async Task LockSchedule()
        {
            await _context.Database.ExecuteSqlRawAsync(@"
                DECLARE @result INT;

                EXEC @result = sp_getapplock
                    @Resource = 'VisionFleet.BookingSchedule',
                    @LockMode = 'Exclusive',
                    @LockOwner = 'Transaction',
                    @LockTimeout = 10000;

                IF @result < 0
                    THROW 51000,
                    'Could not lock journey schedule.', 1;
            ");
        }

        // =====================================
        // GET /api/driver/trips
        //
        // Only returns journeys assigned to
        // the currently authenticated Driver.
        // =====================================

        [HttpGet]
        public async Task<IActionResult> GetMyTrips()
        {
            int? driverId = GetCurrentDriverId();

            if (driverId == null)
                return Unauthorized();

            var trips = await _context.Journeys
                .AsNoTracking()
                .Where(j =>
                    j.DriverUserId == driverId.Value &&
                    j.Booking.DrivingOption == "DRIVER_REQUIRED"
                )
                .OrderByDescending(j => j.Booking.DepartureAt)
                .Select(j => new
                {
                    j.JourneyId,
                    j.BookingId,
                    j.DriverUserId,
                    j.VanId,

                    VanRegistration =
                        j.Booking.AssignedVan == null
                            ? null
                            : j.Booking.AssignedVan.Registration,

                    VanModel =
                        j.Booking.AssignedVan == null
                            ? null
                            : j.Booking.AssignedVan.MakeModel,

                    j.Booking.Purpose,
                    j.Booking.DepartureAt,
                    j.Booking.ReturnAt,
                    j.Booking.PassengerCount,

                    BookingStatus = j.Booking.Status,

                    RequestedBy =
                        j.Booking.RequestedByUser.FullName,

                    BookedFor =
                        j.Booking.BookedForUser.FullName,

                    j.Status,
                    j.StartedAt,
                    j.EndedAt,
                    j.ActualPassengerCount
                })
                .ToListAsync();

            return Ok(trips);
        }

        // =====================================
        // POST /api/driver/trips/{id}/start
        //
        // Driver confirms actual passenger
        // count before beginning the trip.
        // =====================================

        [HttpPost("{journeyId:int}/start")]
        public async Task<IActionResult> StartTrip(
            int journeyId,
            [FromBody] StartTripRequest request)
        {
            int? driverId = GetCurrentDriverId();

            if (driverId == null)
                return Unauthorized();

            if (request.ActualPassengerCount < 1)
            {
                return BadRequest(new
                {
                    message =
                        "Enter at least one passenger."
                });
            }

            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockSchedule();

            var journey = await _context.Journeys
                .Include(j => j.Booking)
                .FirstOrDefaultAsync(j =>
                    j.JourneyId == journeyId &&
                    j.DriverUserId == driverId.Value);

            if (journey == null)
            {
                return NotFound(new
                {
                    message =
                        "Assigned journey not found."
                });
            }

            if (journey.Booking.Status != "APPROVED" ||
                journey.Booking.DrivingOption != "DRIVER_REQUIRED")
            {
                return Conflict(new
                {
                    message =
                        "This booking is not approved for a driver."
                });
            }

            if (journey.Status != "SCHEDULED" ||
                journey.StartedAt != null ||
                journey.EndedAt != null)
            {
                return Conflict(new
                {
                    message =
                        "This trip has already started or ended."
                });
            }

            DateTime now = DateTime.Now;

            if (journey.Booking.ReturnAt <= now)
            {
                return Conflict(new
                {
                    message =
                        "This booking has passed its return time. " +
                        "Contact Admin."
                });
            }

            int capacity = await _context.Vans
                .Where(v => v.VanId == journey.VanId)
                .Select(v => v.Capacity)
                .FirstOrDefaultAsync();

            if (capacity < 1)
            {
                return Conflict(new
                {
                    message =
                        "Vehicle information could not be found."
                });
            }

            if (request.ActualPassengerCount > capacity)
            {
                return BadRequest(new
                {
                    message =
                        $"Passenger count cannot exceed " +
                        $"vehicle capacity ({capacity})."
                });
            }

            journey.ActualPassengerCount =
                request.ActualPassengerCount;

            journey.StartedAt = now;
            journey.EndedAt = null;
            journey.Status = "IN_PROGRESS";

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new
            {
                message = "Trip started successfully.",
                journey.JourneyId,
                journey.BookingId,
                journey.Status,
                journey.StartedAt,
                journey.ActualPassengerCount
            });
        }

        // =====================================
        // POST /api/driver/trips/{id}/end
        //
        // End the trip and save actual end time.
        // =====================================

        [HttpPost("{journeyId:int}/end")]
        public async Task<IActionResult> EndTrip(int journeyId)
        {
            int? driverId = GetCurrentDriverId();

            if (driverId == null)
                return Unauthorized();

            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockSchedule();

            var journey = await _context.Journeys
                .FirstOrDefaultAsync(j =>
                    j.JourneyId == journeyId &&
                    j.DriverUserId == driverId.Value);

            if (journey == null)
            {
                return NotFound(new
                {
                    message = "Assigned journey not found."
                });
            }

            if (journey.Status != "IN_PROGRESS" ||
                journey.StartedAt == null ||
                journey.EndedAt != null)
            {
                return Conflict(new
                {
                    message =
                        "Only a trip currently in progress " +
                        "can be completed."
                });
            }

            DateTime now = DateTime.Now;

            if (now < journey.StartedAt.Value)
            {
                return Conflict(new
                {
                    message = "Invalid journey time."
                });
            }

            journey.EndedAt = now;
            journey.Status = "COMPLETED";

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new
            {
                message = "Trip completed successfully.",
                journey.JourneyId,
                journey.BookingId,
                journey.Status,
                journey.StartedAt,
                journey.EndedAt,
                journey.ActualPassengerCount
            });
        }
    }

    public class StartTripRequest
    {
        [Range(1, 100)]
        public int ActualPassengerCount { get; set; }
    }
}
