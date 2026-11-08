
using System;
using System.Collections.Generic;

namespace VisionFleet.API.Models;

public partial class MaintenanceRecord
{
    public int MaintenanceId { get; set; }

    public int VanId { get; set; }

    public DateTime ScheduledDate { get; set; }

    public DateTime? PlannedEndDate { get; set; }

    public string Description { get; set; } = null!;

    public string Status { get; set; } = null!;

    public virtual Van Van { get; set; } = null!;
}
