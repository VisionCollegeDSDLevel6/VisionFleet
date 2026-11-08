using System;
using System.Collections.Generic;

namespace VisionFleet.API.Models;

public partial class Journey
{
    public bool IsHiddenFromHistory { get; set; } = false;

    public int JourneyId { get; set; }

    public int BookingId { get; set; }

    public int VanId { get; set; }

    public int? DriverUserId { get; set; }

    public string StartLocation { get; set; } = null!;

    public string EndLocation { get; set; } = null!;

    public decimal? StartLatitude { get; set; }

    public decimal? StartLongitude { get; set; }

    public decimal? EndLatitude { get; set; }

    public decimal? EndLongitude { get; set; }


    public DateTime? StartedAt { get; set; }

    public int? ActualPassengerCount { get; set; }


    public DateTime? EndedAt { get; set; }

    public string Status { get; set; } = null!;

    public virtual Booking Booking { get; set; } = null!;

    public virtual User? DriverUser { get; set; }

    public virtual ICollection<TrackingSession> TrackingSessions { get; set; } = new List<TrackingSession>();

    public virtual Van Van { get; set; } = null!;
}
