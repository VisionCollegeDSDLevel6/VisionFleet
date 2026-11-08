using System;
using System.Collections.Generic;

namespace VisionFleet.API.Models;

public partial class Booking
{
    public int BookingId { get; set; }

    public int RequestedByUserId { get; set; }

    public int BookedForUserId { get; set; }

    public string BookingFor { get; set; } = null!;

    public string DrivingOption { get; set; } = null!;

    public DateTime DepartureAt { get; set; }

    public DateTime ReturnAt { get; set; }

    public int PassengerCount { get; set; }

    public string Status { get; set; } = null!;

    public string? Purpose { get; set; }

    public int? AssignedVanId { get; set; }

    public Guid? RecurrenceGroupId { get; set; }

    public virtual Van? AssignedVan { get; set; }

    public virtual User BookedForUser { get; set; } = null!;

    public virtual ICollection<Journey> Journeys { get; set; } = new List<Journey>();

    public virtual User RequestedByUser { get; set; } = null!;
}
