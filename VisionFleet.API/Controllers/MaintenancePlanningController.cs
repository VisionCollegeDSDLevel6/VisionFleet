
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using VisionFleet.API.Data;
using VisionFleet.API.Models;
using VisionFleet.API.Services;

namespace VisionFleet.API.Controllers
{
    [Route("api/maintenance-planning")]
    [ApiController]
    [Authorize(Roles = "Admin")]
    public class MaintenancePlanningController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;
        private readonly EmailService _emailService;

        public MaintenancePlanningController(
            VisionFleetDbContext context,
            EmailService emailService)
        {
            _context = context;
            _emailService = emailService;
        }

        // =====================================
        // Shared booking schedule lock
        // =====================================

        private async Task LockBookingSchedule()
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
                    'Could not lock booking schedule.',
                    1;
            ");
        }

        // =====================================
        // Validate dates
        // =====================================

        private static bool IsValidDateRange(
            DateTime startDate,
            DateTime endDate)
        {
            return startDate != default &&
                   endDate != default &&
                   endDate.Date >= startDate.Date &&
                   endDate.Date < DateTime.MaxValue.Date;
        }

        // =====================================
        // Check existing maintenance
        // =====================================

        private async Task<bool> HasMaintenanceConflict(
            int vanId,
            DateTime start,
            DateTime endExclusive)
        {
            return await _context.MaintenanceRecords
                .AsNoTracking()
                .AnyAsync(m =>
                    m.VanId == vanId &&
                    (m.Status == "SCHEDULED" ||
                     m.Status == "IN_PROGRESS") &&
                    m.ScheduledDate < endExclusive &&
                    (m.PlannedEndDate ??
                     m.ScheduledDate) >= start);
        }

        // =====================================
        // Find affected bookings
        // Only the selected van
        // Only PENDING / APPROVED
        // Only overlapping dates
        // =====================================

        private IQueryable<Booking> AffectedBookingsQuery(
            int vanId,
            DateTime start,
            DateTime endExclusive)
        {
            return _context.Bookings.Where(b =>
                b.AssignedVanId == vanId &&
                (b.Status == "PENDING" ||
                 b.Status == "APPROVED") &&
                b.DepartureAt < endExclusive &&
                b.ReturnAt > start);
        }

        // =====================================
        // Check existing Journeys
        // Never automatically cancel a booking
        // that already has a Journey.
        // =====================================

        private async Task<List<int>> GetJourneyBookingIds(
            List<int> bookingIds)
        {
            if (bookingIds.Count == 0)
            {
                return new List<int>();
            }

            return await _context.Journeys
                .AsNoTracking()
                .Where(j =>
                    bookingIds.Contains(j.BookingId))
                .Select(j => j.BookingId)
                .Distinct()
                .ToListAsync();
        }

        // =====================================
        // GET: Preview
        // Kept for compatibility, but the new
        // React form will not require Preview.
        // =====================================

        [HttpGet("preview")]
        public async Task<IActionResult> PreviewMaintenance(
            [FromQuery] int vanId,
            [FromQuery] DateTime startDate,
            [FromQuery] DateTime endDate)
        {
            if (vanId <= 0 ||
                !IsValidDateRange(startDate, endDate))
            {
                return BadRequest(new
                {
                    message = "Vehicle and valid dates are required."
                });
            }

            DateTime start = startDate.Date;
            DateTime end = endDate.Date;
            DateTime endExclusive = end.AddDays(1);

            var van = await _context.Vans
                .AsNoTracking()
                .FirstOrDefaultAsync(v => v.VanId == vanId);

            if (van == null)
            {
                return NotFound(new
                {
                    message = "Van not found."
                });
            }

            if (await HasMaintenanceConflict(
                vanId, start, endExclusive))
            {
                return Conflict(new
                {
                    message =
                        "This vehicle already has maintenance " +
                        "during the selected dates."
                });
            }

            var bookings = await AffectedBookingsQuery(
                    vanId, start, endExclusive)
                .AsNoTracking()
                .OrderBy(b => b.DepartureAt)
                .ThenBy(b => b.BookingId)
                .ToListAsync();

            var bookingIds = bookings
                .Select(b => b.BookingId)
                .ToList();

            var journeyBookingIds =
                await GetJourneyBookingIds(bookingIds);

            var journeyIds =
                journeyBookingIds.ToHashSet();

            var cancellationIds = bookings
                .Where(b => !journeyIds.Contains(b.BookingId))
                .Select(b => b.BookingId)
                .ToList();

            return Ok(new
            {
                previewOnly = true,

                plan = new
                {
                    vanId,
                    van.Registration,
                    startDate = start,
                    endDate = end,

                    affectedBookings = bookings.Count,
                    reassignCount = 0,
                    cancellationCount = cancellationIds.Count,
                    manualReviewCount = journeyBookingIds.Count,

                    cancellationBookingIds = cancellationIds,
                    requiresCancellationConfirmation = false,
                    requiresManualReview =
                        journeyBookingIds.Count > 0,

                    canProceedWithoutConfirmation =
                        journeyBookingIds.Count == 0,

                    bookings = bookings.Select(b => new
                    {
                        b.BookingId,
                        b.Status,
                        b.Purpose,
                        b.DepartureAt,
                        b.ReturnAt,
                        b.PassengerCount,

                        originalVanId = vanId,
                        replacementVanId = (int?)null,
                        replacementRegistration = (string?)null,

                        action = journeyIds.Contains(b.BookingId)
                            ? "MANUAL_REVIEW"
                            : "CANCEL"
                    }).ToList()
                }
            });
        }

        // =====================================
        // POST: Schedule maintenance
        //
        // Maintenance has priority.
        // Overlapping bookings are cancelled.
        // No reassignment.
        // No cancellation confirmation needed.
        // =====================================

        [HttpPost("apply")]
        public async Task<IActionResult> ApplyMaintenance(
            [FromBody] ApplyMaintenancePlanRequest request)
        {
            if (request.VanId <= 0 ||
                !IsValidDateRange(
                    request.StartDate,
                    request.EndDate))
            {
                return BadRequest(new
                {
                    message = "Vehicle and valid dates are required."
                });
            }

            if (request.StartDate.Date < DateTime.Today)
            {
                return BadRequest(new
                {
                    message =
                        "Maintenance cannot be scheduled " +
                        "in the past."
                });
            }

            if (string.IsNullOrWhiteSpace(
                request.Description))
            {
                return BadRequest(new
                {
                    message = "Maintenance description is required."
                });
            }

            if (request.Description.Trim().Length > 500)
            {
                return BadRequest(new
                {
                    message =
                        "Maintenance description is too long."
                });
            }

            DateTime start = request.StartDate.Date;
            DateTime end = request.EndDate.Date;
            DateTime endExclusive = end.AddDays(1);

            // =====================================
            // Database transaction and shared lock
            // =====================================

            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var van = await _context.Vans
                .FirstOrDefaultAsync(v =>
                    v.VanId == request.VanId);

            if (van == null)
            {
                return NotFound(new
                {
                    message = "Van not found."
                });
            }

            // A vehicle that is IN_USE today
            // can still have future maintenance.
            bool isAvailable = string.Equals(
                van.AvailabilityStatus,
                "AVAILABLE",
                StringComparison.OrdinalIgnoreCase);

            bool isInUse = string.Equals(
                van.AvailabilityStatus,
                "IN_USE",
                StringComparison.OrdinalIgnoreCase);

            if (!isAvailable &&
                !(isInUse && start > DateTime.Today))
            {
                return Conflict(new
                {
                    message =
                        "This vehicle cannot be scheduled " +
                        "for maintenance in its current status."
                });
            }

            // =====================================
            // Prevent overlapping maintenance
            // =====================================

            if (await HasMaintenanceConflict(
                van.VanId, start, endExclusive))
            {
                return Conflict(new
                {
                    message =
                        "This vehicle already has " +
                        "maintenance during these dates. " +
                        "No changes were saved."
                });
            }

            // =====================================
            // Get affected bookings under the lock
            // =====================================

            var affectedBookings =
                await AffectedBookingsQuery(
                    van.VanId,
                    start,
                    endExclusive)
                .OrderBy(b => b.DepartureAt)
                .ThenBy(b => b.BookingId)
                .ToListAsync();

            var bookingIds = affectedBookings
                .Select(b => b.BookingId)
                .ToList();

            // =====================================
            // Protect bookings with Journeys
            // =====================================

            var journeyBookingIds =
                await GetJourneyBookingIds(bookingIds);

            if (journeyBookingIds.Count > 0)
            {
                return Conflict(new
                {
                    message =
                        "Some affected bookings already " +
                        "have Journeys and cannot be " +
                        "cancelled automatically. " +
                        "No changes were saved.",

                    bookingIdsRequiringManualReview =
                        journeyBookingIds
                });
            }

            // If maintenance starts today, make
            // sure the van is not on an active trip.
            if (start == DateTime.Today)
            {
                bool hasOngoingJourney =
                    await _context.Journeys
                        .AsNoTracking()
                        .AnyAsync(j =>
                            j.VanId == van.VanId &&
                            j.StartedAt != null &&
                            j.EndedAt == null);

                if (hasOngoingJourney)
                {
                    return Conflict(new
                    {
                        message =
                            "This vehicle has an ongoing " +
                            "Journey. No changes were saved."
                    });
                }
            }

            // =====================================
            // Remember cancelled bookings for email
            // =====================================

            var notifications = affectedBookings
                .Select(b => new
                {
                    b.BookingId,
                    b.RequestedByUserId,
                    b.DepartureAt,
                    b.ReturnAt
                })
                .ToList();

            // =====================================
            // Cancel affected bookings
            // =====================================

            foreach (var booking in affectedBookings)
            {
                booking.Status = "CANCELLED";
                booking.AssignedVanId = null;
            }

            // =====================================
            // Schedule maintenance
            // =====================================

            var maintenance = new MaintenanceRecord
            {
                VanId = van.VanId,
                ScheduledDate = start,
                PlannedEndDate = end,
                Description = request.Description.Trim(),
                Status = "SCHEDULED"
            };

            _context.MaintenanceRecords.Add(maintenance);

            // All changes happen together.
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            // =====================================
            // Send cancellation emails
            // after successful commit
            // =====================================

            int emailsSent = 0;
            int emailsFailed = 0;

            foreach (var notice in notifications)
            {
                try
                {
                    var user = await _context.Users
                        .AsNoTracking()
                        .FirstOrDefaultAsync(u =>
                            u.UserId == notice.RequestedByUserId);

                    if (user == null ||
                        string.IsNullOrWhiteSpace(user.Email))
                    {
                        emailsFailed++;

                        Console.Error.WriteLine(
                            "Maintenance cancellation email " +
                            "skipped for Booking #" +
                            notice.BookingId +
                            ": requester email not found.");

                        continue;
                    }

                    string subject =
                        "Vision Fleet - Booking Cancelled " +
                        "Due to Vehicle Maintenance";

                    string message =
                        "Hello " + user.FullName + ",\n\n" +
                        "Your vehicle booking has been " +
                        "cancelled because the vehicle " +
                        "is scheduled for maintenance.\n\n" +

                        "Booking ID: #" + notice.BookingId + "\n" +
                        "Vehicle: " + van.Registration + "\n" +

                        "Booking departure: " +
                        notice.DepartureAt.ToString(
                            "dd MMM yyyy HH:mm") + "\n" +

                        "Booking return: " +
                        notice.ReturnAt.ToString(
                            "dd MMM yyyy HH:mm") + "\n" +

                        "Maintenance start: " +
                        start.ToString("dd MMM yyyy") + "\n" +

                        "Maintenance end: " +
                        end.ToString("dd MMM yyyy") + "\n" +

                        "Booking status: CANCELLED\n\n" +

                        "This cancellation only affects " +
                        "the booking listed above. " +
                        "Other dates in a recurring " +
                        "booking schedule remain unchanged " +
                        "unless they also overlap " +
                        "the maintenance period.\n\n" +

                        "We apologise for any inconvenience.\n\n" +
                        "Vision Fleet System";

                    await _emailService.SendEmailAsync(
                        user.Email,
                        subject,
                        message);

                    emailsSent++;
                }
                catch (Exception ex)
                {
                    emailsFailed++;

                    Console.Error.WriteLine(
                        "Maintenance cancellation email " +
                        "failed for Booking #" +
                        notice.BookingId + ": " +
                        ex.Message);
                }
            }

            // =====================================
            // Return result to React
            // =====================================

            return Ok(new
            {
                message =
                    "Maintenance scheduled successfully.",

                maintenance.MaintenanceId,
                maintenance.VanId,
                van.Registration,

                maintenance.ScheduledDate,
                maintenance.PlannedEndDate,
                maintenance.Status,

                affectedBookingCount =
                    affectedBookings.Count,

                reassignedCount = 0,

                cancelledCount =
                    affectedBookings.Count,

                cancelledBookingIds =
                    bookingIds,

                emailsSent,
                emailsFailed
            });
        }
    }

    // =====================================
    // Maintenance request DTO
    // =====================================

    public class ApplyMaintenancePlanRequest
    {
        [Range(1, int.MaxValue)]
        public int VanId { get; set; }

        public DateTime StartDate { get; set; }

        public DateTime EndDate { get; set; }

        [Required]
        [StringLength(500)]
        public string Description { get; set; } =
            string.Empty;

        // Kept temporarily so the old React
        // request does not break.
        // No longer required by the backend.
        public List<int> CancellationBookingIds
        {
            get;
            set;
        } = new List<int>();
    }
}
