
import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import logo from "../assets/logo.png";
import "../styles/DriverDashboard.css";

const API = "/api/driver/trips";

// =====================================
// FORMAT DATE
// =====================================

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function tripStatus(value) {
  return String(value || "").toUpperCase();
}

// =====================================
// API ERROR HANDLING
// =====================================

async function readError(response) {
  if (response.status === 401) {
    return "Session expired. Please sign in again.";
  }

  if (response.status === 403) {
    return "Driver access is required.";
  }

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    if (typeof data === "string") {
      return data;
    }

    if (data.errors) {
      return Object.values(data.errors)
        .flat()
        .join(" ");
    }

    return (
      data.message ||
      data.title ||
      data.detail ||
      `HTTP ${response.status}`
    );
  } catch {
    return text && !text.trim().startsWith("<")
      ? text
      : `HTTP ${response.status}`;
  }
}

// =====================================
// API REQUEST
// =====================================

async function apiRequest(
  path,
  method = "GET",
  body,
  signal
) {
  const headers = {};

  if (method !== "GET") {
    const tokenResponse = await fetch(
      "/api/security/csrf-token",
      {
        credentials: "include",
        cache: "no-store",
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(
        await readError(tokenResponse)
      );
    }

    const token = await tokenResponse.json();

    if (!token.csrfToken) {
      throw new Error("Security token is missing.");
    }

    headers["X-CSRF-TOKEN"] = token.csrfToken;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method,
    credentials: "include",
    cache: "no-store",
    headers,
    ...(signal ? { signal } : {}),
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.status === 204
    ? {}
    : response.json();
}

// =====================================
// NEW: TRIP PURPOSE
//
// Shared between:
// - My Trips
// - Completed
// - Start Trip confirmation
// - End Trip confirmation
//
// Uses inline styling, so no CSS change.
// =====================================

function TripPurpose({ purpose }) {
  return (
    <section
      aria-label="Trip purpose"
      style={{
        margin: "14px 0 18px",
        padding: "15px 16px",
        borderLeft: "4px solid #0284c7",
        borderRadius: "10px",
        background: "#eef7ff",
      }}
    >
      <span
        style={{
          display: "block",
          marginBottom: "7px",
          color: "#075985",
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "0.07em",
        }}
      >
        TRIP PURPOSE
      </span>

      <p
        style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 600,
          lineHeight: 1.55,
          color: "#15324c",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {purpose?.trim() || "Not specified by Staff"}
      </p>
    </section>
  );
}

// =====================================
// TRIP CARD
// =====================================

function TripCard({
  trip,
  onStart,
  onEnd,
  now,
}) {
  const state = tripStatus(trip.status);

  const canStart =
    state === "SCHEDULED" &&
    tripStatus(trip.bookingStatus) === "APPROVED" &&
    new Date(trip.returnAt).getTime() > now;

  const canEnd =
    state === "IN_PROGRESS";

  return (
    <article className="vd-trip-card">

      {/* Journey ID and Status */}

      <div className="vd-trip-top">
        <span className="vd-trip-number">
          TRIP #{trip.journeyId}
        </span>

        <span
          className={
            "vd-status vd-status-" +
            state.toLowerCase()
          }
        >
          {state === "SCHEDULED"
            ? "Upcoming"
            : state === "IN_PROGRESS"
              ? "In Progress"
              : state === "COMPLETED"
                ? "Completed"
                : state}
        </span>
      </div>

      {/* Vehicle */}

      <h2>
        {trip.vanRegistration || "Assigned Vehicle"}
      </h2>

      <p className="vd-trip-vehicle">
        {trip.vanModel || "Vision Fleet Vehicle"}
      </p>

      {/* NEW: Prominent Purpose */}

      <TripPurpose purpose={trip.purpose} />

      {/* Booking Information */}

      <div className="vd-trip-info">
        <div>
          <span>Departure</span>

          <strong>
            {formatDate(trip.departureAt)}
          </strong>
        </div>

        <div>
          <span>Return</span>

          <strong>
            {formatDate(trip.returnAt)}
          </strong>
        </div>

        <div>
          <span>Requested passengers</span>

          <strong>
            {trip.passengerCount}
          </strong>
        </div>

        <div>
          <span>Booked for</span>

          <strong>
            {trip.bookedFor || "—"}
          </strong>
        </div>
      </div>

      {/* Actual Passenger Count */}

      {state !== "SCHEDULED" && (
        <div className="vd-trip-actual">
          <span>Actual passengers</span>

          <strong>
            {trip.actualPassengerCount ?? "—"}
          </strong>
        </div>
      )}

      {/* In Progress Time */}

      {state === "IN_PROGRESS" && (
        <div className="vd-trip-time">
          Started at {formatDate(trip.startedAt)}
        </div>
      )}

      {/* Completed Times */}

      {state === "COMPLETED" && (
        <div className="vd-trip-time">
          Started: {formatDate(trip.startedAt)}
          <br />
          Finished: {formatDate(trip.endedAt)}
        </div>
      )}

      {/* Start Trip */}

      {canStart && (
        <button
          type="button"
          className="vd-primary"
          onClick={() => onStart(trip)}
        >
          Start Trip
        </button>
      )}

      {/* End Trip */}

      {canEnd && (
        <button
          type="button"
          className="vd-primary vd-end-button"
          onClick={() => onEnd(trip)}
        >
          End Trip
        </button>
      )}

      {/* Locked Trip Warning */}

      {state === "SCHEDULED" && !canStart && (
        <p className="vd-trip-warning">
          This trip cannot be started because
          its booking is no longer eligible.
          Please contact Admin.
        </p>
      )}
    </article>
  );
}

// =====================================
// DRIVER DASHBOARD
// =====================================

export default function DriverDashboard({
  user,
  onLogout,
  loggingOut,
  logoutError,
}) {
  // =====================================
  // STATE
  // =====================================

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState("active");

  const [modal, setModal] = useState(null);

  const [passengerCount, setPassengerCount] =
    useState("");

  const [actionError, setActionError] =
    useState("");

  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // =====================================
  // LOAD ASSIGNED TRIPS
  // =====================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrips() {
      setLoading(true);
      setLoadError("");

      try {
        const data = await apiRequest(
          API,
          "GET",
          undefined,
          controller.signal
        );

        if (!Array.isArray(data)) {
          throw new Error(
            "Invalid Driver Trips API response."
          );
        }

        if (!controller.signal.aborted) {
          setTrips(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error.message ||
            "Unable to load your assigned trips."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadTrips();

    return () => controller.abort();
  }, [refreshKey]);

  // =====================================
  // UPDATE CURRENT TIME
  // =====================================

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  function refresh() {
    setNow(Date.now());
    setRefreshKey((value) => value + 1);
  }

  // =====================================
  // ACTIVE TRIPS
  // =====================================

  const activeTrips = useMemo(() => {
    const priorities = {
      IN_PROGRESS: 0,
      SCHEDULED: 1,
      CANCELLED: 2,
    };

    return trips
      .filter(
        (trip) =>
          tripStatus(trip.status) !== "COMPLETED"
      )
      .sort((a, b) => {
        const aPriority =
          priorities[tripStatus(a.status)] ?? 3;

        const bPriority =
          priorities[tripStatus(b.status)] ?? 3;

        return (
          aPriority - bPriority ||
          new Date(a.departureAt) -
            new Date(b.departureAt)
        );
      });
  }, [trips]);

  // =====================================
  // COMPLETED TRIPS
  // =====================================

  const completedTrips = useMemo(
    () => trips
      .filter(
        (trip) =>
          tripStatus(trip.status) === "COMPLETED"
      )
      .sort(
        (a, b) =>
          new Date(b.endedAt) -
          new Date(a.endedAt)
      ),
    [trips]
  );

  const displayedTrips =
    tab === "active"
      ? activeTrips
      : completedTrips;

  // =====================================
  // OPEN START TRIP
  // =====================================

  function openStart(trip) {
    if (busy) return;

    setPassengerCount(
      String(trip.passengerCount ?? 1)
    );

    setActionError("");

    setModal({
      type: "start",
      trip,
    });
  }

  // =====================================
  // CONFIRM START TRIP
  // =====================================

  async function confirmStart(event) {
    event.preventDefault();

    if (busy || modal?.type !== "start") {
      return;
    }

    const count = Number(passengerCount);

    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100
    ) {
      setActionError(
        "Enter a valid passenger count between 1 and 100."
      );

      return;
    }

    const tripId = modal.trip.journeyId;

    setBusy(true);
    setActionError("");

    try {
      await apiRequest(
        `${API}/${tripId}/start`,
        "POST",
        {
          actualPassengerCount: count,
        }
      );

      setModal(null);

      setNotice(
        `Trip #${tripId} started. ` +
        `${count} passenger(s) confirmed.`
      );

      refresh();
    } catch (error) {
      setActionError(
        error.message ||
        "Unable to start this trip."
      );
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // OPEN END TRIP
  // =====================================

  function openEnd(trip) {
    if (busy) return;

    setActionError("");

    setModal({
      type: "end",
      trip,
    });
  }

  // =====================================
  // CONFIRM END TRIP
  // =====================================

  async function confirmEnd() {
    if (busy || modal?.type !== "end") {
      return;
    }

    const tripId = modal.trip.journeyId;

    setBusy(true);
    setActionError("");

    try {
      await apiRequest(
        `${API}/${tripId}/end`,
        "POST"
      );

      setModal(null);

      setNotice(
        `Trip #${tripId} completed successfully.`
      );

      refresh();
    } catch (error) {
      setActionError(
        error.message ||
        "Unable to end this trip."
      );
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    if (busy) return;

    setModal(null);
    setActionError("");
  }

  const displayName =
    user?.fullName || "Driver";

  // =====================================
  // RENDER
  // =====================================

  return (
    <div className="vd-app">

      {/* =====================================
          HEADER
          ===================================== */}

      <header className="vd-header">
        <div className="vd-header-inner">
          <div className="vd-brand">
            <img
              src={logo}
              alt=""
            />

            <strong>
              Vision Fleet
            </strong>
          </div>

          <button
            type="button"
            className="vd-logout"
            onClick={onLogout}
            disabled={loggingOut}
          >
            {loggingOut
              ? "Signing out..."
              : "Sign out"}
          </button>
        </div>
      </header>

      {/* =====================================
          MAIN
          ===================================== */}

      <main className="vd-main">

        <section className="vd-welcome">
          <span>
            DRIVER WORKSPACE
          </span>

          <h1>
            Hello, {displayName}
          </h1>

          <p>
            View your assigned trips and their
            purpose, confirm passengers and manage
            the start and end of each journey.
          </p>
        </section>

        {/* Alerts */}

        {logoutError && (
          <div
            className="vd-alert vd-error"
            role="alert"
          >
            {logoutError}
          </div>
        )}

        {loadError && (
          <div
            className="vd-alert vd-error"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {notice && (
          <div
            className="vd-alert vd-success"
            role="status"
          >
            {notice}
          </div>
        )}

        {/* =====================================
            NAVIGATION
            ===================================== */}

        <nav
          className="vd-tabs"
          aria-label="Driver trips"
        >
          <button
            type="button"
            className={
              tab === "active"
                ? "vd-tab-active"
                : ""
            }
            onClick={() => setTab("active")}
          >
            My Trips

            <span>
              {activeTrips.length}
            </span>
          </button>

          <button
            type="button"
            className={
              tab === "history"
                ? "vd-tab-active"
                : ""
            }
            onClick={() => setTab("history")}
          >
            Completed

            <span>
              {completedTrips.length}
            </span>
          </button>
        </nav>

        {/* =====================================
            LIST HEADER
            ===================================== */}

        <div className="vd-list-heading">
          <h2>
            {tab === "active"
              ? "Assigned trips"
              : "Trip history"}
          </h2>

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>

        {/* =====================================
            TRIP CARDS
            ===================================== */}

        {loading ? (
          <div className="vd-empty">
            Loading your journeys...
          </div>
        ) : loadError ? (
          <div className="vd-empty">
            Unable to display trips.
          </div>
        ) : displayedTrips.length === 0 ? (
          <div className="vd-empty">
            <div className="vd-empty-icon">
              ✓
            </div>

            <h3>
              {tab === "active"
                ? "No assigned trips"
                : "No completed trips yet"}
            </h3>

            <p>
              {tab === "active"
                ? "Your new assignments will appear here after Admin assigns you."
                : "Completed journeys will appear here."}
            </p>
          </div>
        ) : (
          <div className="vd-trip-list">
            {displayedTrips.map((trip) => (
              <TripCard
                key={trip.journeyId}
                trip={trip}
                now={now}
                onStart={openStart}
                onEnd={openEnd}
              />
            ))}
          </div>
        )}

      </main>

      {/* =====================================
          START TRIP MODAL
          ===================================== */}

      {modal?.type === "start" && (
        <Modal
          open
          size="sm"
          title={`Start Trip #${modal.trip.journeyId}`}
          subtitle="Confirm the number of passengers before departure."
          busy={busy}
          onClose={closeModal}
        >
          <form onSubmit={confirmStart}>
            <div className="vfm-body">

              {actionError && (
                <div
                  className="vfm-error"
                  role="alert"
                >
                  {actionError}
                </div>
              )}

              {/* Show purpose before starting */}

              <TripPurpose
                purpose={modal.trip.purpose}
              />

              <div className="vd-confirm-info">
                <span>
                  Vehicle:{" "}
                  {modal.trip.vanRegistration || "—"}
                </span>

                <span>
                  Scheduled:{" "}
                  {formatDate(
                    modal.trip.departureAt
                  )}
                </span>

                <span>
                  Requested passengers:{" "}
                  {modal.trip.passengerCount}
                </span>
              </div>

              {/* Actual Passenger Confirmation */}

              <label className="vd-count-field">
                <span>
                  Actual number of passengers
                </span>

                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="100"
                  step="1"
                  required
                  data-modal-autofocus
                  value={passengerCount}
                  disabled={busy}
                  onChange={(event) =>
                    setPassengerCount(
                      event.target.value
                    )
                  }
                />

                <small>
                  Count the actual passengers
                  boarding this trip.
                  The Backend also checks
                  the van's seating capacity.
                </small>
              </label>
            </div>

            <div className="vfm-footer">
              <button
                type="button"
                className="vfm-btn vfm-btn-secondary"
                disabled={busy}
                onClick={closeModal}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="vfm-btn vfm-btn-primary"
                disabled={busy}
              >
                {busy
                  ? "Starting..."
                  : "Confirm & Start Trip"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================
          END TRIP MODAL
          ===================================== */}

      {modal?.type === "end" && (
        <Modal
          open
          size="sm"
          title={`End Trip #${modal.trip.journeyId}`}
          subtitle="Finish the journey and record its actual end time."
          busy={busy}
          onClose={closeModal}
        >
          <div className="vfm-body">

            {actionError && (
              <div
                className="vfm-error"
                role="alert"
              >
                {actionError}
              </div>
            )}

            {/* Show purpose before finishing */}

            <TripPurpose
              purpose={modal.trip.purpose}
            />

            <div className="vd-confirm-info">
              <span>
                Vehicle:{" "}
                {modal.trip.vanRegistration || "—"}
              </span>

              <span>
                Passengers:{" "}
                {modal.trip.actualPassengerCount}
              </span>

              <span>
                Started:{" "}
                {formatDate(
                  modal.trip.startedAt
                )}
              </span>
            </div>

            <p className="vd-confirm-text">
              Have you completed this journey?
              You cannot start it again once
              it has been marked Completed.
            </p>
          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              disabled={busy}
              onClick={closeModal}
            >
              Go Back
            </button>

            <button
              type="button"
              className="vfm-btn vfm-btn-primary"
              onClick={confirmEnd}
              disabled={busy}
            >
              {busy
                ? "Finishing..."
                : "Confirm End Trip"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
