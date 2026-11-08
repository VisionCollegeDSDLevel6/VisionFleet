
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using VisionFleet.API.Data;
using VisionFleet.API.Models;

namespace VisionFleet.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class VansController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;

        public VansController(VisionFleetDbContext context)
        {
            _context = context;
        }

        // GET: api/vans
        [HttpGet]
        public async Task<IActionResult> GetVans()
        {
            var vans = await _context.Vans
                .AsNoTracking()
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

            return Ok(vans);
        }

        // GET: api/vans/{id}
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetVan(int id)
        {
            var van = await _context.Vans
                .AsNoTracking()
                .Where(v => v.VanId == id)
                .Select(v => new
                {
                    v.VanId,
                    v.Registration,
                    v.MakeModel,
                    v.Capacity,
                    v.AvailabilityStatus
                })
                .FirstOrDefaultAsync();

            if (van == null)
                return NotFound(new
                {
                    message = "Van not found."
                });

            return Ok(van);
        }

        // POST: api/vans
        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> AddVan(
            [FromBody] AddVanRequest request)
        {
            string registration =
                (request.Registration ?? "").Trim();

            string makeModel =
                (request.MakeModel ?? "").Trim();

            if (string.IsNullOrWhiteSpace(registration) ||
                string.IsNullOrWhiteSpace(makeModel))
            {
                return BadRequest(new
                {
                    message = "Vehicle details are required."
                });
            }

            bool exists = await _context.Vans
                .AnyAsync(v =>
                    v.Registration == registration);

            if (exists)
            {
                return Conflict(new
                {
                    message = "Registration already exists."
                });
            }

            var van = new Van
            {
                Registration = registration,
                MakeModel = makeModel,
                Capacity = request.Capacity,
                AvailabilityStatus = "AVAILABLE"
            };

            _context.Vans.Add(van);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Conflict(new
                {
                    message = "Unable to add this vehicle."
                });
            }

            return CreatedAtAction(
                nameof(GetVan),
                new { id = van.VanId },
                new
                {
                    van.VanId,
                    van.Registration,
                    van.MakeModel,
                    van.Capacity,
                    van.AvailabilityStatus
                }
            );
        }

        // PUT: api/vans/{id}
        [HttpPut("{id:int}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> EditVan(
            int id,
            [FromBody] EditVanRequest request)
        {
            var van = await _context.Vans.FindAsync(id);

            if (van == null)
            {
                return NotFound(new
                {
                    message = "Van not found."
                });
            }

            string registration =
                (request.Registration ?? "").Trim();

            string makeModel =
                (request.MakeModel ?? "").Trim();

            if (string.IsNullOrWhiteSpace(registration) ||
                string.IsNullOrWhiteSpace(makeModel))
            {
                return BadRequest(new
                {
                    message = "Vehicle details are required."
                });
            }

            bool exists = await _context.Vans
                .AnyAsync(v =>
                    v.Registration == registration &&
                    v.VanId != id);

            if (exists)
            {
                return Conflict(new
                {
                    message = "Registration already exists."
                });
            }

            van.Registration = registration;
            van.MakeModel = makeModel;
            van.Capacity = request.Capacity;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Conflict(new
                {
                    message = "Unable to update this vehicle."
                });
            }

            return Ok(new
            {
                message = "Van updated successfully.",
                van.VanId,
                van.Registration,
                van.MakeModel,
                van.Capacity,
                van.AvailabilityStatus
            });
        }

        // =====================================
        // DELETE: api/vans/{id}
        // ADMIN ONLY
        //
        // Only delete a van when it has
        // NO related records in the database.
        // =====================================

        [HttpDelete("{id:int}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DeleteVan(int id)
        {
            var van = await _context.Vans.FindAsync(id);

            if (van == null)
            {
                return NotFound(new
                {
                    message = "Van not found."
                });
            }

            // Protect booking history.
            bool hasBookings = await _context.Bookings
                .AnyAsync(b => b.AssignedVanId == id);

            // Protect journey history.
            bool hasJourneys = await _context.Journeys
                .AnyAsync(j => j.VanId == id);

            // Protect maintenance history.
            bool hasMaintenance =
                await _context.MaintenanceRecords
                    .AnyAsync(m => m.VanId == id);

            if (hasBookings || hasJourneys || hasMaintenance)
            {
                return Conflict(new
                {
                    message =
                        "This van has booking, journey or " +
                        "maintenance records and cannot be " +
                        "permanently deleted."
                });
            }

            _context.Vans.Remove(van);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Conflict(new
                {
                    message =
                        "This van is referenced by other " +
                        "records and cannot be deleted."
                });
            }

            return Ok(new
            {
                message = "Van deleted successfully.",
                vanId = id,
                permanentlyDeleted = true
            });
        }
    }

    public class AddVanRequest
    {
        [Required]
        public string Registration { get; set; }
            = string.Empty;

        [Required]
        public string MakeModel { get; set; }
            = string.Empty;

        [Range(1, 50)]
        public int Capacity { get; set; }
    }

    public class EditVanRequest
    {
        [Required]
        public string Registration { get; set; }
            = string.Empty;

        [Required]
        public string MakeModel { get; set; }
            = string.Empty;

        [Range(1, 50)]
        public int Capacity { get; set; }
    }
}
