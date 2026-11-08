
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using VisionFleet.API.Data;
using VisionFleet.API.Models;

namespace VisionFleet.API.Controllers
{
    [Route("api/maintenance-records")]
    [ApiController]
    [Authorize(Roles = "Admin")]
    public class MaintenanceRecordsController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;

        public MaintenanceRecordsController(
            VisionFleetDbContext context)
        {
            _context = context;
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
        // GET: All maintenance records
        // =====================================

        [HttpGet]
        public async Task<IActionResult> GetMaintenanceRecords()
        {
            var records = await _context.MaintenanceRecords
                .AsNoTracking()
                .OrderByDescending(m => m.ScheduledDate)
                .Select(m => new
                {
                    m.MaintenanceId,
                    m.VanId,
                    m.Van.Registration,
                    m.Van.MakeModel,
                    m.ScheduledDate,
                    m.PlannedEndDate,
                    m.Description,
                    m.Status
                })
                .ToListAsync();

            return Ok(records);
        }

        // =====================================
        // GET: One maintenance record
        // =====================================

        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetMaintenanceRecord(
            int id)
        {
            var record = await _context.MaintenanceRecords
                .AsNoTracking()
                .Where(m => m.MaintenanceId == id)
                .Select(m => new
                {
                    m.MaintenanceId,
                    m.VanId,
                    m.Van.Registration,
                    m.Van.MakeModel,
                    m.ScheduledDate,
                    m.PlannedEndDate,
                    m.Description,
                    m.Status
                })
                .FirstOrDefaultAsync();

            if (record == null)
            {
                return NotFound(
                    "Maintenance record not found.");
            }

            return Ok(record);
        }

        // =====================================
        // GET: Maintenance records by van
        // =====================================

        [HttpGet("van/{vanId:int}")]
        public async Task<IActionResult> GetVanMaintenance(
            int vanId)
        {
            bool vanExists = await _context.Vans
                .AsNoTracking()
                .AnyAsync(v => v.VanId == vanId);

            if (!vanExists)
            {
                return NotFound("Van not found.");
            }

            var records = await _context.MaintenanceRecords
                .AsNoTracking()
                .Where(m => m.VanId == vanId)
                .OrderByDescending(m => m.ScheduledDate)
                .Select(m => new
                {
                    m.MaintenanceId,
                    m.VanId,
                    m.Van.Registration,
                    m.Van.MakeModel,
                    m.ScheduledDate,
                    m.PlannedEndDate,
                    m.Description,
                    m.Status
                })
                .ToListAsync();

            return Ok(records);
        }

        // =====================================
        // POST: Schedule maintenance
        //
        // Legacy direct endpoint.
        // New React uses:
        // POST /api/maintenance-planning/apply
        // =====================================

        [HttpPost]
        public async Task<IActionResult> AddMaintenanceRecord(
            [FromBody] AddMaintenanceRequest request)
        {
            if (request.ScheduledDate == default)
            {
                return BadRequest(
                    "A valid start date is required.");
            }

            DateTime startDate =
                request.ScheduledDate.Date;

            DateTime endDate =
                request.PlannedEndDate?.Date ?? startDate;

            if (endDate < startDate)
            {
                return BadRequest(
                    "End date cannot be before start date.");
            }

            if (endDate == DateTime.MaxValue.Date)
            {
                return BadRequest(
                    "Invalid maintenance end date.");
            }

            if (string.IsNullOrWhiteSpace(
                request.Description))
            {
                return BadRequest(
                    "Maintenance description is required.");
            }

            string description =
                request.Description.Trim();

            DateTime endExclusive =
                endDate.AddDays(1);

            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var van = await _context.Vans
                .FirstOrDefaultAsync(v =>
                    v.VanId == request.VanId);

            if (van == null)
            {
                return NotFound("Van not found.");
            }

            if (!string.Equals(
                van.AvailabilityStatus,
                "Available",
                StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(new
                {
                    message =
                        "This vehicle is not currently available."
                });
            }

            bool hasMaintenanceConflict =
                await _context.MaintenanceRecords
                    .AnyAsync(m =>
                        m.VanId == van.VanId &&
                        (m.Status == "SCHEDULED" ||
                         m.Status == "IN_PROGRESS") &&
                        m.ScheduledDate < endExclusive &&
                        (m.PlannedEndDate ??
                         m.ScheduledDate) >= startDate);

            if (hasMaintenanceConflict)
            {
                return Conflict(new
                {
                    message =
                        "This vehicle already has maintenance " +
                        "during the selected dates."
                });
            }

            var conflictingBookings =
                await _context.Bookings
                    .AsNoTracking()
                    .Where(b =>
                        b.AssignedVanId == van.VanId &&
                        (b.Status == "PENDING" ||
                         b.Status == "APPROVED") &&
                        b.DepartureAt < endExclusive &&
                        b.ReturnAt > startDate)
                    .OrderBy(b => b.DepartureAt)
                    .Select(b => new
                    {
                        b.BookingId,
                        b.DepartureAt,
                        b.ReturnAt,
                        b.PassengerCount,
                        b.Status,
                        b.Purpose
                    })
                    .ToListAsync();

            if (conflictingBookings.Count > 0)
            {
                return Conflict(new
                {
                    message =
                        "The selected maintenance dates " +
                        "overlap existing bookings. " +
                        "Use Maintenance Planning to " +
                        "cancel affected bookings automatically.",
                    conflictingBookings
                });
            }

            var record = new MaintenanceRecord
            {
                VanId = van.VanId,
                ScheduledDate = startDate,
                PlannedEndDate = endDate,
                Description = description,
                Status = "Sheduled"
            };

            _context.MaintenanceRecords.Add(record);

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return CreatedAtAction(
                nameof(GetMaintenanceRecord),
                new { id = record.MaintenanceId },
                new
                {
                    record.MaintenanceId,
                    record.VanId,
                    van.Registration,
                    van.MakeModel,
                    record.ScheduledDate,
                    record.PlannedEndDate,
                    record.Description,
                    record.Status
                });
        }

        // =====================================
        // PUT: Start maintenance
        //
        // Only block bookings overlapping
        // the actual maintenance period.
        // =====================================

        [HttpPut("{id:int}/start")]
        public async Task<IActionResult> StartMaintenance(
            int id)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var record = await _context.MaintenanceRecords
                .FindAsync(id);

            if (record == null)
            {
                return NotFound(
                    "Maintenance record not found.");
            }

            if (record.Status != "SCHEDULED")
            {
                return Conflict(new
                {
                    message =
                        "Only scheduled maintenance can be started."
                });
            }

            var van = await _context.Vans
                .FindAsync(record.VanId);

            if (van == null)
            {
                return NotFound("Van not found.");
            }

            if (!string.Equals(
                van.AvailabilityStatus,
                "Available",
                StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(new
                {
                    message =
                        "This van is not currently available."
                });
            }

            // =====================================
            // Check maintenance dates
            // =====================================

            DateTime now = DateTime.Now;
            DateTime today = now.Date;

            DateTime startDate =
                record.ScheduledDate.Date;

            DateTime endDate =
                record.PlannedEndDate?.Date ??
                startDate;

            if (endDate < startDate ||
                endDate == DateTime.MaxValue.Date)
            {
                return Conflict(new
                {
                    message =
                        "Invalid maintenance date range."
                });
            }

            if (today < startDate)
            {
                return Conflict(new
                {
                    message =
                        "Maintenance has not reached " +
                        "its scheduled start date.",
                    scheduledStartDate = startDate
                });
            }

            if (today > endDate)
            {
                return Conflict(new
                {
                    message =
                        "The scheduled maintenance period " +
                        "has already passed.",
                    scheduledEndDate = endDate
                });
            }

            DateTime endExclusive =
                endDate.AddDays(1);

            // =====================================
            // Check other active maintenance
            // =====================================

            bool hasActiveMaintenance =
                await _context.MaintenanceRecords
                    .AnyAsync(m =>
                        m.VanId == van.VanId &&
                        m.MaintenanceId != id &&
                        m.Status == "IN_PROGRESS");

            if (hasActiveMaintenance)
            {
                return Conflict(new
                {
                    message =
                        "This van already has " +
                        "maintenance in progress."
                });
            }

            // =====================================
            // Check overlapping bookings ONLY
            //
            // Example:
            // Maintenance 27/10 - 28/10
            //
            // Booking 27/10 -> BLOCK
            // Booking 28/10 -> BLOCK
            // Booking 15/11 -> ALLOW
            //
            // CANCELLED bookings are ignored.
            // =====================================

            var conflictingBookings =
                await _context.Bookings
                    .AsNoTracking()
                    .Where(b =>
                        b.AssignedVanId == van.VanId &&
                        (b.Status == "PENDING" ||
                         b.Status == "APPROVED") &&
                        b.DepartureAt < endExclusive &&
                        b.ReturnAt > now)
                    .OrderBy(b => b.DepartureAt)
                    .Select(b => new
                    {
                        b.BookingId,
                        b.DepartureAt,
                        b.ReturnAt,
                        b.Status
                    })
                    .ToListAsync();

            if (conflictingBookings.Count > 0)
            {
                return Conflict(new
                {
                    message =
                        "This van has bookings overlapping " +
                        "the maintenance period. " +
                        "Resolve these bookings before starting.",
                    conflictingBookings
                });
            }

            // =====================================
            // Check ongoing journeys
            // =====================================

            bool hasOngoingJourney =
                await _context.Journeys
                    .AnyAsync(j =>
                        j.VanId == van.VanId &&
                        j.EndedAt == null &&
                        (j.StartedAt != null ||
                         j.Status == "IN_PROGRESS" ||
                         j.Status == "ACTIVE" ||
                         j.Status == "STARTED"));

            if (hasOngoingJourney)
            {
                return Conflict(new
                {
                    message =
                        "This van has an ongoing journey. " +
                        "Finish the journey before " +
                        "starting maintenance."
                });
            }

            // =====================================
            // Start maintenance
            // =====================================

            record.Status = "IN_PROGRESS";
            van.AvailabilityStatus = "MAINTENANCE";

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new
            {
                message =
                    "Maintenance started successfully",

                record.MaintenanceId,
                record.VanId,
                van.Registration,

                maintenanceStatus = record.Status,
                vanStatus = van.AvailabilityStatus
            });
        }

        // =====================================
        // PUT: Finish maintenance
        // =====================================

        [HttpPut("{id:int}/finish")]
        public async Task<IActionResult> FinishMaintenance(
            int id)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var record = await _context.MaintenanceRecords
                .FindAsync(id);

            if (record == null)
            {
                return NotFound(
                    "Maintenance record not found.");
            }

            if (record.Status != "IN_PROGRESS")
            {
                return Conflict(new
                {
                    message =
                        "Only maintenance in progress " +
                        "can be finished."
                });
            }

            var van = await _context.Vans
                .FindAsync(record.VanId);

            if (van == null)
            {
                return NotFound("Van not found.");
            }

            if (!string.Equals(
                van.AvailabilityStatus,
                "MAINTENANCE",
                StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(new
                {
                    message =
                        "Van status is not MAINTENANCE. " +
                        "Please review the vehicle status."
                });
            }

            bool hasOtherActiveMaintenance =
                await _context.MaintenanceRecords
                    .AnyAsync(m =>
                        m.VanId == van.VanId &&
                        m.MaintenanceId != id &&
                        m.Status == "IN_PROGRESS");

            record.Status = "DONE";

            if (!hasOtherActiveMaintenance)
            {
                van.AvailabilityStatus = "Available";
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new
            {
                message =
                    "Maintenance finished successfully",

                record.MaintenanceId,
                record.VanId,
                van.Registration,

                maintenanceStatus = record.Status,
                vanStatus = van.AvailabilityStatus
            });
        }
    }

    // =====================================
    // DTO: Schedule maintenance request
    // =====================================

    public class AddMaintenanceRequest
    {
        [Range(1, int.MaxValue)]
        public int VanId { get; set; }

        public DateTime ScheduledDate { get; set; }

        public DateTime? PlannedEndDate { get; set; }

        [Required]
        [StringLength(500)]
        public string Description { get; set; } =
            string.Empty;
    }
}
