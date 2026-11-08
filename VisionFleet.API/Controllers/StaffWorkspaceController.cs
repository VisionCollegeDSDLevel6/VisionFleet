
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using VisionFleet.API.Data;

namespace VisionFleet.API.Controllers
{
    [Route("api/staff-workspace")]
    [ApiController]
    [Authorize(Roles = "Staff")]
    public class StaffWorkspaceController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;

        public StaffWorkspaceController(
            VisionFleetDbContext context)
        {
            _context = context;
        }

        // =====================================
        // GET: api/staff-workspace/profile
        //
        // Get the logged-in Staff profile.
        // =====================================

        [HttpGet("profile")]
        public async Task<IActionResult> GetProfile()
        {
            var textId = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            if (!int.TryParse(textId, out int userId))
            {
                return Unauthorized();
            }

            var profile = await _context.Users
                .AsNoTracking()
                .Where(u => u.UserId == userId)
                .Select(u => new
                {
                    u.UserId,
                    u.FullName,
                    u.Email,
                    u.Role,
                    u.CanDrive,
                    u.LicenceNumber
                })
                .FirstOrDefaultAsync();

            if (profile == null)
            {
                return Unauthorized();
            }

            return Ok(profile);
        }

        // =====================================
        // GET: api/staff-workspace/available-vans
        //
        // Check vans for a specific time range.
        // The actual booking is still created
        // through BookingsController.
        // =====================================

        [HttpGet("available-vans")]
        public async Task<IActionResult> GetAvailableVans(
            [FromQuery] DateTime departureAt,
            [FromQuery] DateTime returnAt,
            [FromQuery] int passengerCount)
        {
            if (departureAt <= DateTime.Now ||
                returnAt <= departureAt)
            {
                return BadRequest(new
                {
                    message =
                        "Choose a future departure and a later return time."
                });
            }

            if (passengerCount < 1 ||
                passengerCount > 50)
            {
                return BadRequest(new
                {
                    message =
                        "Passenger count must be between 1 and 50."
                });
            }

            // Keep consistent with the legacy
            // availability rule in BookingsController.

            bool hasUnassignedBooking =
                await _context.Bookings.AnyAsync(b =>
                    b.AssignedVanId == null &&
                    (
                        b.Status == "PENDING" ||
                        b.Status == "APPROVED"
                    ) &&
                    b.DepartureAt < returnAt &&
                    b.ReturnAt > departureAt
                );

            if (hasUnassignedBooking)
            {
                return Ok(Array.Empty<object>());
            }

            // Maintenance is scheduled by whole days.
            DateTime firstDay = departureAt.Date;

            DateTime lastDay =
                returnAt.AddTicks(-1).Date;

            var available = await _context.Vans
                .AsNoTracking()
                .Where(v =>
                    v.AvailabilityStatus == "Available" &&
                    v.Capacity >= passengerCount
                )

                // Exclude vans with overlapping bookings.
                .Where(v =>
                    !_context.Bookings.Any(b =>
                        b.AssignedVanId == v.VanId &&
                        (
                            b.Status == "PENDING" ||
                            b.Status == "APPROVED"
                        ) &&
                        b.DepartureAt < returnAt &&
                        b.ReturnAt > departureAt
                    )
                )

                // Exclude maintenance overlaps.
                .Where(v =>
                    !_context.MaintenanceRecords.Any(m =>
                        m.VanId == v.VanId &&
                        (
                            m.Status == "SCHEDULED" ||
                            m.Status == "IN_PROGRESS"
                        ) &&
                        m.ScheduledDate.Date <= lastDay &&
                        (m.PlannedEndDate ??
                         m.ScheduledDate).Date >= firstDay
                    )
                )

                .OrderBy(v => v.Registration)
                .Select(v => new
                {
                    v.VanId,
                    v.Registration,
                    v.MakeModel,
                    v.Capacity,
                    v.AvailabilityStatus
                })
                .ToListAsync();

            return Ok(available);
        }
    }
}
