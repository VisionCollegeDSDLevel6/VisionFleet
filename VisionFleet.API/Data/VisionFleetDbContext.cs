
using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using VisionFleet.API.Models;

namespace VisionFleet.API.Data;

public partial class VisionFleetDbContext : DbContext
{
    public VisionFleetDbContext(
        DbContextOptions<VisionFleetDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Booking> Bookings { get; set; }

    public virtual DbSet<Journey> Journeys { get; set; }

    public virtual DbSet<MaintenanceRecord> MaintenanceRecords { get; set; }

    public virtual DbSet<TrackingSession> TrackingSessions { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<Van> Vans { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Booking>(entity =>
        {
            entity.HasIndex(e => e.BookedForUserId, "IX_Bookings_Recipient");

            entity.HasIndex(
                e => new { e.RequestedByUserId, e.DepartureAt },
                "IX_Bookings_Requester_Time");

            entity.Property(e => e.BookingId)
                .HasColumnName("BookingID");

            entity.Property(e => e.AssignedVanId)
                .HasColumnName("AssignedVanID");

            entity.Property(e => e.BookedForUserId)
                .HasColumnName("BookedForUserID");

            entity.Property(e => e.BookingFor)
                .HasMaxLength(10)
                .IsUnicode(false);

            entity.Property(e => e.DepartureAt)
                .HasPrecision(0);

            entity.Property(e => e.DrivingOption)
                .HasMaxLength(20)
                .IsUnicode(false);

            entity.Property(e => e.Purpose)
                .HasMaxLength(500);

            entity.Property(e => e.RecurrenceGroupId)
                .HasColumnName("RecurrenceGroupID");

            entity.Property(e => e.RequestedByUserId)
                .HasColumnName("RequestedByUserID");

            entity.Property(e => e.ReturnAt)
                .HasPrecision(0);

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("PENDING", "DF_Bookings_Status");

            entity.HasOne(d => d.AssignedVan)
                .WithMany(p => p.Bookings)
                .HasForeignKey(d => d.AssignedVanId)
                .HasConstraintName("FK_Bookings_AssignedVan");

            entity.HasOne(d => d.BookedForUser)
                .WithMany(p => p.BookingBookedForUsers)
                .HasForeignKey(d => d.BookedForUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Bookings_Recipient");

            entity.HasOne(d => d.RequestedByUser)
                .WithMany(p => p.BookingRequestedByUsers)
                .HasForeignKey(d => d.RequestedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Bookings_Requester");
        });

        modelBuilder.Entity<Journey>(entity =>
        {
            entity.HasIndex(
                e => e.DriverUserId,
                "IX_Journeys_Driver");

            entity.HasIndex(
                e => e.VanId,
                "IX_Journeys_Van");

            entity.Property(e => e.JourneyId)
                .HasColumnName("JourneyID");

            entity.Property(e => e.BookingId)
                .HasColumnName("BookingID");

            entity.Property(e => e.DriverUserId)
                .HasColumnName("DriverUserID");

            entity.Property(e => e.EndLatitude)
                .HasColumnType("decimal(10, 7)");

            entity.Property(e => e.EndLocation)
                .HasMaxLength(255);

            entity.Property(e => e.EndLongitude)
                .HasColumnType("decimal(10, 7)");

            entity.Property(e => e.EndedAt)
                .HasPrecision(0);

            entity.Property(e => e.StartLatitude)
                .HasColumnType("decimal(10, 7)");

            entity.Property(e => e.StartLocation)
                .HasMaxLength(255);

            entity.Property(e => e.StartLongitude)
                .HasColumnType("decimal(10, 7)");

            entity.Property(e => e.StartedAt)
                .HasPrecision(0);

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("SCHEDULED", "DF_Journeys_Status");

            entity.Property(e => e.VanId)
                .HasColumnName("VanID");

            entity.HasOne(d => d.Booking)
                .WithMany(p => p.Journeys)
                .HasForeignKey(d => d.BookingId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Journeys_Booking");

            entity.HasOne(d => d.DriverUser)
                .WithMany(p => p.Journeys)
                .HasForeignKey(d => d.DriverUserId)
                .HasConstraintName("FK_Journeys_Driver");

            entity.HasOne(d => d.Van)
                .WithMany(p => p.Journeys)
                .HasForeignKey(d => d.VanId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Journeys_Van");
        });

        modelBuilder.Entity<MaintenanceRecord>(entity =>
        {
            entity.HasKey(e => e.MaintenanceId);

            entity.HasIndex(
                e => new { e.VanId, e.ScheduledDate },
                "IX_MaintenanceRecords_Van_Date");

            entity.Property(e => e.MaintenanceId)
                .HasColumnName("MaintenanceID");

            entity.Property(e => e.Description)
                .HasMaxLength(500);

            entity.Property(e => e.ScheduledDate)
                .HasPrecision(0);

            // New planned maintenance end date
            entity.Property(e => e.PlannedEndDate)
                .HasColumnType("date");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue(
                    "SCHEDULED",
                    "DF_MaintenanceRecords_Status");

            entity.Property(e => e.VanId)
                .HasColumnName("VanID");

            entity.HasOne(d => d.Van)
                .WithMany(p => p.MaintenanceRecords)
                .HasForeignKey(d => d.VanId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MaintenanceRecords_Van");
        });

        modelBuilder.Entity<TrackingSession>(entity =>
        {
            entity.HasIndex(
                e => e.JourneyId,
                "IX_TrackingSessions_Journey");

            entity.Property(e => e.TrackingSessionId)
                .HasColumnName("TrackingSessionID");

            entity.Property(e => e.EndedAt)
                .HasPrecision(0);

            entity.Property(e => e.JourneyId)
                .HasColumnName("JourneyID");

            entity.Property(e => e.LastLatitude)
                .HasColumnType("decimal(10, 7)");

            entity.Property(e => e.LastLongitude)
                .HasColumnType("decimal(10, 7)");

            entity.Property(e => e.StartedAt)
                .HasPrecision(0);

            entity.Property(e => e.TrackingMode)
                .HasMaxLength(10)
                .IsUnicode(false);

            entity.HasOne(d => d.Journey)
                .WithMany(p => p.TrackingSessions)
                .HasForeignKey(d => d.JourneyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TrackingSessions_Journey");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(
                e => e.Email,
                "UQ_Users_Email")
                .IsUnique();

            entity.Property(e => e.UserId)
                .HasColumnName("UserID");

            entity.Property(e => e.Email)
                .HasMaxLength(255);

            entity.Property(e => e.FullName)
                .HasMaxLength(120);

            entity.Property(e => e.LicenceNumber)
                .HasMaxLength(50);

            entity.Property(e => e.PasswordHash)
                .HasMaxLength(255);

            entity.Property(e => e.Role)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("STAFF", "DF_Users_Role");
        });

        modelBuilder.Entity<Van>(entity =>
        {
            entity.HasIndex(
                e => e.Registration,
                "UQ_Vans_Registration")
                .IsUnique();

            entity.Property(e => e.VanId)
                .HasColumnName("VanID");

            entity.Property(e => e.AvailabilityStatus)
                .HasMaxLength(25)
                .IsUnicode(false)
                .HasDefaultValue(
                    "AVAILABLE",
                    "DF_Vans_Status");

            entity.Property(e => e.MakeModel)
                .HasMaxLength(120);

            entity.Property(e => e.Registration)
                .HasMaxLength(20)
                .IsUnicode(false);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(
        ModelBuilder modelBuilder);
}
