
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VisionFleet.API.Data;

namespace VisionFleet.API.Controllers
{
    [Route("api/vans")]
    [ApiController]
    [Authorize(Roles = "Admin")]
    public class VanScheduleController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;

        public VanScheduleController(
            VisionFleetDbContext context)
        {
            _context = context;
        }

        // =====================================
        // GET: api/vans/{vanId}/calendar
        // Admin only
        // =====================================
        [HttpGet("{vanId:int}/calendar")]
        public async Task<IActionResult> GetVanCalendar(
            int vanId)
        {
            // Find the selected van
            var van = await _context.Vans
                .AsNoTracking()
                .FirstOrDefaultAsync(v => v.VanId == vanId);

            if (van == null)
            {
                return NotFound("Van not found.");
            }

            // Get bookings assigned to this van
            var bookings = await _context.Bookings
                .AsNoTracking()
                .Where(b =>
                    b.AssignedVanId == vanId &&
                    (b.Status == "PENDING" ||
                     b.Status == "APPROVED"))
                .OrderBy(b => b.DepartureAt)
                .Select(b => new
                {
                    b.BookingId,
                    b.Purpose,
                    b.DepartureAt,
                    b.ReturnAt,
                    b.PassengerCount,
                    b.DrivingOption,
                    b.BookingFor,
                    b.RequestedByUserId,
                    RequestedBy = b.RequestedByUser.FullName,
                    b.BookedForUserId,
                    BookedFor = b.BookedForUser.FullName,
                    b.RecurrenceGroupId,
                    b.Status
                })
                .ToListAsync();

            return Ok(new
            {
                vanId = van.VanId,
                registration = van.Registration,
                makeModel = van.MakeModel,
                capacity = van.Capacity,
                bookings
            });
        }
    }
}
