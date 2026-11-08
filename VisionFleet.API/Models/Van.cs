using System;
using System.Collections.Generic;

namespace VisionFleet.API.Models;

public partial class Van
{
    public int VanId { get; set; }

    public string Registration { get; set; } = null!;

    public string MakeModel { get; set; } = null!;

    public int Capacity { get; set; }

    public string AvailabilityStatus { get; set; } = null!;

    public virtual ICollection<Booking> Bookings { get; set; } = new List<Booking>();

    public virtual ICollection<Journey> Journeys { get; set; } = new List<Journey>();

    public virtual ICollection<MaintenanceRecord> MaintenanceRecords { get; set; } = new List<MaintenanceRecord>();
}
