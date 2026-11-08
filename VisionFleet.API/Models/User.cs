using System;
using System.Collections.Generic;

namespace VisionFleet.API.Models;

public partial class User
{
    public int UserId { get; set; }

    public string FullName { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public string Role { get; set; } = null!;

    public bool CanDrive { get; set; }

    public string? LicenceNumber { get; set; }

    public virtual ICollection<Booking> BookingBookedForUsers { get; set; } = new List<Booking>();

    public virtual ICollection<Booking> BookingRequestedByUsers { get; set; } = new List<Booking>();

    public virtual ICollection<Journey> Journeys { get; set; } = new List<Journey>();
}
