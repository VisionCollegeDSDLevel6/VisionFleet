
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using VisionFleet.API.Data;
using VisionFleet.API.Models;
using VisionFleet.API.Services;

namespace VisionFleet.API.Controllers
{
    [ApiController]
    [Route("api/driver-assignments")]
    [Authorize(Roles = "Admin")]
    public class DriverAssignmentsController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;
        private readonly EmailService _emailService;

        public DriverAssignmentsController(
            VisionFleetDbContext context,
            EmailService emailService)
        {
            _context = context;
            _emailService = emailService;
        }

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
                    THROW 51000, 'Schedule is busy.', 1;
            ");
        }

        private async Task<bool> SendEmail(
            string? email,
            string subject,
            string message)
        {
            if (string.IsNullOrWhiteSpace(email))
                return false;

            try
            {
                await _emailService.SendEmailAsync(
                    email,
                    subject,
                    message);

                return true;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(
                    "Email failed: " + ex.Message);

                return false;
            }
        }

        // =====================================
        // GET ASSIGNMENTS
        //
        // Approved + Driver Required only.
        // Hide once ReturnAt has passed.
        // =====================================

        [HttpGet]
        public async Task<IActionResult> GetAssignments()
        {
            DateTime now = DateTime.Now;

            var bookings = await _context.Bookings
                .AsNoTracking()
                .Where(b =>
                    b.Status == "APPROVED" &&
                    b.DrivingOption == "DRIVER_REQUIRED" &&
                    b.ReturnAt > now)
                .OrderBy(b => b.DepartureAt)
                .Select(b => new
                {
                    b.BookingId,
                    b.Purpose,
                    b.DrivingOption,
                    b.DepartureAt,
                    b.ReturnAt,
                    b.PassengerCount,
                    b.AssignedVanId,

                    VanRegistration =
                        b.AssignedVan == null
                            ? null
                            : b.AssignedVan.Registration,

                    VanModel =
                        b.AssignedVan == null
                            ? null
                            : b.AssignedVan.MakeModel,

                    RequesterName =
                        b.RequestedByUser.FullName,

                    BookedForName =
                        b.BookedForUser.FullName,

                    Journey = _context.Journeys
                        .Where(j =>
                            j.BookingId == b.BookingId)
                        .OrderByDescending(j => j.JourneyId)
                        .Select(j => new
                        {
                            j.JourneyId,
                            j.Status,
                            j.StartedAt,
                            j.EndedAt,
                            j.DriverUserId,

                            DriverName =
                                j.DriverUser == null
                                    ? null
                                    : j.DriverUser.FullName
                        })
                        .FirstOrDefault()
                })
                .ToListAsync();

            // Use a consistent response for the
            // existing Driver Assignment frontend.
            var results = bookings.Select(b => new
            {
                b.BookingId,
                b.Purpose,
                b.DrivingOption,
                b.DepartureAt,
                b.ReturnAt,
                b.PassengerCount,
                b.AssignedVanId,
                b.VanRegistration,
                b.VanModel,
                b.RequesterName,
                b.BookedForName,

                JourneyId = b.Journey?.JourneyId,

                JourneyStatus = b.Journey?.Status,

                JourneyStartedAt = b.Journey?.StartedAt,

                JourneyEndedAt = b.Journey?.EndedAt,

                DriverUserId = b.Journey?.DriverUserId,

                DriverName = b.Journey?.DriverName
            });

            return Ok(results);
        }

        // =====================================
        // GET ELIGIBLE DRIVERS
        // Dedicated DRIVER accounts only.
        // =====================================

        [HttpGet("drivers")]
        public async Task<IActionResult> GetDrivers()
        {
            var drivers = await _context.Users
                .AsNoTracking()
                .Where(u =>
                    u.Role.ToUpper() == "DRIVER" &&
                    u.CanDrive)
                .OrderBy(u => u.FullName)
                .Select(u => new
                {
                    u.UserId,
                    u.FullName,
                    u.Email,
                    u.Role,
                    u.CanDrive
                })
                .ToListAsync();

            return Ok(drivers);
        }

        // =====================================
        // ASSIGN / CHANGE DRIVER
        // PUT /api/driver-assignments/{id}/assign
        // =====================================

        [HttpPut("{bookingId:int}/assign")]
        public async Task<IActionResult> AssignDriver(
            int bookingId,
            [FromBody] AssignDriverRequest request)
        {
            if (request.DriverUserId < 1)
            {
                return BadRequest(new
                {
                    message = "Select a driver."
                });
            }

            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockSchedule();

            var booking = await _context.Bookings
                .Include(b => b.AssignedVan)
                .FirstOrDefaultAsync(b =>
                    b.BookingId == bookingId);

            if (booking == null)
            {
                return NotFound(new
                {
                    message = "Booking not found."
                });
            }

            if (booking.Status != "APPROVED" ||
                booking.DrivingOption != "DRIVER_REQUIRED")
            {
                return Conflict(new
                {
                    message =
                        "Only approved Driver Required " +
                        "bookings can be assigned."
                });
            }

            if (booking.DepartureAt <= DateTime.Now)
            {
                return Conflict(new
                {
                    message =
                        "Departure time has passed. " +
                        "The assignment is locked."
                });
            }

            if (booking.AssignedVanId == null ||
                booking.AssignedVan == null)
            {
                return Conflict(new
                {
                    message = "No van assigned to this booking."
                });
            }

            var driver = await _context.Users
                .FirstOrDefaultAsync(u =>
                    u.UserId == request.DriverUserId);

            if (driver == null ||
                driver.Role.ToUpper() != "DRIVER" ||
                !driver.CanDrive)
            {
                return BadRequest(new
                {
                    message =
                        "Select an eligible Driver account."
                });
            }

            var journey = await _context.Journeys
                .Where(j => j.BookingId == bookingId)
                .OrderByDescending(j => j.JourneyId)
                .FirstOrDefaultAsync();

            if (journey != null &&
                (
                    journey.Status != "SCHEDULED" ||
                    journey.StartedAt != null ||
                    journey.EndedAt != null
                ))
            {
                return Conflict(new
                {
                    message =
                        "Cannot change a journey that " +
                        "has already started or ended."
                });
            }

            // Another Driver Required journey overlaps.
            bool busyWithJourney =
                await _context.Journeys.AnyAsync(j =>
                    j.BookingId != bookingId &&
                    j.DriverUserId == driver.UserId &&
                    (
                        j.Status == "SCHEDULED" ||
                        j.Status == "IN_PROGRESS"
                    ) &&
                    j.Booking.Status == "APPROVED" &&
                    j.Booking.DepartureAt < booking.ReturnAt &&
                    j.Booking.ReturnAt > booking.DepartureAt);

            if (busyWithJourney)
            {
                return Conflict(new
                {
                    message =
                        "This driver has another trip " +
                        "during the requested time."
                });
            }

            // Protect existing self-drive bookings,
            // including accounts converted to Driver.
            bool selfDriveConflict =
                await _context.Bookings.AnyAsync(b =>
                    b.BookingId != bookingId &&
                    b.BookedForUserId == driver.UserId &&
                    b.DrivingOption == "SELF_DRIVE" &&
                    (
                        b.Status == "PENDING" ||
                        b.Status == "APPROVED"
                    ) &&
                    b.DepartureAt < booking.ReturnAt &&
                    b.ReturnAt > booking.DepartureAt);

            if (selfDriveConflict)
            {
                return Conflict(new
                {
                    message =
                        "This driver has a conflicting " +
                        "Self Drive booking."
                });
            }

            int? oldDriverId = journey?.DriverUserId;

            if (journey == null)
            {
                // Booking currently stores Purpose,
                // not separate pickup/destination.
                journey = new Journey
                {
                    BookingId = booking.BookingId,
                    VanId = booking.AssignedVanId.Value,
                    DriverUserId = driver.UserId,
                    StartLocation = "Not specified",
                    EndLocation = "Not specified",
                    Status = "SCHEDULED"
                };

                _context.Journeys.Add(journey);
            }
            else
            {
                journey.DriverUserId = driver.UserId;
                journey.VanId = booking.AssignedVanId.Value;
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            string tripInformation =
                $"Booking #{booking.BookingId}\n" +
                $"Vehicle: {booking.AssignedVan.Registration}\n" +
                $"Departure: {booking.DepartureAt:dd/MM/yyyy HH:mm}\n" +
                $"Return: {booking.ReturnAt:dd/MM/yyyy HH:mm}\n" +
                $"Purpose: {booking.Purpose}";

            bool emailSent = await SendEmail(
                driver.Email,
                "Vision Fleet - Driver Assignment",
                $"Hello {driver.FullName},\n\n" +
                "You have been assigned to a journey.\n\n" +
                tripInformation +
                "\n\nPlease sign in to Vision Fleet " +
                "to view your trip."
            );

            // Notify previous driver if changed.
            if (oldDriverId.HasValue &&
                oldDriverId.Value != driver.UserId)
            {
                var oldDriver = await _context.Users
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u =>
                        u.UserId == oldDriverId.Value);

                if (oldDriver != null)
                {
                    await SendEmail(
                        oldDriver.Email,
                        "Vision Fleet - Assignment Changed",
                        $"Hello {oldDriver.FullName},\n\n" +
                        $"You are no longer assigned " +
                        $"to Booking #{bookingId}."
                    );
                }
            }

            return Ok(new
            {
                message = "Driver assigned successfully.",
                booking.BookingId,
                journey.JourneyId,
                journey.DriverUserId,
                DriverName = driver.FullName,
                journey.Status,
                emailSent
            });
        }

        // =====================================
        // DELETE ASSIGNMENT
        // PUT /api/driver-assignments/{id}/unassign
        //
        // Booking and Journey are not deleted.
        // =====================================

        [HttpPut("{bookingId:int}/unassign")]
        public async Task<IActionResult> UnassignDriver(
            int bookingId)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockSchedule();

            var booking = await _context.Bookings
                .FirstOrDefaultAsync(b =>
                    b.BookingId == bookingId);

            if (booking == null)
            {
                return NotFound(new
                {
                    message = "Booking not found."
                });
            }

            if (booking.Status != "APPROVED" ||
                booking.DrivingOption != "DRIVER_REQUIRED" ||
                booking.DepartureAt <= DateTime.Now)
            {
                return Conflict(new
                {
                    message =
                        "This booking can no longer " +
                        "have its driver changed."
                });
            }

            var journey = await _context.Journeys
                .Where(j => j.BookingId == bookingId)
                .OrderByDescending(j => j.JourneyId)
                .FirstOrDefaultAsync();

            if (journey == null ||
                journey.DriverUserId == null)
            {
                return Conflict(new
                {
                    message = "No driver is assigned."
                });
            }

            if (journey.Status != "SCHEDULED" ||
                journey.StartedAt != null ||
                journey.EndedAt != null)
            {
                return Conflict(new
                {
                    message =
                        "Cannot remove an assignment " +
                        "after the trip has started."
                });
            }

            int oldDriverId = journey.DriverUserId.Value;

            journey.DriverUserId = null;

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            var oldDriver = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u =>
                    u.UserId == oldDriverId);

            bool emailSent = false;

            if (oldDriver != null)
            {
                emailSent = await SendEmail(
                    oldDriver.Email,
                    "Vision Fleet - Assignment Removed",
                    $"Hello {oldDriver.FullName},\n\n" +
                    $"Your assignment for Booking #{bookingId} " +
                    "has been removed."
                );
            }

            return Ok(new
            {
                message = "Assignment removed successfully.",
                bookingId,
                journey.JourneyId,
                driverUserId = (int?)null,
                emailSent
            });
        }
    }

    public class AssignDriverRequest
    {
        [Range(1, int.MaxValue)]
        public int DriverUserId { get; set; }
    }
}
