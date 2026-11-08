
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VisionFleet.API.Data;

namespace VisionFleet.API.Controllers
{
    [Route("api/bookings/availability")]
    [ApiController]
    [Authorize(Roles = "Admin,Staff")]
    public class BookingAvailabilityController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;

        public BookingAvailabilityController(
            VisionFleetDbContext context)
        {
            _context = context;
        }

        // =====================================
        // GET: api/bookings/availability
        // Check available vans by date and time
        // =====================================
        [HttpGet]
        public async Task<IActionResult> CheckAvailability(
            [FromQuery] DateTime departureAt,
            [FromQuery] DateTime returnAt,
            [FromQuery] int passengerCount)
        {
            // Validate passenger count
            if (passengerCount <= 0)
            {
                return BadRequest(
                    "Passenger count must be greater than zero.");
            }

            // Validate dates
            if (departureAt == default ||
                returnAt <= departureAt)
            {
                return BadRequest(
                    "Return date must be after departure date.");
            }

            // Check old bookings without assigned vans
            bool hasOldBooking = await _context.Bookings
                .AnyAsync(b =>
                    b.AssignedVanId == null &&
                    (b.Status == "PENDING" ||
                     b.Status == "APPROVED") &&
                    b.DepartureAt < returnAt &&
                    b.ReturnAt > departureAt);

            if (hasOldBooking)
            {
                return Ok(new
                {
                    available = false,
                    message = "No vans available. " +
                              "Please choose another date or time."
                });
            }

            // Find vans with enough seats
            var vans = await _context.Vans
                .Where(v =>
                    v.AvailabilityStatus == "Available" &&
                    v.Capacity >= passengerCount)
                .OrderBy(v => v.Capacity)
                .ToListAsync();

            // Check each van's existing bookings
            foreach (var van in vans)
            {
                bool isBooked = await _context.Bookings
                    .AnyAsync(b =>
                        b.AssignedVanId == van.VanId &&
                        (b.Status == "PENDING" ||
                         b.Status == "APPROVED") &&
                        b.DepartureAt < returnAt &&
                        b.ReturnAt > departureAt);

                if (!isBooked)
                {
                    return Ok(new
                    {
                        available = true,
                        message = "A van is available " +
                                  "for the selected date and time."
                    });
                }
            }

            return Ok(new
            {
                available = false,
                message = "No vans available. " +
                          "Please choose another date or time."
            });
        }
    }
}
