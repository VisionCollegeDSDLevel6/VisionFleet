
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using VisionFleet.API.Data;
using VisionFleet.API.Models;
using VisionFleet.API.Services;

namespace VisionFleet.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class BookingsController : ControllerBase
    {
        private readonly VisionFleetDbContext _context;
        private readonly EmailService _emailService;

        public BookingsController(
            VisionFleetDbContext context,
            EmailService emailService)
        {
            _context = context;
            _emailService = emailService;
        }

        // =====================================
        // Email helper
        // =====================================

        private async Task<bool> TrySendEmail(
            string recipient,
            string subject,
            string message)
        {
            if (string.IsNullOrWhiteSpace(recipient))
            {
                return false;
            }

            try
            {
                await _emailService.SendEmailAsync(
                    recipient,
                    subject,
                    message);

                return true;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(
                    "Email could not be sent: " + ex.Message);

                return false;
            }
        }

        // =====================================
        // Get van display name
        // =====================================

        private async Task<string> GetVanDisplayName(
            int? vanId)
        {
            if (vanId == null)
            {
                return "No van assigned";
            }

            var van = await _context.Vans.FindAsync(
                vanId.Value);

            if (van == null)
            {
                return "Van ID: " + vanId.Value;
            }

            return van.Registration + " - " + van.MakeModel;
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
        // Find available van
        // Checks bookings and maintenance
        // =====================================

        private async Task<Van?> FindAvailableVan(
            DateTime departureAt,
            DateTime returnAt,
            int passengerCount,
            int excludedBookingId = 0)
        {
            bool hasOldBooking = await _context.Bookings
                .AnyAsync(b =>
                    b.BookingId != excludedBookingId &&
                    b.AssignedVanId == null &&
                    (b.Status == "PENDING" ||
                     b.Status == "APPROVED") &&
                    b.DepartureAt < returnAt &&
                    b.ReturnAt > departureAt);

            if (hasOldBooking)
            {
                return null;
            }

            DateTime firstBookingDate =
                departureAt.Date;

            DateTime lastBookingDate =
                returnAt.AddTicks(-1).Date;

            var vans = await _context.Vans
                .Where(v =>
                    v.AvailabilityStatus == "AVAILABLE" &&
                    v.Capacity >= passengerCount)
                .OrderBy(v => Guid.NewGuid())
                .ToListAsync();

            foreach (var van in vans)
            {
                bool isBooked = await _context.Bookings
                    .AnyAsync(b =>
                        b.BookingId != excludedBookingId &&
                        b.AssignedVanId == van.VanId &&
                        (b.Status == "PENDING" ||
                         b.Status == "APPROVED") &&
                        b.DepartureAt < returnAt &&
                        b.ReturnAt > departureAt);

                if (isBooked)
                {
                    continue;
                }

                bool hasMaintenance =
                    await _context.MaintenanceRecords
                        .AnyAsync(m =>
                            m.VanId == van.VanId &&
                            (m.Status == "SCHEDULED" ||
                             m.Status == "IN_PROGRESS") &&
                            m.ScheduledDate.Date <=
                                lastBookingDate &&
                            (m.PlannedEndDate ??
                             m.ScheduledDate).Date >=
                                firstBookingDate);

                if (hasMaintenance)
                {
                    continue;
                }

                return van;
            }

            return null;
        }

        // =====================================
        // GET: api/bookings
        // =====================================

        [HttpGet]
        [Authorize(Roles = "Admin,Staff")]
        public async Task<IActionResult> GetBookings()
        {
            string? userIdText = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            if (!int.TryParse(userIdText, out int userId))
            {
                return Unauthorized();
            }

            var query = _context.Bookings.AsNoTracking();

            if (!User.IsInRole("Admin"))
            {
                query = query.Where(b =>
                    b.RequestedByUserId == userId ||
                    b.BookedForUserId == userId);
            }

            var bookings = await query
                .OrderBy(b => b.DepartureAt)
                .Select(b => new
                {
                    b.BookingId,
                    b.RequestedByUserId,
                    b.BookedForUserId,
                    b.BookingFor,
                    b.DrivingOption,
                    b.Purpose,
                    b.DepartureAt,
                    b.ReturnAt,
                    b.PassengerCount,
                    b.AssignedVanId,
                    b.RecurrenceGroupId,
                    b.Status
                })
                .ToListAsync();

            return Ok(bookings);
        }

        // =====================================
        // GET: api/bookings/{id}
        // =====================================

        [HttpGet("{id:int}")]
        [Authorize(Roles = "Admin,Staff")]
        public async Task<IActionResult> GetBooking(int id)
        {
            string? userIdText = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            if (!int.TryParse(userIdText, out int userId))
            {
                return Unauthorized();
            }

            var query = _context.Bookings
                .AsNoTracking()
                .Where(b => b.BookingId == id);

            if (!User.IsInRole("Admin"))
            {
                query = query.Where(b =>
                    b.RequestedByUserId == userId ||
                    b.BookedForUserId == userId);
            }

            var booking = await query
                .Select(b => new
                {
                    b.BookingId,
                    b.RequestedByUserId,
                    b.BookedForUserId,
                    b.BookingFor,
                    b.DrivingOption,
                    b.Purpose,
                    b.DepartureAt,
                    b.ReturnAt,
                    b.PassengerCount,
                    b.AssignedVanId,
                    b.RecurrenceGroupId,
                    b.Status
                })
                .FirstOrDefaultAsync();

            if (booking == null)
            {
                return NotFound("Booking not found.");
            }

            return Ok(booking);
        }

        // =====================================
        // POST: api/bookings
        // Create one-time or recurring bookings
        // =====================================

        [HttpPost]
        [Authorize(Roles = "Admin,Staff")]
        public async Task<IActionResult> CreateBooking(
            [FromBody] CreateBookingRequest request)
        {
            string? userIdText = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            if (!int.TryParse(userIdText, out int userId))
            {
                return Unauthorized();
            }

            var currentUser = await _context.Users
                .FindAsync(userId);

            if (currentUser == null)
            {
                return Unauthorized();
            }

            if (request.ReturnAt <= request.DepartureAt)
            {
                return BadRequest(
                    "Return date must be after departure date.");
            }

            string purpose = request.Purpose.Trim();

            if (string.IsNullOrWhiteSpace(purpose))
            {
                return BadRequest("Purpose is required.");
            }

            int bookedForUserId =
                request.BookedForUserId ?? userId;

            var bookedForUser = await _context.Users
                .FindAsync(bookedForUserId);

            if (bookedForUser == null)
            {
                return BadRequest(
                    "Booked-for user does not exist.");
            }

            string bookingFor =
                bookedForUserId == userId
                    ? "SELF"
                    : "OTHER";

            string drivingOption =
                request.DrivingOption.Trim();

            if (drivingOption != "SELF_DRIVE" &&
                drivingOption != "DRIVER_REQUIRED")
            {
                return BadRequest(
                    "Invalid driving option.");
            }

            if (drivingOption == "SELF_DRIVE" &&
                !bookedForUser.CanDrive)
            {
                return BadRequest(
                    "The booked-for user cannot self-drive.");
            }

            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            Guid? groupId = request.RepeatWeeks > 1
                ? Guid.NewGuid()
                : null;

            var createdBookings = new List<Booking>();
            var skippedDates = new List<DateTime>();

            for (
                int week = 0;
                week < request.RepeatWeeks;
                week++)
            {
                DateTime departure =
                    request.DepartureAt.AddDays(7 * week);

                DateTime returnTime =
                    request.ReturnAt.AddDays(7 * week);

                var van = await FindAvailableVan(
                    departure,
                    returnTime,
                    request.PassengerCount);

                if (van == null)
                {
                    skippedDates.Add(departure);
                    continue;
                }

                var booking = new Booking
                {
                    RequestedByUserId = userId,
                    BookedForUserId = bookedForUserId,
                    BookingFor = bookingFor,
                    DrivingOption = drivingOption,
                    Purpose = purpose,
                    DepartureAt = departure,
                    ReturnAt = returnTime,
                    PassengerCount = request.PassengerCount,
                    AssignedVanId = van.VanId,
                    RecurrenceGroupId = groupId,
                    Status = "PENDING"
                };

                _context.Bookings.Add(booking);

                await _context.SaveChangesAsync();

                createdBookings.Add(booking);
            }

            if (createdBookings.Count == 0)
            {
                await transaction.RollbackAsync();

                return Conflict(new
                {
                    message = "No vans available.",
                    skippedDates
                });
            }

            await transaction.CommitAsync();

            // =====================================
            // Booking confirmation email
            // =====================================

            string emailMessage =
                "Hello " + currentUser.FullName + ",\n\n" +
                "Your Vision Fleet booking request " +
                "has been submitted successfully.\n\n" +
                "Status: PENDING\n" +
                "Purpose: " + purpose + "\n" +
                "Driving Option: " + drivingOption + "\n" +
                "Passengers: " + request.PassengerCount + "\n" +
                "Requested Weeks: " + request.RepeatWeeks + "\n" +
                "Bookings Created: " +
                    createdBookings.Count + "\n" +
                "Weeks Skipped: " +
                    skippedDates.Count + "\n\n" +
                "BOOKING DETAILS\n" +
                "========================================\n";

            foreach (var booking in createdBookings)
            {
                string vanName = await GetVanDisplayName(
                    booking.AssignedVanId);

                emailMessage +=
                    "\nBooking #" +
                        booking.BookingId + "\n" +
                    "Departure: " +
                        booking.DepartureAt.ToString(
                            "dd/MM/yyyy HH:mm") + "\n" +
                    "Return: " +
                        booking.ReturnAt.ToString(
                            "dd/MM/yyyy HH:mm") + "\n" +
                    "Van: " + vanName + "\n" +
                    "Status: " + booking.Status + "\n" +
                    "----------------------------------------\n";
            }

            if (skippedDates.Count > 0)
            {
                emailMessage +=
                    "\nDATES NOT BOOKED (NO AVAILABLE VAN)\n" +
                    "========================================\n";

                foreach (var date in skippedDates)
                {
                    emailMessage +=
                        date.ToString(
                            "dd/MM/yyyy HH:mm") + "\n";
                }
            }

            emailMessage +=
                "\nYour booking is awaiting approval.\n\n" +
                "Vision Fleet System";

            bool emailSent = await TrySendEmail(
                currentUser.Email,
                "Vision Fleet - Booking Submitted (PENDING)",
                emailMessage);

            // =====================================
            // Notify Admin when Staff books
            // =====================================

            bool adminNotificationRequired =
                !User.IsInRole("Admin");

            int adminRecipientsFound = 0;
            int adminEmailsSent = 0;
            int adminEmailsFailed = 0;

            if (adminNotificationRequired)
            {
                try
                {
                    var adminRecipients =
                        await _context.Users
                            .AsNoTracking()
                            .Where(u =>
                                u.Role == "ADMIN")
                            .Select(u => new
                            {
                                u.UserId,
                                u.FullName,
                                u.Email
                            })
                            .ToListAsync();

                    adminRecipientsFound =
                        adminRecipients.Count;

                    string adminMessage =
                        "Hello Admin,\n\n" +
                        "A new Vision Fleet booking request " +
                        "is waiting for approval.\n\n" +
                        "Requester: " +
                            currentUser.FullName + "\n" +
                        "Requester email: " +
                            currentUser.Email + "\n" +
                        "Purpose: " + purpose + "\n" +
                        "Driving option: " +
                            drivingOption + "\n" +
                        "Passengers: " +
                            request.PassengerCount + "\n" +
                        "Created bookings: " +
                            createdBookings.Count + "\n" +
                        "Weeks skipped: " +
                            skippedDates.Count + "\n\n" +
                        "PENDING BOOKINGS\n" +
                        "========================================\n";

                    foreach (var booking in createdBookings)
                    {
                        string vanName =
                            await GetVanDisplayName(
                                booking.AssignedVanId);

                        adminMessage +=
                            "\nBooking #" +
                                booking.BookingId + "\n" +
                            "Departure: " +
                                booking.DepartureAt.ToString(
                                    "dd/MM/yyyy HH:mm") + "\n" +
                            "Return: " +
                                booking.ReturnAt.ToString(
                                    "dd/MM/yyyy HH:mm") + "\n" +
                            "Vehicle: " +
                                vanName + "\n" +
                            "Status: PENDING\n";
                    }

                    adminMessage +=
                        "\nPlease open Vision Fleet > " +
                        "Booking Approvals to review the " +
                        "pending request.\n\n" +
                        "Vision Fleet System";

                    var uniqueAdmins = adminRecipients
                        .Where(a =>
                            !string.IsNullOrWhiteSpace(
                                a.Email))
                        .GroupBy(
                            a => a.Email.Trim(),
                            StringComparer.OrdinalIgnoreCase)
                        .Select(g => g.First())
                        .ToList();

                    foreach (var admin in uniqueAdmins)
                    {
                        bool sent = await TrySendEmail(
                            admin.Email,
                            "Vision Fleet - New Booking Awaiting Approval",
                            adminMessage);

                        if (sent)
                        {
                            adminEmailsSent++;
                        }
                        else
                        {
                            adminEmailsFailed++;
                        }
                    }

                    adminEmailsFailed +=
                        adminRecipients.Count(a =>
                            string.IsNullOrWhiteSpace(
                                a.Email));
                }
                catch (Exception ex)
                {
                    adminEmailsFailed++;

                    Console.Error.WriteLine(
                        "Admin booking notification error: " +
                        ex.Message);
                }
            }

            return Ok(new
            {
                message = "Booking request processed",
                requestedWeeks = request.RepeatWeeks,
                createdCount = createdBookings.Count,
                skippedCount = skippedDates.Count,
                recurrenceGroupId = groupId,
                emailSent,
                adminNotificationRequired,
                adminRecipientsFound,
                adminEmailsSent,
                adminEmailsFailed,
                bookings = createdBookings.Select(b => new
                {
                    b.BookingId,
                    b.Purpose,
                    b.DepartureAt,
                    b.ReturnAt,
                    b.PassengerCount,
                    b.AssignedVanId,
                    b.Status
                }).ToList(),
                skippedDates
            });
        }

        // =====================================
        // PUT: api/bookings/{id}
        // Edit pending booking
        // =====================================

        [HttpPut("{id:int}")]
        [Authorize(Roles = "Admin,Staff")]
        public async Task<IActionResult> EditBooking(
            int id,
            [FromBody] EditBookingRequest request)
        {
            string? userIdText = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            if (!int.TryParse(userIdText, out int userId))
            {
                return Unauthorized();
            }

            if (request.ReturnAt <= request.DepartureAt)
            {
                return BadRequest(
                    "Return date must be after departure date.");
            }

            string purpose = request.Purpose.Trim();

            if (string.IsNullOrWhiteSpace(purpose))
            {
                return BadRequest("Purpose is required.");
            }

            string drivingOption =
                request.DrivingOption.Trim();

            if (drivingOption != "SELF_DRIVE" &&
                drivingOption != "DRIVER_REQUIRED")
            {
                return BadRequest(
                    "Invalid driving option.");
            }

            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var booking = await _context.Bookings
                .FindAsync(id);

            if (booking == null)
            {
                return NotFound("Booking not found.");
            }

            if (!User.IsInRole("Admin") &&
                booking.RequestedByUserId != userId &&
                booking.BookedForUserId != userId)
            {
                return Forbid();
            }

            if (booking.Status != "PENDING")
            {
                return Conflict(
                    "Only pending bookings can be edited.");
            }

            var bookedForUser = await _context.Users
                .FindAsync(booking.BookedForUserId);

            if (bookedForUser == null)
            {
                return BadRequest(
                    "Booked-for user does not exist.");
            }

            if (drivingOption == "SELF_DRIVE" &&
                !bookedForUser.CanDrive)
            {
                return BadRequest(
                    "The booked-for user cannot self-drive.");
            }

            var availableVan = await FindAvailableVan(
                request.DepartureAt,
                request.ReturnAt,
                request.PassengerCount,
                booking.BookingId);

            if (availableVan == null)
            {
                return Conflict(
                    "No vans available for the new schedule.");
            }

            booking.Purpose = purpose;
            booking.DepartureAt = request.DepartureAt;
            booking.ReturnAt = request.ReturnAt;
            booking.PassengerCount = request.PassengerCount;
            booking.DrivingOption = drivingOption;
            booking.AssignedVanId = availableVan.VanId;

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new
            {
                message = "Booking updated successfully",
                booking.BookingId,
                booking.Purpose,
                booking.DepartureAt,
                booking.ReturnAt,
                booking.PassengerCount,
                booking.AssignedVanId,
                booking.Status
            });
        }

        // =====================================
        // PUT: api/bookings/{id}/approve
        // ADMIN ONLY
        // =====================================

        [HttpPut("{id:int}/approve")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> ApproveBooking(
            int id)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var booking = await _context.Bookings
                .FindAsync(id);

            if (booking == null)
            {
                return NotFound("Booking not found.");
            }

            if (booking.Status != "PENDING")
            {
                return Conflict(
                    "Only pending bookings can be approved.");
            }

            if (booking.AssignedVanId == null)
            {
                return Conflict(
                    "This booking has no assigned van.");
            }

            var creator = await _context.Users
                .FindAsync(booking.RequestedByUserId);

            booking.Status = "APPROVED";

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            bool emailSent = false;

            if (creator != null)
            {
                string vanName = await GetVanDisplayName(
                    booking.AssignedVanId);

                string emailMessage =
                    "Hello " + creator.FullName + ",\n\n" +
                    "Your Vision Fleet booking has " +
                    "been APPROVED.\n\n" +
                    "BOOKING DETAILS\n" +
                    "========================================\n" +
                    "Booking #" +
                        booking.BookingId + "\n" +
                    "Purpose: " +
                        booking.Purpose + "\n" +
                    "Departure: " +
                        booking.DepartureAt.ToString(
                            "dd/MM/yyyy HH:mm") + "\n" +
                    "Return: " +
                        booking.ReturnAt.ToString(
                            "dd/MM/yyyy HH:mm") + "\n" +
                    "Passengers: " +
                        booking.PassengerCount + "\n" +
                    "Van: " + vanName + "\n" +
                    "Status: APPROVED\n" +
                    "----------------------------------------\n\n" +
                    "Vision Fleet System";

                emailSent = await TrySendEmail(
                    creator.Email,
                    "Vision Fleet - Booking Approved",
                    emailMessage);
            }

            return Ok(new
            {
                message = "Booking approved successfully",
                booking.BookingId,
                booking.AssignedVanId,
                booking.Status,
                emailSent
            });
        }

        // =====================================
        // PUT: api/bookings/{id}/decline
        //
        // Legacy endpoint.
        // Retained for compatibility.
        // New Admin UI uses Cancel instead.
        // =====================================

        [HttpPut("{id:int}/decline")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DeclineBooking(
            int id)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var booking = await _context.Bookings
                .FindAsync(id);

            if (booking == null)
            {
                return NotFound("Booking not found.");
            }

            if (booking.Status != "PENDING")
            {
                return Conflict(
                    "Only pending bookings can be declined.");
            }

            var creator = await _context.Users
                .FindAsync(booking.RequestedByUserId);

            booking.Status = "DECLINED";
            booking.AssignedVanId = null;

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            bool emailSent = false;

            if (creator != null)
            {
                string emailMessage =
                    "Hello " + creator.FullName + ",\n\n" +
                    "Your Vision Fleet booking has " +
                    "been DECLINED.\n\n" +
                    "BOOKING DETAILS\n" +
                    "========================================\n" +
                    "Booking #" +
                        booking.BookingId + "\n" +
                    "Purpose: " +
                        booking.Purpose + "\n" +
                    "Departure: " +
                        booking.DepartureAt.ToString(
                            "dd/MM/yyyy HH:mm") + "\n" +
                    "Return: " +
                        booking.ReturnAt.ToString(
                            "dd/MM/yyyy HH:mm") + "\n" +
                    "Status: DECLINED\n" +
                    "----------------------------------------\n\n" +
                    "Vision Fleet System";

                emailSent = await TrySendEmail(
                    creator.Email,
                    "Vision Fleet - Booking Declined",
                    emailMessage);
            }

            return Ok(new
            {
                message = "Booking declined successfully",
                booking.BookingId,
                booking.Status,
                emailSent
            });
        }

        // =====================================
        // PUT: api/bookings/{id}/cancel
        //
        // NEW: Recurring cancellation options
        //
        // cancelFollowing=false
        //   Cancel selected booking only.
        //
        // cancelFollowing=true
        //   Cancel selected booking AND
        //   later active bookings from the
        //   same RecurrenceGroupId.
        //
        // Staff: own bookings
        // Admin: all bookings
        //
        // Never physically deletes bookings.
        // =====================================

        [HttpPut("{id:int}/cancel")]
        [Authorize(Roles = "Admin,Staff")]
        public async Task<IActionResult> CancelBooking(
            int id,
            [FromQuery] bool cancelFollowing = false)
        {
            string? userIdText = User.FindFirstValue(
                ClaimTypes.NameIdentifier);

            if (!int.TryParse(userIdText, out int userId))
            {
                return Unauthorized();
            }

            bool isAdmin = User.IsInRole("Admin");

            // Keep all cancellation changes in one
            // SQL transaction.
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            // Prevent another booking operation from
            // changing the schedule simultaneously.
            await LockBookingSchedule();

            // =====================================
            // Find selected booking
            // =====================================

            var selectedBooking = await _context.Bookings
                .FirstOrDefaultAsync(b =>
                    b.BookingId == id);

            if (selectedBooking == null)
            {
                return NotFound(new
                {
                    message = "Booking not found."
                });
            }

            // Staff can cancel bookings they requested
            // or bookings created for them.
            if (!isAdmin &&
                selectedBooking.RequestedByUserId != userId &&
                selectedBooking.BookedForUserId != userId)
            {
                return Forbid();
            }

            // =====================================
            // Validate selected booking
            // =====================================

            if (selectedBooking.Status != "PENDING" &&
                selectedBooking.Status != "APPROVED")
            {
                return Conflict(new
                {
                    message =
                        "Only PENDING or APPROVED bookings " +
                        "can be cancelled."
                });
            }

            if (selectedBooking.DepartureAt <= DateTime.Now)
            {
                return Conflict(new
                {
                    message =
                        "Cannot cancel a booking after " +
                        "its departure time."
                });
            }

            // =====================================
            // Determine cancellation scope
            // =====================================

            bool isRecurring =
                selectedBooking.RecurrenceGroupId.HasValue;

            bool cancelSeries =
                cancelFollowing && isRecurring;

            List<Booking> bookingsToCancel;

            if (cancelSeries)
            {
                // Recurring booking:
                // Select current occurrence and all
                // later PENDING / APPROVED occurrences.
                //
                // Previous occurrences are preserved.

                Guid groupId =
                    selectedBooking.RecurrenceGroupId!.Value;

                DateTime selectedDeparture =
                    selectedBooking.DepartureAt;

                bookingsToCancel = await _context.Bookings
                    .Where(b =>
                        b.RecurrenceGroupId == groupId &&
                        b.DepartureAt >= selectedDeparture &&
                        (b.Status == "PENDING" ||
                         b.Status == "APPROVED"))
                    .OrderBy(b => b.DepartureAt)
                    .ThenBy(b => b.BookingId)
                    .ToListAsync();
            }
            else
            {
                // Single occurrence:
                // Never touch the rest of the series.

                bookingsToCancel = new List<Booking>
                {
                    selectedBooking
                };
            }

            if (bookingsToCancel.Count == 0)
            {
                return Conflict(new
                {
                    message =
                        "No active bookings available " +
                        "for cancellation."
                });
            }

            // =====================================
            // Verify all affected bookings
            // =====================================

            // Staff must have permission for
            // every booking in the cancellation.

            if (!isAdmin &&
                bookingsToCancel.Any(b =>
                    b.RequestedByUserId != userId &&
                    b.BookedForUserId != userId))
            {
                return Forbid();
            }

            // Do not change past bookings.
            if (bookingsToCancel.Any(b =>
                b.DepartureAt <= DateTime.Now))
            {
                return Conflict(new
                {
                    message =
                        "One or more bookings have " +
                        "already reached their departure time. " +
                        "No bookings were cancelled."
                });
            }

            // =====================================
            // Protect Journey history
            // =====================================

            var bookingIds = bookingsToCancel
                .Select(b => b.BookingId)
                .ToList();

            var linkedJourneyBookingIds =
                await _context.Journeys
                    .Where(j =>
                        bookingIds.Contains(j.BookingId))
                    .Select(j => j.BookingId)
                    .Distinct()
                    .ToListAsync();

            if (linkedJourneyBookingIds.Count > 0)
            {
                // Reject entire operation.
                // No partial cancellation.

                return Conflict(new
                {
                    message =
                        "Cannot cancel this selection because " +
                        "one or more bookings have a linked Journey. " +
                        "No bookings were changed.",
                    blockedBookingIds =
                        linkedJourneyBookingIds
                });
            }

            // =====================================
            // Cancel selected bookings
            // =====================================

            foreach (var booking in bookingsToCancel)
            {
                booking.Status = "CANCELLED";

                // Release van reservation.
                booking.AssignedVanId = null;
            }

            await _context.SaveChangesAsync();

            // Commit ALL cancellations together.
            await transaction.CommitAsync();

            // =====================================
            // Send cancellation emails
            //
            // Email failure does not undo
            // successful database cancellation.
            // =====================================

            int emailsSent = 0;
            int emailsFailed = 0;

            try
            {
                var requesterIds = bookingsToCancel
                    .Select(b => b.RequestedByUserId)
                    .Distinct()
                    .ToList();

                var requesters = await _context.Users
                    .AsNoTracking()
                    .Where(u =>
                        requesterIds.Contains(u.UserId))
                    .ToListAsync();

                foreach (var requester in requesters)
                {
                    var requesterBookings = bookingsToCancel
                        .Where(b =>
                            b.RequestedByUserId ==
                            requester.UserId)
                        .OrderBy(b => b.DepartureAt)
                        .ToList();

                    // One consolidated email per requester.

                    string emailMessage =
                        "Hello " +
                            requester.FullName + ",\n\n" +
                        "Your Vision Fleet booking " +
                        "request(s) have been CANCELLED.\n\n" +
                        "Cancellation type: " +
                            (cancelSeries
                                ? "Selected booking and future recurring bookings"
                                : "Selected booking only") +
                        "\n" +
                        "Bookings cancelled: " +
                            requesterBookings.Count + "\n\n" +
                        "CANCELLED BOOKING DETAILS\n" +
                        "========================================\n";

                    foreach (var booking in requesterBookings)
                    {
                        emailMessage +=
                            "\nBooking #" +
                                booking.BookingId + "\n" +
                            "Purpose: " +
                                booking.Purpose + "\n" +
                            "Departure: " +
                                booking.DepartureAt.ToString(
                                    "dd/MM/yyyy HH:mm") + "\n" +
                            "Return: " +
                                booking.ReturnAt.ToString(
                                    "dd/MM/yyyy HH:mm") + "\n" +
                            "Status: CANCELLED\n" +
                            "----------------------------------------\n";
                    }

                    emailMessage +=
                        "\nThese bookings remain in " +
                        "your booking history.\n\n" +
                        "Vision Fleet System";

                    bool sent = await TrySendEmail(
                        requester.Email,
                        "Vision Fleet - Booking Cancelled",
                        emailMessage);

                    if (sent)
                    {
                        emailsSent++;
                    }
                    else
                    {
                        emailsFailed++;
                    }
                }

                // Requesters missing from the database
                // could not receive a notification.
                emailsFailed += requesterIds.Count -
                    requesters.Count;
            }
            catch (Exception ex)
            {
                emailsFailed++;

                Console.Error.WriteLine(
                    "Cancellation email processing error: " +
                    ex.Message);
            }

            bool emailSent =
                emailsSent > 0 &&
                emailsFailed == 0;

            // =====================================
            // Return cancellation summary
            // =====================================

            return Ok(new
            {
                message =
                    "Booking cancellation successful.",
                selectedBookingId = id,
                cancelFollowing = cancelSeries,
                cancelledCount = bookingsToCancel.Count,
                cancelledBookingIds = bookingIds,
                historyPreserved = true,
                emailSent,
                emailsSent,
                emailsFailed
            });
        }

        // =====================================
        // DELETE: api/bookings/{id}
        //
        // Admin only.
        // Permanent deletion.
        //
        // Refuse deletion when a Journey exists.
        // =====================================

        [HttpDelete("{id:int}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DeleteBooking(
            int id)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync();

            await LockBookingSchedule();

            var booking = await _context.Bookings
                .FirstOrDefaultAsync(b =>
                    b.BookingId == id);

            if (booking == null)
            {
                return NotFound(new
                {
                    message = "Booking not found."
                });
            }

            bool hasJourney = await _context.Journeys
                .AnyAsync(j =>
                    j.BookingId == id);

            if (hasJourney)
            {
                return Conflict(new
                {
                    message =
                        "Cannot permanently delete this booking " +
                        "because a Journey is linked to it. " +
                        "Trip history must be preserved."
                });
            }

            _context.Bookings.Remove(booking);

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();

            return Ok(new
            {
                message =
                    "Booking permanently deleted successfully",
                bookingId = id,
                permanentlyDeleted = true
            });
        }
    }

    // =====================================
    // DTO: Create Booking Request
    // =====================================

    public class CreateBookingRequest
    {
        public int? BookedForUserId { get; set; }

        [Required]
        public string DrivingOption { get; set; }
            = string.Empty;

        [Required]
        [StringLength(500)]
        public string Purpose { get; set; }
            = string.Empty;

        public DateTime DepartureAt { get; set; }

        public DateTime ReturnAt { get; set; }

        [Range(1, 100)]
        public int PassengerCount { get; set; }

        [Range(1, 52)]
        public int RepeatWeeks { get; set; } = 1;
    }

    // =====================================
    // DTO: Edit Booking Request
    // =====================================

    public class EditBookingRequest
    {
        [Required]
        public string DrivingOption { get; set; }
            = string.Empty;

        [Required]
        [StringLength(500)]
        public string Purpose { get; set; }
            = string.Empty;

        public DateTime DepartureAt { get; set; }

        public DateTime ReturnAt { get; set; }

        [Range(1, 100)]
        public int PassengerCount { get; set; }
    }
}
