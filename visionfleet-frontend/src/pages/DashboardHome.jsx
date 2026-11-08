
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import "../styles/DashboardHome.css";

const API = {
  bookings: "/api/bookings",
  vans: "/api/vans",
  maintenance: "/api/maintenance-records",
};

function normaliseStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getMessage(error) {
  return error instanceof Error
    ? error.message
    : "Unable to load data.";
}

async function getApiList(url, signal) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Session expired. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Access denied.");
    }

    throw new Error(`API request failed (HTTP ${response.status}).`);
  }

  const result = await response.json();

  if (!Array.isArray(result)) {
    throw new Error("Unexpected API response format.");
  }

  return result;
}

function SectionHeading({ eyebrow, title, right }) {
  return (
    <div className="vf-section-heading">
      <div>
        <span className="vf-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>

      {right && (
        <div className="vf-section-heading-right">
          {right}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
  loading,
  error,
}) {
  return (
    <article className="vf-dashboard-metric">
      <div className="vf-dashboard-metric-top">
        <span>{title}</span>

        <span className="vf-dashboard-metric-icon">
          <Icon name={icon} size={20} />
        </span>
      </div>

      <strong>
        {loading ? "…" : error ? "—" : value}
      </strong>

      <small>
        {error ? "Data unavailable" : description}
      </small>
    </article>
  );
}

function StatusBadge({ status }) {
  const value = normaliseStatus(status);

  let colour = "neutral";

  if (
    value === "AVAILABLE" ||
    value === "APPROVED" ||
    value === "DONE"
  ) {
    colour = "green";
  } else if (
    value === "PENDING" ||
    value === "SCHEDULED"
  ) {
    colour = "amber";
  } else if (
    value === "MAINTENANCE" ||
    value === "IN_PROGRESS" ||
    value === "IN_USE"
  ) {
    colour = "blue";
  } else if (
    value === "CANCELLED" ||
    value === "DECLINED" ||
    value === "INACTIVE"
  ) {
    colour = "red";
  }

  return (
    <span
      className={`vf-dashboard-status vf-dashboard-status-${colour}`}
    >
      <span className="vf-dashboard-status-dot" />

      {value.replaceAll("_", " ") || "UNKNOWN"}
    </span>
  );
}

function PanelMessage({ children, error = false }) {
  return (
    <div
      className={
        error
          ? "vf-dashboard-panel-message vf-dashboard-panel-error"
          : "vf-dashboard-panel-message"
      }
      role={error ? "alert" : undefined}
    >
      {children}
    </div>
  );
}

export default function DashboardHome({ onNavigate }) {
  const [bookings, setBookings] = useState([]);
  const [vans, setVans] = useState([]);
  const [maintenance, setMaintenance] = useState([]);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  // =====================================
  // Load live dashboard data
  // =====================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setErrors({});

      const results = await Promise.allSettled([
        getApiList(API.bookings, controller.signal),
        getApiList(API.vans, controller.signal),
        getApiList(API.maintenance, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      const names = [
        "bookings",
        "vans",
        "maintenance",
      ];

      const nextErrors = {};

      results.forEach((result, index) => {
        const name = names[index];

        if (result.status === "fulfilled") {
          if (name === "bookings") {
            setBookings(result.value);
          }

          if (name === "vans") {
            setVans(result.value);
          }

          if (name === "maintenance") {
            setMaintenance(result.value);
          }
        } else {
          nextErrors[name] = getMessage(result.reason);

          if (name === "bookings") setBookings([]);
          if (name === "vans") setVans([]);
          if (name === "maintenance") setMaintenance([]);
        }
      });

      setErrors(nextErrors);
      setLastUpdated(new Date());
      setLoading(false);
    }

    loadDashboard();

    return () => controller.abort();
  }, [refreshKey]);

  function refreshDashboard() {
    setRefreshKey((value) => value + 1);
  }

  // =====================================
  // Actual statistics
  // =====================================

  const pendingBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            normaliseStatus(booking.status) === "PENDING"
        )
        .sort(
          (a, b) =>
            new Date(a.departureAt) -
            new Date(b.departureAt)
        ),
    [bookings]
  );

  const approvedCount = bookings.filter(
    (booking) =>
      normaliseStatus(booking.status) === "APPROVED"
  ).length;

  const availableCount = vans.filter(
    (van) =>
      normaliseStatus(van.availabilityStatus) ===
      "AVAILABLE"
  ).length;

  const activeMaintenanceCount = maintenance.filter(
    (record) =>
      normaliseStatus(record.status) === "IN_PROGRESS"
  ).length;

  const scheduledMaintenanceCount = maintenance.filter(
    (record) =>
      normaliseStatus(record.status) === "SCHEDULED"
  ).length;

  // =====================================
  // Join Booking with Van registration
  // =====================================

  const vanLookup = useMemo(() => {
    return new Map(
      vans.map((van) => [
        van.vanId,
        van.registration,
      ])
    );
  }, [vans]);

  const recentPending = pendingBookings.slice(0, 5);

  const visibleVans = [...vans]
    .sort((a, b) =>
      String(a.registration || "").localeCompare(
        String(b.registration || "")
      )
    )
    .slice(0, 6);

  const upcomingMaintenance = maintenance
    .filter((record) =>
      ["SCHEDULED", "IN_PROGRESS"].includes(
        normaliseStatus(record.status)
      )
    )
    .sort((a, b) => {
      if (
        normaliseStatus(a.status) === "IN_PROGRESS" &&
        normaliseStatus(b.status) !== "IN_PROGRESS"
      ) {
        return -1;
      }

      if (
        normaliseStatus(b.status) === "IN_PROGRESS" &&
        normaliseStatus(a.status) !== "IN_PROGRESS"
      ) {
        return 1;
      }

      return (
        new Date(a.scheduledDate) -
        new Date(b.scheduledDate)
      );
    })
    .slice(0, 5);

  const errorCount = Object.keys(errors).length;

  return (
    <div className="vf-dashboard-page">
      {/* ===================================
          Hero
          =================================== */}

      <section className="vf-hero">
        <div className="vf-hero-content">
          <span className="vf-hero-eyebrow">
            VISION FLEET ADMIN CONSOLE
          </span>

          <h1>
            Fleet operations,
            <br />
            made simple.
          </h1>

          <p>
            Manage vehicle bookings, keep track of your
            fleet and coordinate drivers from one central
            workspace.
          </p>

          <div className="vf-hero-buttons">
            <button
              type="button"
              className="vf-button-primary"
              onClick={() => onNavigate("bookings")}
            >
              Review bookings
              <Icon name="arrow" size={17} />
            </button>

            <button
              type="button"
              className="vf-button-outline"
              onClick={() => onNavigate("vans")}
            >
              Manage vans
              <Icon name="chevron" size={17} />
            </button>
          </div>
        </div>

        <div className="vf-quick-access">
          <p>QUICK ACCESS</p>

          <button
            type="button"
            onClick={() => onNavigate("bookings")}
          >
            <span className="vf-quick-icon">
              <Icon name="booking" size={18} />
            </span>

            Booking Approvals
            <Icon name="arrow" size={16} />
          </button>

          <button
            type="button"
            onClick={() => onNavigate("vans")}
          >
            <span className="vf-quick-icon">
              <Icon name="van" size={18} />
            </span>

            Van Management
            <Icon name="arrow" size={16} />
          </button>

          <button
            type="button"
            onClick={() => onNavigate("drivers")}
          >
            <span className="vf-quick-icon">
              <Icon name="driver" size={18} />
            </span>

            Driver Assignment
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </section>

      {/* ===================================
          Overview
          =================================== */}

      <section className="vf-overview-section">
        <SectionHeading
          eyebrow="OVERVIEW"
          title="Fleet at a glance"
          right={
            <button
              type="button"
              className="vf-dashboard-refresh"
              onClick={refreshDashboard}
              disabled={loading}
            >
              <Icon name="refresh" size={16} />

              {loading ? "Refreshing..." : "Refresh"}
            </button>
          }
        />

        {errorCount > 0 && !loading && (
          <div className="vf-dashboard-alert" role="alert">
            Some dashboard data could not be loaded.
            Check your Backend connection and refresh.
          </div>
        )}

        <div className="vf-dashboard-metrics">
          <MetricCard
            title="Pending approvals"
            value={pendingBookings.length}
            description="Requests awaiting review"
            icon="clock"
            loading={loading}
            error={errors.bookings}
          />

          <MetricCard
            title="Available vans"
            value={availableCount}
            description="Vehicles currently available"
            icon="van"
            loading={loading}
            error={errors.vans}
          />

          <MetricCard
            title="Approved bookings"
            value={approvedCount}
            description="Confirmed booking requests"
            icon="check"
            loading={loading}
            error={errors.bookings}
          />

          <MetricCard
            title="Total vehicles"
            value={vans.length}
            description="Vehicles registered in the fleet"
            icon="dashboard"
            loading={loading}
            error={errors.vans}
          />
        </div>
      </section>

      {/* ===================================
          Operations
          =================================== */}

      <section className="vf-overview-section">
        <SectionHeading
          eyebrow="OPERATIONS"
          title="Manage your fleet"
        />

        <div className="vf-dashboard-panel-grid">
          {/* Pending bookings */}

          <article className="vf-dashboard-panel">
            <div className="vf-dashboard-panel-header">
              <div>
                <h3>Booking requests</h3>
                <p>
                  Requests awaiting Admin approval.
                </p>
              </div>

              <button
                type="button"
                className="vf-dashboard-link"
                onClick={() => onNavigate("bookings")}
              >
                View all
                <Icon name="arrow" size={15} />
              </button>
            </div>

            {loading ? (
              <PanelMessage>
                Loading bookings...
              </PanelMessage>
            ) : errors.bookings ? (
              <PanelMessage error>
                {errors.bookings}
              </PanelMessage>
            ) : recentPending.length === 0 ? (
              <PanelMessage>
                No pending booking requests.
              </PanelMessage>
            ) : (
              <div className="vf-dashboard-table-scroll">
                <table className="vf-dashboard-table">
                  <thead>
                    <tr>
                      <th>BOOKING</th>
                      <th>DEPARTURE</th>
                      <th>VEHICLE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentPending.map((booking) => (
                      <tr key={booking.bookingId}>
                        <td>
                          <strong>
                            #{booking.bookingId}
                          </strong>

                          <small>
                            User #{booking.requestedByUserId}
                          </small>
                        </td>

                        <td>
                          {formatDateTime(
                            booking.departureAt
                          )}
                        </td>

                        <td>
                          {booking.assignedVanId == null
                            ? "Not assigned"
                            : vanLookup.get(
                                booking.assignedVanId
                              ) ||
                              `Van #${booking.assignedVanId}`}
                        </td>

                        <td>
                          <StatusBadge
                            status={booking.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="vf-dashboard-panel-footer">
              {loading || errors.bookings
                ? "—"
                : `${pendingBookings.length} pending request(s)`}
            </div>
          </article>

          {/* Vehicle availability */}

          <article className="vf-dashboard-panel">
            <div className="vf-dashboard-panel-header">
              <div>
                <h3>Vehicle availability</h3>
                <p>
                  Current vehicle status.
                </p>
              </div>

              <button
                type="button"
                className="vf-dashboard-link"
                onClick={() => onNavigate("vans")}
              >
                View vans
                <Icon name="arrow" size={15} />
              </button>
            </div>

            {loading ? (
              <PanelMessage>
                Loading vehicles...
              </PanelMessage>
            ) : errors.vans ? (
              <PanelMessage error>
                {errors.vans}
              </PanelMessage>
            ) : visibleVans.length === 0 ? (
              <PanelMessage>
                No vehicles registered.
              </PanelMessage>
            ) : (
              <div className="vf-dashboard-table-scroll">
                <table className="vf-dashboard-table">
                  <thead>
                    <tr>
                      <th>VEHICLE</th>
                      <th>REGISTRATION</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleVans.map((van) => (
                      <tr key={van.vanId}>
                        <td>
                          <strong>
                            {van.makeModel || "Vehicle"}
                          </strong>

                          <small>
                            Van #{van.vanId}
                          </small>
                        </td>

                        <td>
                          {van.registration || "—"}
                        </td>

                        <td>
                          <StatusBadge
                            status={van.availabilityStatus}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="vf-dashboard-panel-footer">
              {loading || errors.vans
                ? "—"
                : `${availableCount} available of ${vans.length} vehicles`}
            </div>
          </article>
        </div>
      </section>

      {/* ===================================
          Maintenance
          =================================== */}

      <section className="vf-overview-section">
        <SectionHeading
          eyebrow="MAINTENANCE"
          title="Maintenance overview"
          right={
            !loading &&
            !errors.maintenance && (
              <span className="vf-dashboard-section-note">
                {activeMaintenanceCount} in progress ·{" "}
                {scheduledMaintenanceCount} scheduled
              </span>
            )
          }
        />

        <article className="vf-dashboard-panel">
          <div className="vf-dashboard-panel-header">
            <div>
              <h3>Scheduled & ongoing maintenance</h3>
              <p>
                Current and planned vehicle maintenance.
              </p>
            </div>

            <button
              type="button"
              className="vf-dashboard-link"
              onClick={() => onNavigate("vans")}
            >
              Manage maintenance
              <Icon name="arrow" size={15} />
            </button>
          </div>

          {loading ? (
            <PanelMessage>
              Loading maintenance...
            </PanelMessage>
          ) : errors.maintenance ? (
            <PanelMessage error>
              {errors.maintenance}
            </PanelMessage>
          ) : upcomingMaintenance.length === 0 ? (
            <PanelMessage>
              No scheduled or ongoing maintenance.
            </PanelMessage>
          ) : (
            <div className="vf-dashboard-table-scroll">
              <table className="vf-dashboard-table">
                <thead>
                  <tr>
                    <th>VEHICLE</th>
                    <th>START DATE</th>
                    <th>END DATE</th>
                    <th>DESCRIPTION</th>
                    <th>STATUS</th>
                  </tr>
                </thead>

                <tbody>
                  {upcomingMaintenance.map((record) => (
                    <tr key={record.maintenanceId}>
                      <td>
                        <strong>
                          {record.registration ||
                            `Van #${record.vanId}`}
                        </strong>

                        <small>
                          {record.makeModel || ""}
                        </small>
                      </td>

                      <td>
                        {formatDate(record.scheduledDate)}
                      </td>

                      <td>
                        {formatDate(
                          record.plannedEndDate ||
                          record.scheduledDate
                        )}
                      </td>

                      <td>
                        {record.description || "—"}
                      </td>

                      <td>
                        <StatusBadge
                          status={record.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="vf-dashboard-panel-footer">
            {loading || errors.maintenance
              ? "—"
              : `${activeMaintenanceCount + scheduledMaintenanceCount} active or scheduled record(s)`}
          </div>
        </article>
      </section>

      {/* ===================================
          Footer
          =================================== */}

      <div className="vf-dashboard-info">
        <Icon name="info" size={17} />

        <span>
          Data from VisionFleetDB.
          {lastUpdated &&
            !loading &&
            ` Last refreshed ${lastUpdated.toLocaleTimeString(
              "en-NZ",
              {
                hour: "2-digit",
                minute: "2-digit",
              }
            )}.`}
        </span>
      </div>
    </div>
  );
}
