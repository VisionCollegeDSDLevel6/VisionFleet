using System;
using System.Collections.Generic;

namespace VisionFleet.API.Models;

public partial class TrackingSession
{
    public int TrackingSessionId { get; set; }

    public int JourneyId { get; set; }

    public string TrackingMode { get; set; } = null!;

    public decimal? LastLatitude { get; set; }

    public decimal? LastLongitude { get; set; }

    public DateTime StartedAt { get; set; }

    public DateTime? EndedAt { get; set; }

    public virtual Journey Journey { get; set; } = null!;
}
