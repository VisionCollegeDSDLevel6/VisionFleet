
import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import { getVans } from "../services/vanService";
import { getMaintenanceRecords } from "../services/maintenanceService";
import "../styles/AdminCalendar.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ACTIVE_BOOKING = ["PENDING", "APPROVED"];
const ACTIVE_MAINTENANCE = ["SCHEDULED", "IN_PROGRESS"];

// =====================================
// Date helpers
// =====================================

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDay(value) {
  const match = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  const expected =
    `${match[1]}-${match[2]}-${match[3]}`;

  return dateKey(date) === expected ? date : null;
}

function startOfDay(day) {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate()
  ).getTime();
}

function dateTime(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function formatTime(value) {
  const date = dateTime(value);

  if (!date) return "—";

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
  const date = parseDay(value);

  if (!date) return "—";

  return date.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusName(status) {
  return String(status || "UNKNOWN").replaceAll("_", " ");
}

// =====================================
// API helpers
// =====================================

async function readError(response) {
  if (response.status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (response.status === 403) {
    return "Admin access is required.";
  }

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    if (typeof data === "string") {
      return data;
    }

    return (
      data.message ||
      data.title ||
      `HTTP ${response.status}`
    );
  } catch {
    return text && !text.trim().startsWith("<")
      ? text
      : `HTTP ${response.status}`;
  }
}

async function getBookings(signal) {
  const response = await fetch("/api/bookings", {
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Bookings API returned an invalid response."
    );
  }

  return data;
}

// =====================================
// Convert Bookings and Maintenance into
// calendar events.
// =====================================

function buildEvents(bookings, maintenance, vans) {
  const vanNames = new Map(
    vans.map((van) => [
      String(van.vanId),
      van.registration || `Van #${van.vanId}`,
    ])
  );

  const bookingEvents = bookings.flatMap((booking) => {
    const departure = dateTime(booking.departureAt);
    const returning = dateTime(booking.returnAt);

    if (!departure || !returning || returning <= departure) {
      return [];
    }

    const vanId =
      booking.assignedVanId == null
        ? "unassigned"
        : String(booking.assignedVanId);

    return [{
      id: `booking-${booking.bookingId}`,
      kind: "BOOKING",

      status: String(
        booking.status || ""
      ).toUpperCase(),

      title: `Booking #${booking.bookingId}`,

      subtitle:
        booking.purpose || "No purpose provided",

      vanId,

      vanName:
        vanId === "unassigned"
          ? "Van not assigned"
          : vanNames.get(vanId) ||
            `Van #${booking.assignedVanId}`,

      startMs: departure.getTime(),
      endMs: returning.getTime(),

      booking,
    }];
  });

  const maintenanceEvents = maintenance.flatMap(
    (record) => {
      const firstDay = parseDay(
        record.scheduledDate
      );

      const lastDay = parseDay(
        record.plannedEndDate ||
        record.scheduledDate
      );

      if (
        !firstDay ||
        !lastDay ||
        lastDay < firstDay
      ) {
        return [];
      }

      const vanId = String(record.vanId);

      return [{
        id: `maintenance-${record.maintenanceId}`,
        kind: "MAINTENANCE",

        status: String(
          record.status || ""
        ).toUpperCase(),

        title: `Maintenance #${record.maintenanceId}`,

        subtitle:
          record.description || "Maintenance work",

        vanId,

        vanName:
          record.registration ||
          vanNames.get(vanId) ||
          `Van #${vanId}`,

        startMs: startOfDay(firstDay),

        // Maintenance end date is inclusive.
        endMs: new Date(
          lastDay.getFullYear(),
          lastDay.getMonth(),
          lastDay.getDate() + 1
        ).getTime(),

        maintenance: record,
      }];
    }
  );

  return [
    ...bookingEvents,
    ...maintenanceEvents,
  ];
}

// =====================================
// Check whether an event overlaps a day
// =====================================

function isOnDay(event, date) {
  const dayStart = startOfDay(date);

  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1
  ).getTime();

  return (
    event.startMs < nextDay &&
    event.endMs > dayStart
  );
}

// =====================================
// Admin Calendar
// =====================================

export default function AdminCalendar({
  initialVanId = "all",
}) {
  const [month, setMonth] = useState(
    () => new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    )
  );

  const [selectedDay, setSelectedDay] = useState(
    () => dateKey(new Date())
  );

  const [vans, setVans] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [maintenance, setMaintenance] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  const [vanFilter, setVanFilter] = useState(
    String(initialVanId)
  );

  const [typeFilter, setTypeFilter] = useState("ALL");

  const [statusFilter, setStatusFilter] = useState(
    "ACTIVE"
  );

  const [detail, setDetail] = useState(null);

  // =====================================
  // Update selected van from parent
  // =====================================

  useEffect(() => {
    setVanFilter(String(initialVanId));
  }, [initialVanId]);

  // =====================================
  // Load database records
  // =====================================

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [
          bookingData,
          maintenanceData,
          vanData,
        ] = await Promise.all([
          getBookings(controller.signal),
          getMaintenanceRecords(controller.signal),
          getVans(controller.signal),
        ]);

        if (controller.signal.aborted) return;

        if (
          !Array.isArray(maintenanceData) ||
          !Array.isArray(vanData)
        ) {
          throw new Error(
            "Maintenance or Vans API returned an invalid response."
          );
        }

        setBookings(bookingData);
        setMaintenance(maintenanceData);
        setVans(vanData);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err.message || "Unable to load calendar."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => controller.abort();
  }, [refreshKey]);

  function refresh() {
    setRefreshKey((previous) => previous + 1);
  }

  // =====================================
  // Combine database records
  // =====================================

  const events = useMemo(
    () => buildEvents(
      bookings,
      maintenance,
      vans
    ),
    [bookings, maintenance, vans]
  );

  // =====================================
  // Apply filters
  // =====================================

  const visible = useMemo(() => {
    return events.filter((event) => {
      if (
        typeFilter !== "ALL" &&
        event.kind !== typeFilter
      ) {
        return false;
      }

      if (
        vanFilter !== "all" &&
        event.vanId !== vanFilter
      ) {
        return false;
      }

      if (statusFilter === "ACTIVE") {
        return event.kind === "BOOKING"
          ? ACTIVE_BOOKING.includes(event.status)
          : ACTIVE_MAINTENANCE.includes(event.status);
      }

      return (
        statusFilter === "ALL" ||
        event.status === statusFilter
      );
    });
  }, [
    events,
    typeFilter,
    vanFilter,
    statusFilter,
  ]);

  // =====================================
  // Generate Monday-first calendar grid
  // =====================================

  const calendarDays = useMemo(() => {
    const first = new Date(
      month.getFullYear(),
      month.getMonth(),
      1
    );

    const mondayOffset =
      (first.getDay() + 6) % 7;

    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0
    ).getDate();

    const cellCount =
      Math.ceil(
        (mondayOffset + daysInMonth) / 7
      ) * 7;

    return Array.from(
      { length: cellCount },
      (_, index) => new Date(
        month.getFullYear(),
        month.getMonth(),
        index - mondayOffset + 1
      )
    );
  }, [month]);

  // =====================================
  // Monthly statistics
  // =====================================

  const monthStart = new Date(
    month.getFullYear(),
    month.getMonth(),
    1
  ).getTime();

  const monthEnd = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    1
  ).getTime();

  const monthEvents = visible.filter(
    (event) =>
      event.startMs < monthEnd &&
      event.endMs > monthStart
  );

  const monthBookings = monthEvents.filter(
    (event) => event.kind === "BOOKING"
  ).length;

  const monthMaintenance = monthEvents.filter(
    (event) => event.kind === "MAINTENANCE"
  ).length;

  // =====================================
  // Selected day agenda
  // =====================================

  const today = dateKey(new Date());

  const dayDate =
    parseDay(selectedDay) || new Date();

  const dayEvents = visible
    .filter((event) =>
      isOnDay(event, dayDate)
    )
    .sort(
      (a, b) =>
        a.startMs - b.startMs ||
        a.title.localeCompare(b.title)
    );

  // =====================================
  // Navigation
  // =====================================

  function changeMonth(delta) {
    const next = new Date(
      month.getFullYear(),
      month.getMonth() + delta,
      1
    );

    setMonth(next);
    setSelectedDay(dateKey(next));
  }

  function jumpToday() {
    const now = new Date();

    setMonth(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      )
    );

    setSelectedDay(dateKey(now));
  }

  function selectDay(date) {
    setSelectedDay(dateKey(date));

    if (
      date.getMonth() !== month.getMonth() ||
      date.getFullYear() !== month.getFullYear()
    ) {
      setMonth(
        new Date(
          date.getFullYear(),
          date.getMonth(),
          1
        )
      );
    }
  }

  // =====================================
  // Render
  // =====================================

  return (
    <div className="vf-calendar-page">

      {/* Header */}

      <header className="vf-calendar-heading">
        <div>
          <span className="vf-calendar-eyebrow">
            FLEET SCHEDULE
          </span>

          <h1>Calendar / Schedule</h1>

          <p>
            View bookings and maintenance in one
            calendar. Click an event for details.
          </p>
        </div>

        <button
          type="button"
          className="vf-cal-btn vf-cal-btn-quiet"
          onClick={refresh}
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </header>

      {/* Summary */}

      <section
        className="vf-calendar-stats"
        aria-label="Calendar summary"
      >
        <article>
          <span>Events this month</span>

          <strong>
            {loading ? "—" : monthEvents.length}
          </strong>

          <small>
            According to current filters
          </small>
        </article>

        <article>
          <span>Bookings</span>

          <strong>
            {loading ? "—" : monthBookings}
          </strong>

          <small>
            Requests and approved trips
          </small>
        </article>

        <article>
          <span>Maintenance</span>

          <strong>
            {loading ? "—" : monthMaintenance}
          </strong>

          <small>
            Scheduled / ongoing work
          </small>
        </article>
      </section>

      {/* Error */}

      {error && (
        <div
          className="vf-calendar-error"
          role="alert"
        >
          {error}

          <button
            type="button"
            onClick={refresh}
          >
            Try again
          </button>
        </div>
      )}

      {/* Calendar */}

      <section className="vf-calendar-panel">

        {/* Month navigation and filters */}

        <div className="vf-calendar-controls">
          <div className="vf-calendar-month-nav">

            <button
              type="button"
              aria-label="Previous month"
              onClick={() => changeMonth(-1)}
            >
              ‹
            </button>

            <h2>
              {month.toLocaleDateString("en-NZ", {
                month: "long",
                year: "numeric",
              })}
            </h2>

            <button
              type="button"
              aria-label="Next month"
              onClick={() => changeMonth(1)}
            >
              ›
            </button>

            <button
              type="button"
              className="vf-cal-today"
              onClick={jumpToday}
            >
              Today
            </button>
          </div>

          <div className="vf-calendar-filters">

            <label>
              Vehicle

              <select
                value={vanFilter}
                onChange={(e) =>
                  setVanFilter(e.target.value)
                }
              >
                <option value="all">
                  All vehicles
                </option>

                <option value="unassigned">
                  Unassigned bookings
                </option>

                {vans.map((van) => (
                  <option
                    key={van.vanId}
                    value={String(van.vanId)}
                  >
                    {van.registration}
                    {" — "}
                    {van.makeModel}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Event type

              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value)
                }
              >
                <option value="ALL">
                  Bookings + Maintenance
                </option>

                <option value="BOOKING">
                  Bookings only
                </option>

                <option value="MAINTENANCE">
                  Maintenance only
                </option>
              </select>
            </label>

            <label>
              Status

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value)
                }
              >
                <option value="ACTIVE">
                  Active only
                </option>

                <option value="ALL">
                  All statuses
                </option>

                <option value="PENDING">
                  Pending
                </option>

                <option value="APPROVED">
                  Approved
                </option>

                <option value="CANCELLED">
                  Cancelled bookings
                </option>

                <option value="DECLINED">
                  Declined bookings
                </option>

                <option value="SCHEDULED">
                  Scheduled maintenance
                </option>

                <option value="IN_PROGRESS">
                  In-progress maintenance
                </option>

                <option value="DONE">
                  Completed maintenance
                </option>
              </select>
            </label>

          </div>
        </div>

        {/* Loading */}

        {loading ? (
          <div
            className="vf-calendar-loading"
            role="status"
          >
            Loading schedule from VisionFleetDB...
          </div>
        ) : error ? (
          <div className="vf-calendar-loading">
            Calendar unavailable until data
            loads successfully.
          </div>
        ) : (
          <>
            {/* Monthly Grid */}

            <div
              className="vf-calendar-grid"
              role="grid"
              aria-label="Monthly fleet calendar"
            >

              {DAYS.map((day) => (
                <div
                  key={day}
                  className="vf-calendar-weekday"
                  role="columnheader"
                >
                  {day}
                </div>
              ))}

              {calendarDays.map((date) => {
                const key = dateKey(date);

                const dayItems = visible
                  .filter((event) =>
                    isOnDay(event, date)
                  )
                  .sort(
                    (a, b) =>
                      a.startMs - b.startMs
                  );

                const outside =
                  date.getMonth() !==
                  month.getMonth();

                const classes = [
                  "vf-calendar-cell",
                  outside ? "vf-cal-outside" : "",
                  key === today
                    ? "vf-cal-today-cell"
                    : "",
                  key === selectedDay
                    ? "vf-cal-selected"
                    : "",
                ].filter(Boolean).join(" ");

                return (
                  <div
                    key={key}
                    role="gridcell"
                    className={classes}
                  >

                    <button
                      type="button"
                      className="vf-cal-day-number"
                      onClick={() =>
                        selectDay(date)
                      }
                      aria-label={
                        `Show events for ${formatDate(key)}`
                      }
                      aria-pressed={
                        key === selectedDay
                      }
                    >
                      {date.getDate()}
                    </button>

                    <div className="vf-cal-cell-events">

                      {dayItems
                        .slice(0, 3)
                        .map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            className={
                              "vf-cal-event " +
                              `vf-cal-event-${event.kind.toLowerCase()} ` +
                              `vf-cal-status-${event.status.toLowerCase()}`
                            }
                            onClick={() =>
                              setDetail(event)
                            }
                            title={
                              `${event.title} — ${event.vanName}`
                            }
                          >
                            <span>
                              {event.kind === "BOOKING"
                                ? "B"
                                : "M"}
                            </span>

                            {" "}
                            {event.title}
                          </button>
                        ))}

                      {dayItems.length > 3 && (
                        <button
                          type="button"
                          className="vf-cal-more"
                          onClick={() =>
                            selectDay(date)
                          }
                        >
                          +{dayItems.length - 3} more
                        </button>
                      )}

                    </div>
                  </div>
                );
              })}

            </div>

            {/* Legend and selected day */}

            <div className="vf-calendar-bottom">

              <div className="vf-cal-legend">
                <span>
                  <i className="vf-cal-dot-booking" />
                  Booking
                </span>

                <span>
                  <i className="vf-cal-dot-maintenance" />
                  Maintenance
                </span>

                <small>
                  Multi-day events appear on
                  every day they overlap.
                </small>
              </div>

              <div className="vf-calendar-agenda">

                <div className="vf-cal-agenda-head">
                  <h3>
                    {dayDate.toLocaleDateString(
                      "en-NZ",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }
                    )}
                  </h3>

                  <span>
                    {dayEvents.length} event(s)
                  </span>
                </div>

                {dayEvents.length === 0 ? (
                  <p className="vf-cal-no-events">
                    No bookings or maintenance
                    for this date with the
                    selected filters.
                  </p>
                ) : (
                  <div className="vf-cal-agenda-items">

                    {dayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className="vf-cal-agenda-item"
                        onClick={() =>
                          setDetail(event)
                        }
                      >
                        <span
                          className={
                            "vf-cal-agenda-mark " +
                            `vf-cal-mark-${event.kind.toLowerCase()}`
                          }
                        />

                        <span>
                          <strong>
                            {event.title}
                          </strong>

                          <small>
                            {event.vanName}
                            {" · "}
                            {event.subtitle}
                          </small>
                        </span>

                        <em>
                          {statusName(
                            event.status
                          )}
                        </em>
                      </button>
                    ))}

                  </div>
                )}

              </div>
            </div>
          </>
        )}
      </section>

      {/* =====================================
          Event Details Modal
          ===================================== */}

      {detail && (
        <Modal
          open
          size="md"
          title={detail.title}
          subtitle={
            detail.kind === "BOOKING"
              ? "Booking schedule details"
              : "Maintenance schedule details"
          }
          onClose={() => setDetail(null)}
        >
          <div className="vfm-body">

            <div className="vf-cal-detail-banner">
              <strong>
                {detail.vanName}
              </strong>

              <span
                className={
                  "vf-cal-detail-status " +
                  `vf-cal-detail-${detail.status.toLowerCase()}`
                }
              >
                {statusName(detail.status)}
              </span>
            </div>

            {detail.kind === "BOOKING" ? (
              <div className="vf-cal-detail-list">

                <div>
                  <span>Booking ID</span>
                  <strong>
                    #{detail.booking.bookingId}
                  </strong>
                </div>

                <div>
                  <span>Purpose</span>
                  <strong>
                    {detail.booking.purpose || "—"}
                  </strong>
                </div>

                <div>
                  <span>Booking for</span>
                  <strong>
                    {detail.booking.bookingFor || "—"}
                  </strong>
                </div>

                <div>
                  <span>Driving option</span>
                  <strong>
                    {statusName(
                      detail.booking.drivingOption
                    )}
                  </strong>
                </div>

                <div>
                  <span>Departure</span>
                  <strong>
                    {formatTime(
                      detail.booking.departureAt
                    )}
                  </strong>
                </div>

                <div>
                  <span>Return</span>
                  <strong>
                    {formatTime(
                      detail.booking.returnAt
                    )}
                  </strong>
                </div>

                <div>
                  <span>Passenger count</span>
                  <strong>
                    {detail.booking.passengerCount}
                  </strong>
                </div>

                <div>
                  <span>Recurrence group</span>
                  <strong>
                    {detail.booking.recurrenceGroupId || "—"}
                  </strong>
                </div>

              </div>
            ) : (
              <div className="vf-cal-detail-list">

                <div>
                  <span>Maintenance ID</span>
                  <strong>
                    #{detail.maintenance.maintenanceId}
                  </strong>
                </div>

                <div>
                  <span>Vehicle</span>
                  <strong>
                    {detail.vanName}
                  </strong>
                </div>

                <div>
                  <span>Description</span>
                  <strong>
                    {detail.maintenance.description || "—"}
                  </strong>
                </div>

                <div>
                  <span>Scheduled start</span>
                  <strong>
                    {formatDate(
                      detail.maintenance.scheduledDate
                    )}
                  </strong>
                </div>

                <div>
                  <span>Planned end</span>
                  <strong>
                    {formatDate(
                      detail.maintenance.plannedEndDate ||
                      detail.maintenance.scheduledDate
                    )}
                  </strong>
                </div>

              </div>
            )}

          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
