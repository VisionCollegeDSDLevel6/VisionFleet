using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VisionFleet.API.Data;

namespace VisionFleet.API.Controllers
{
    [ApiController]
    [Route("api/driver-assignments/history")]
    [Authorize(Roles = "Admin")]
    public class DriverAssignmentHistoryController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;

        public DriverAssignmentHistoryController(
            VisionFleetDbContext context)
        {
            _context = context;
        }

        // GET /api/driver-assignments/history
        //
        // DRIVER_REQUIRED:
        // Read real Journey records.
        //
        // SELF_DRIVE:
        // Calculate trip status from approved Bookings.
        // No additional Journey record is created.

        [HttpGet]
        public async Task<IActionResult> GetHistory()
        {
            DateTime now = DateTime.Now;

            // =====================================
            // 1. DRIVER REQUIRED JOURNEYS
            // =====================================

            var driverJourneys = await _context.Journeys
                .AsNoTracking()
                .Where(j =>
                    !j.IsHiddenFromHistory &&
                    j.Booking.DrivingOption == "DRIVER_REQUIRED")
                .Select(j => new HistoryRow
                {
                    HistoryKey = "journey-" + j.JourneyId,

                    JourneyId = j.JourneyId,
                    IsVirtual = false,
                    IsAutoTimed = false,

                    BookingId = j.BookingId,

                    DriverUserId = j.DriverUserId,

                    DriverName = j.DriverUser == null
                        ? null
                        : j.DriverUser.FullName,

                    VanId = j.VanId,

                    VanRegistration = _context.Vans
                        .Where(v => v.VanId == j.VanId)
                        .Select(v => v.Registration)
                        .FirstOrDefault(),

                    VanModel = _context.Vans
                        .Where(v => v.VanId == j.VanId)
                        .Select(v => v.MakeModel)
                        .FirstOrDefault(),

                    Purpose = j.Booking.Purpose,

                    DrivingOption = j.Booking.DrivingOption,

                    BookingStatus = j.Booking.Status,

                    DepartureAt = j.Booking.DepartureAt,

                    ReturnAt = j.Booking.ReturnAt,

                    BookedPassengers = j.Booking.PassengerCount,

                    ActualPassengerCount = j.ActualPassengerCount,

                    Status = j.Status,

                    StartedAt = j.StartedAt,

                    EndedAt = j.EndedAt
                })
                .ToListAsync();

            // =====================================
            // 2. SELF DRIVE BOOKINGS
            // =====================================

            // Only approved Self Drive bookings
            // that have reached departure time.
            //
            // Future trips do not appear yet.

            var selfDriveBookings = await _context.Bookings
                .AsNoTracking()
                .Where(b =>
                    b.Status == "APPROVED" &&
                    b.DrivingOption == "SELF_DRIVE" &&
                    b.AssignedVanId != null &&
                    b.DepartureAt <= now)
                .Select(b => new
                {
                    b.BookingId,

                    b.BookedForUserId,

                    DriverName = b.BookedForUser.FullName,

                    b.AssignedVanId,

                    VanRegistration = _context.Vans
                        .Where(v => v.VanId == b.AssignedVanId)
                        .Select(v => v.Registration)
                        .FirstOrDefault(),

                    VanModel = _context.Vans
                        .Where(v => v.VanId == b.AssignedVanId)
                        .Select(v => v.MakeModel)
                        .FirstOrDefault(),

                    b.Purpose,

                    b.DrivingOption,

                    b.Status,

                    b.DepartureAt,

                    b.ReturnAt,

                    b.PassengerCount
                })
                .ToListAsync();

            // =====================================
            // 3. CALCULATE SELF DRIVE STATUS
            // =====================================

            var selfDriveHistory = selfDriveBookings.Select(b =>
            {
                bool completed = b.ReturnAt <= now;

                return new HistoryRow
                {
                    HistoryKey = "selfdrive-" + b.BookingId,

                    // No physical Journey record.
                    JourneyId = null,

                    IsVirtual = true,

                    IsAutoTimed = true,

                    BookingId = b.BookingId,

                    // Staff is driving the vehicle.
                    DriverUserId = b.BookedForUserId,

                    DriverName = b.DriverName,

                    VanId = b.AssignedVanId,

                    VanRegistration = b.VanRegistration,

                    VanModel = b.VanModel,

                    Purpose = b.Purpose,

                    DrivingOption = b.DrivingOption,

                    BookingStatus = b.Status,

                    DepartureAt = b.DepartureAt,

                    ReturnAt = b.ReturnAt,

                    BookedPassengers = b.PassengerCount,

                    // Actual passenger number has
                    // not been confirmed by Staff.
                    ActualPassengerCount = null,

                    // Automatically calculate status.
                    Status = completed
                        ? "COMPLETED"
                        : "IN_PROGRESS",

                    // Scheduled times, not actual
                    // confirmed departure/arrival.
                    StartedAt = b.DepartureAt,

                    EndedAt = completed
                        ? b.ReturnAt
                        : null
                };
            });

            // =====================================
            // 4. COMBINE BOTH TYPES
            // =====================================

            var result = driverJourneys
                .Concat(selfDriveHistory)
                .OrderByDescending(x => x.DepartureAt)
                .ThenByDescending(x => x.BookingId)
                .ToList();

            return Ok(result);
        }

        // =====================================
        // DELETE JOURNEY HISTORY
        // =====================================

        // DELETE /api/driver-assignments/history/{id}
        //
        // Soft delete for real Journey records.
        // Self Drive entries have no JourneyId.

        [HttpDelete("{journeyId:int}")]
        public async Task<IActionResult> DeleteFromHistory(
            int journeyId)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

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

            var journey = await _context.Journeys
                .Include(j => j.Booking)
                .FirstOrDefaultAsync(j =>
                    j.JourneyId == journeyId);

            if (journey == null)
            {
                return NotFound(new
                {
                    message = "Journey not found."
                });
            }

            if (journey.IsHiddenFromHistory)
            {
                return Conflict(new
                {
                    message = "Journey already hidden."
                });
            }

            DateTime now = DateTime.Now;

            bool completed =
                journey.Status == "COMPLETED" &&
                journey.EndedAt != null;

            bool cancelled =
                journey.Status == "CANCELLED";

            bool expiredScheduled =
                journey.Status == "SCHEDULED" &&
                journey.Booking.ReturnAt <= now &&
                journey.StartedAt == null;

            if (!completed &&
                !cancelled &&
                !expiredScheduled)
            {
                return Conflict(new
                {
                    message =
                        "Only completed, cancelled or expired " +
                        "scheduled journeys can be removed " +
                        "from history."
                });
            }

            // Hide record from Admin History.
            // Do not physically delete the Journey.

            journey.IsHiddenFromHistory = true;

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();

            return Ok(new
            {
                message = "Journey hidden from Admin History.",
                journeyId,
                hidden = true,
                permanentlyDeleted = false
            });
        }

        // =====================================
        // RESPONSE MODEL
        // =====================================

        private sealed class HistoryRow
        {
            public string HistoryKey { get; set; } = "";

            public int? JourneyId { get; set; }

            public bool IsVirtual { get; set; }

            public bool IsAutoTimed { get; set; }

            public int BookingId { get; set; }

            public int? DriverUserId { get; set; }

            public string? DriverName { get; set; }

            public int? VanId { get; set; }

            public string? VanRegistration { get; set; }

            public string? VanModel { get; set; }

            public string? Purpose { get; set; }

            public string? DrivingOption { get; set; }

            public string? BookingStatus { get; set; }

            public DateTime DepartureAt { get; set; }

            public DateTime ReturnAt { get; set; }

            public int BookedPassengers { get; set; }

            public int? ActualPassengerCount { get; set; }

            public string? Status { get; set; }

            public DateTime? StartedAt { get; set; }

            public DateTime? EndedAt { get; set; }
        }
    }
}