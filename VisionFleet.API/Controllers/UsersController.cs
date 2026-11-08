
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using VisionFleet.API.Data;
using VisionFleet.API.Models;

namespace VisionFleet.API.Controllers
{
    [ApiController]
    [Route("api/users")]
    [Authorize(Roles = "Admin")]
    public class UsersController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;
        private readonly IPasswordHasher<User> _passwordHasher;

        public UsersController(
            VisionFleetDbContext context,
            IPasswordHasher<User> passwordHasher)
        {
            _context = context;
            _passwordHasher = passwordHasher;
        }

        private static string NormalizeRole(string? value)
        {
            return (value ?? "").Trim().ToUpperInvariant() switch
            {
                "ADMIN" => "Admin",
                "STAFF" => "Staff",
                "DRIVER" => "Driver",
                _ => ""
            };
        }

        private int? CurrentUserId()
        {
            string? claim = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            return int.TryParse(claim, out int id)
                ? id
                : null;
        }

        // =====================================
        // GET ALL USERS
        // =====================================

        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _context.Users
                .AsNoTracking()
                .OrderBy(u => u.FullName)
                .Select(u => new
                {
                    u.UserId,
                    u.FullName,
                    u.Email,
                    u.Role,
                    u.CanDrive,
                    u.LicenceNumber
                })
                .ToListAsync();

            return Ok(users);
        }

        // =====================================
        // GET STAFF
        // =====================================

        [HttpGet("staff")]
        public async Task<IActionResult> GetStaff()
        {
            var staff = await _context.Users
                .AsNoTracking()
                .Where(u => u.Role.ToUpper() == "STAFF")
                .OrderBy(u => u.FullName)
                .Select(u => new
                {
                    u.UserId,
                    u.FullName,
                    u.Email,
                    u.Role,
                    u.CanDrive,
                    u.LicenceNumber
                })
                .ToListAsync();

            return Ok(staff);
        }

        // =====================================
        // GET DRIVERS
        // =====================================

        [HttpGet("drivers")]
        public async Task<IActionResult> GetDrivers()
        {
            var drivers = await _context.Users
                .AsNoTracking()
                .Where(u => u.Role.ToUpper() == "DRIVER")
                .OrderBy(u => u.FullName)
                .Select(u => new
                {
                    u.UserId,
                    u.FullName,
                    u.Email,
                    u.Role,
                    u.CanDrive,
                    u.LicenceNumber
                })
                .ToListAsync();

            return Ok(drivers);
        }

        // =====================================
        // GET USER BY ID
        // =====================================

        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetUser(int id)
        {
            var user = await _context.Users
                .AsNoTracking()
                .Where(u => u.UserId == id)
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

            if (user == null)
            {
                return NotFound(new
                {
                    message = "User not found."
                });
            }

            return Ok(user);
        }

        // =====================================
        // CREATE USER
        // Admin / Staff / Driver
        // =====================================

        [HttpPost]
        public async Task<IActionResult> CreateUser(
            [FromBody] CreateUserRequest request)
        {
            return await CreateUserCore(request);
        }

        // Compatible with older frontend.
        [HttpPost("staff")]
        public async Task<IActionResult> CreateStaff(
            [FromBody] CreateStaffRequest request)
        {
            return await CreateUserCore(new CreateUserRequest
            {
                FullName = request.FullName,
                Email = request.Email,
                Password = request.Password,
                Role = "Staff",
                CanDrive = request.CanDrive
            });
        }

        private async Task<IActionResult> CreateUserCore(
            CreateUserRequest request)
        {
            string name = (request.FullName ?? "").Trim();
            string email = (request.Email ?? "").Trim();
            string role = NormalizeRole(request.Role);
            string? licence = request.LicenceNumber?.Trim();

            if (name.Length < 1 || name.Length > 120)
            {
                return BadRequest(new
                {
                    message = "Full name must contain 1 to 120 characters."
                });
            }

            if (email.Length > 255 ||
                !new EmailAddressAttribute().IsValid(email))
            {
                return BadRequest(new
                {
                    message = "Enter a valid email address."
                });
            }

            if (string.IsNullOrWhiteSpace(request.Password) ||
                request.Password.Length < 8)
            {
                return BadRequest(new
                {
                    message = "Password must contain at least 8 characters."
                });
            }

            if (role == "")
            {
                return BadRequest(new
                {
                    message = "Role must be Admin, Staff or Driver."
                });
            }

            if (licence?.Length > 50)
            {
                return BadRequest(new
                {
                    message = "Licence number cannot exceed 50 characters."
                });
            }

            string normalizedEmail = email.ToLowerInvariant();

            bool exists = await _context.Users
                .AnyAsync(u =>
                    u.Email.ToLower() == normalizedEmail);

            if (exists)
            {
                return Conflict(new
                {
                    message = "An account with this email already exists."
                });
            }

            var user = new User
            {
                FullName = name,
                Email = email,
                Role = role,

                // Dedicated Driver accounts always
                // have driving permission.
                CanDrive = role == "Driver" ||
                           request.CanDrive,

                LicenceNumber =
                    string.IsNullOrWhiteSpace(licence)
                        ? null
                        : licence
            };

            user.PasswordHash =
                _passwordHasher.HashPassword(
                    user,
                    request.Password);

            _context.Users.Add(user);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Conflict(new
                {
                    message = "Unable to create this user. Check database constraints."
                });
            }

            return Ok(new
            {
                message = "User created successfully.",
                user.UserId,
                user.FullName,
                user.Email,
                user.Role,
                user.CanDrive,
                user.LicenceNumber
            });
        }

        // =====================================
        // UPDATE USER
        // =====================================

        [HttpPut("{id:int}")]
        public async Task<IActionResult> UpdateUser(
            int id,
            [FromBody] UpdateUserRequest request)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
            {
                return NotFound(new
                {
                    message = "User not found."
                });
            }

            string name = (request.FullName ?? "").Trim();
            string email = (request.Email ?? "").Trim();
            string role = NormalizeRole(request.Role);
            string? licence = request.LicenceNumber?.Trim();

            if (name.Length < 1 || name.Length > 120)
            {
                return BadRequest(new
                {
                    message = "Full name must contain 1 to 120 characters."
                });
            }

            if (email.Length > 255 ||
                !new EmailAddressAttribute().IsValid(email))
            {
                return BadRequest(new
                {
                    message = "Enter a valid email address."
                });
            }

            if (role == "")
            {
                return BadRequest(new
                {
                    message = "Role must be Admin, Staff or Driver."
                });
            }

            if (licence?.Length > 50)
            {
                return BadRequest(new
                {
                    message = "Licence number cannot exceed 50 characters."
                });
            }

            string normalizedEmail = email.ToLowerInvariant();

            bool duplicate = await _context.Users.AnyAsync(u =>
                u.UserId != id &&
                u.Email.ToLower() == normalizedEmail);

            if (duplicate)
            {
                return Conflict(new
                {
                    message = "Another account already uses this email."
                });
            }

            bool wasAdmin =
                user.Role.ToUpper() == "ADMIN";

            bool removingAdmin =
                wasAdmin && role != "Admin";

            // Protect current and last Admin.
            if (removingAdmin)
            {
                if (CurrentUserId() == id)
                {
                    return Conflict(new
                    {
                        message = "You cannot remove your own Admin role."
                    });
                }

                int adminCount = await _context.Users
                    .CountAsync(u =>
                        u.Role.ToUpper() == "ADMIN");

                if (adminCount <= 1)
                {
                    return Conflict(new
                    {
                        message = "The system must have at least one Admin."
                    });
                }
            }

            DateTime now = DateTime.Now;

            bool wasDriver =
                user.Role.ToUpper() == "DRIVER";

            bool removingDriverRole =
                wasDriver && role != "Driver";

            bool newCanDrive =
                role == "Driver" || request.CanDrive;

            bool disablingDriving =
                user.CanDrive && !newCanDrive;

            // Protect future and active assignments.
            if (removingDriverRole || disablingDriving)
            {
                bool hasAssignedTrips =
                    await _context.Journeys.AnyAsync(j =>
                        j.DriverUserId == id &&
                        (
                            j.Status == "IN_PROGRESS" ||
                            (
                                j.Status == "SCHEDULED" &&
                                j.Booking.Status == "APPROVED" &&
                                j.Booking.ReturnAt > now
                            )
                        ));

                if (hasAssignedTrips)
                {
                    return Conflict(new
                    {
                        message =
                            "This user has active or upcoming assigned trips. " +
                            "Reassign them before changing the role or driving permission."
                    });
                }
            }

            if (disablingDriving || role == "Driver")
            {
                // A user with a self-drive booking
                // must retain an eligible account.
                bool hasSelfDrive = await _context.Bookings
                    .AnyAsync(b =>
                        b.BookedForUserId == id &&
                        b.DrivingOption == "SELF_DRIVE" &&
                        (
                            b.Status == "PENDING" ||
                            b.Status == "APPROVED"
                        ) &&
                        b.ReturnAt > now);

                if (hasSelfDrive &&
                    (disablingDriving || role == "Driver"))
                {
                    return Conflict(new
                    {
                        message =
                            "This user has active or future Self Drive bookings. " +
                            "Resolve these before changing the account."
                    });
                }
            }

            user.FullName = name;
            user.Email = email;
            user.Role = role;
            user.CanDrive = newCanDrive;
            user.LicenceNumber =
                string.IsNullOrWhiteSpace(licence)
                    ? null
                    : licence;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Conflict(new
                {
                    message = "Unable to update user. Check database constraints."
                });
            }

            return Ok(new
            {
                message = "User updated successfully.",
                user.UserId,
                user.FullName,
                user.Email,
                user.Role,
                user.CanDrive,
                user.LicenceNumber
            });
        }

        // =====================================
        // RESET PASSWORD
        // =====================================

        [HttpPut("{id:int}/password")]
        public async Task<IActionResult> ResetPassword(
            int id,
            [FromBody] ResetUserPasswordRequest request)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
            {
                return NotFound(new
                {
                    message = "User not found."
                });
            }

            if (string.IsNullOrWhiteSpace(request.NewPassword) ||
                request.NewPassword.Length < 8)
            {
                return BadRequest(new
                {
                    message = "Password must contain at least 8 characters."
                });
            }

            user.PasswordHash =
                _passwordHasher.HashPassword(
                    user,
                    request.NewPassword);

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Password reset successfully."
            });
        }

        // =====================================
        // DELETE USER
        // =====================================

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
            {
                return NotFound(new
                {
                    message = "User not found."
                });
            }

            if (CurrentUserId() == id)
            {
                return Conflict(new
                {
                    message = "You cannot delete your own account."
                });
            }

            if (user.Role.ToUpper() == "ADMIN")
            {
                int adminCount = await _context.Users
                    .CountAsync(u =>
                        u.Role.ToUpper() == "ADMIN");

                if (adminCount <= 1)
                {
                    return Conflict(new
                    {
                        message = "Cannot delete the last Admin account."
                    });
                }
            }

            bool hasBookings =
                await _context.Bookings.AnyAsync(b =>
                    b.RequestedByUserId == id ||
                    b.BookedForUserId == id);

            bool hasJourneys =
                await _context.Journeys.AnyAsync(j =>
                    j.DriverUserId == id);

            if (hasBookings || hasJourneys)
            {
                return Conflict(new
                {
                    message =
                        "This user has Booking or Journey history " +
                        "and cannot be permanently deleted."
                });
            }

            _context.Users.Remove(user);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return Conflict(new
                {
                    message =
                        "This account is referenced by other records."
                });
            }

            return Ok(new
            {
                message = "User deleted successfully.",
                userId = id
            });
        }
    }

    // =====================================
    // REQUEST DTOs
    // =====================================

    public class CreateUserRequest
    {
        [Required]
        [StringLength(120)]
        public string FullName { get; set; } = "";

        [Required]
        [EmailAddress]
        [StringLength(255)]
        public string Email { get; set; } = "";

        [Required]
        [MinLength(8)]
        public string Password { get; set; } = "";

        [Required]
        public string Role { get; set; } = "Staff";

        public bool CanDrive { get; set; }

        [StringLength(50)]
        public string? LicenceNumber { get; set; }
    }

    public class CreateStaffRequest
    {
        [Required]
        [StringLength(120)]
        public string FullName { get; set; } = "";

        [Required]
        [EmailAddress]
        [StringLength(255)]
        public string Email { get; set; } = "";

        [Required]
        [MinLength(8)]
        public string Password { get; set; } = "";

        public bool CanDrive { get; set; }
    }

    public class UpdateUserRequest
    {
        [Required]
        [StringLength(120)]
        public string FullName { get; set; } = "";

        [Required]
        [EmailAddress]
        [StringLength(255)]
        public string Email { get; set; } = "";

        [Required]
        public string Role { get; set; } = "Staff";

        public bool CanDrive { get; set; }

        [StringLength(50)]
        public string? LicenceNumber { get; set; }
    }

    public class ResetUserPasswordRequest
    {
        [Required]
        [MinLength(8)]
        public string NewPassword { get; set; } = "";
    }
}
