import { useEffect, useState } from "react";
import Modal, { ConfirmModal } from "../components/Modal";
import "../styles/DriverAssignment.css";

// =====================================
// API ENDPOINTS
// =====================================

const API = "/api/driver-assignments";
const HISTORY_API = `${API}/history`;

// =====================================
// API HELPERS
// =====================================

async function apiError(response) {
  if (response.status === 401) {
    return "Session expired. Please sign in again.";
  }

  if (response.status === 403) {
    return "Admin access is required.";
  }

  const text = await response.text();

  try {
    const result = JSON.parse(text);

    if (result.errors) {
      return Object.values(result.errors)
        .flat()
        .join(" ");
    }

    return (
      result.message ||
      result.detail ||
      result.title ||
      `HTTP ${response.status}`
    );
  } catch {
    return text && !text.trim().startsWith("<")
      ? text
      : `HTTP ${response.status}`;
  }
}

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
      throw new Error(await apiError(tokenResponse));
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.csrfToken) {
      throw new Error("Missing CSRF token.");
    }

    headers["X-CSRF-TOKEN"] = tokenData.csrfToken;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method,
    credentials: "include",
    cache: "no-store",
    headers,
    signal,
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : {}),
  });

  if (!response.ok) {
    throw new Error(await apiError(response));
  }

  return response.status === 204
    ? {}
    : response.json();
}

// =====================================
// FORMAT HELPERS
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

const upper = (value) =>
  String(value ?? "").toUpperCase();

const readable = (value) =>
  upper(value).replaceAll("_", " ") || "UNKNOWN";

// =====================================
// ASSIGNMENT STATUS
// =====================================

function canManage(row, now) {
  return (
    new Date(row.departureAt).getTime() > now &&
    (
      !row.journeyStatus ||
      upper(row.journeyStatus) === "SCHEDULED"
    ) &&
    !row.journeyStartedAt &&
    !row.journeyEndedAt
  );
}

function assignmentStatus(row, now) {
  const status = upper(row.journeyStatus);

  if (status === "COMPLETED") {
    return "Completed";
  }

  if (status === "IN_PROGRESS") {
    return "In progress";
  }

  if (status === "CANCELLED") {
    return "Cancelled";
  }

  if (
    row.journeyStartedAt ||
    new Date(row.departureAt).getTime() <= now
  ) {
    return "Started / locked";
  }

  return row.driverUserId == null
    ? "Unassigned"
    : "Assigned";
}

// =====================================
// JOURNEY DELETE PERMISSION
// =====================================

function canDeleteHistory(trip, now) {
  // Self Drive entries are virtual.
  // No physical Journey exists to delete.

  if (trip.isVirtual || trip.journeyId == null) {
    return false;
  }

  const status = upper(trip.status);

  return (
    (
      status === "COMPLETED" &&
      !!trip.endedAt
    ) ||
    status === "CANCELLED" ||
    (
      status === "SCHEDULED" &&
      !trip.startedAt &&
      new Date(trip.returnAt).getTime() <= now
    )
  );
}

// =====================================
// MAIN COMPONENT
// =====================================

export default function DriverAssignment() {
  const [activeTab, setActiveTab] =
    useState("assignments");

  const [assignments, setAssignments] =
    useState([]);

  const [drivers, setDrivers] =
    useState([]);

  const [history, setHistory] =
    useState([]);

  const [loadingAssignments, setLoadingAssignments] =
    useState(true);

  const [loadingHistory, setLoadingHistory] =
    useState(true);

  const [assignmentError, setAssignmentError] =
    useState("");

  const [historyError, setHistoryError] =
    useState("");

  const [actionError, setActionError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [now, setNow] =
    useState(Date.now());

  // Assignment filters

  const [search, setSearch] =
    useState("");

  const [filter, setFilter] =
    useState("ALL");

  // Journey History filters

  const [historySearch, setHistorySearch] =
    useState("");

  const [historyStatus, setHistoryStatus] =
    useState("ALL");

  // Modals

  const [modal, setModal] =
    useState(null);

  const [driverId, setDriverId] =
    useState("");

  // =====================================
  // UPDATE CLOCK EVERY 15 SECONDS
  // =====================================

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  // =====================================
  // LOAD DRIVER ASSIGNMENTS
  // =====================================

  // Assignments and History load separately.
  // A History error will not break Assignments.

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssignments() {
      setLoadingAssignments(true);
      setAssignmentError("");

      try {
        const [
          bookingData,
          driverData
        ] = await Promise.all([
          apiRequest(
            API,
            "GET",
            undefined,
            controller.signal
          ),

          apiRequest(
            `${API}/drivers`,
            "GET",
            undefined,
            controller.signal
          ),
        ]);

        if (
          !Array.isArray(bookingData) ||
          !Array.isArray(driverData)
        ) {
          throw new Error(
            "Unexpected assignment API response."
          );
        }

        if (!controller.signal.aborted) {
          // Driver Required bookings only.
          // Self Drive does not need assignment.

          setAssignments(
            bookingData.filter(
              (row) =>
                upper(row.drivingOption) ===
                "DRIVER_REQUIRED"
            )
          );

          setDrivers(driverData);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAssignmentError(
            error.message ||
            "Unable to load assignments."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingAssignments(false);
        }
      }
    }

    loadAssignments();

    return () => controller.abort();
  }, [refreshKey]);

  // =====================================
  // LOAD JOURNEY HISTORY
  // =====================================

  // Reload every 15 seconds while Admin
  // is viewing the Journey History tab.

  useEffect(() => {
    if (activeTab !== "history") {
      return;
    }

    const controller = new AbortController();

    let pending = false;

    setLoadingHistory(true);

    async function loadHistory(initial = false) {
      if (
        pending ||
        controller.signal.aborted
      ) {
        return;
      }

      pending = true;

      if (initial) {
        setHistoryError("");
      }

      try {
        const data = await apiRequest(
          HISTORY_API,
          "GET",
          undefined,
          controller.signal
        );

        if (!Array.isArray(data)) {
          throw new Error(
            "Unexpected Journey History response."
          );
        }

        if (!controller.signal.aborted) {
          setHistory(data);
          setHistoryError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryError(
            error.message ||
            "Unable to load Journey History."
          );
        }
      } finally {
        pending = false;

        if (!controller.signal.aborted) {
          setLoadingHistory(false);
        }
      }
    }

    loadHistory(true);

    const interval = setInterval(() => {
      loadHistory(false);
    }, 15000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [activeTab, refreshKey]);

  // =====================================
  // REFRESH
  // =====================================

  function reload() {
    setNow(Date.now());

    setRefreshKey((value) => value + 1);
  }

  // =====================================
  // MODAL HANDLERS
  // =====================================

  function openAssign(row) {
    if (
      busy ||
      !canManage(row, now)
    ) {
      return;
    }

    setActionError("");

    setDriverId(
      row.driverUserId == null
        ? ""
        : String(row.driverUserId)
    );

    setModal({
      type: "assign",
      row,
    });
  }

  function openUnassign(row) {
    if (
      busy ||
      !canManage(row, now) ||
      row.driverUserId == null
    ) {
      return;
    }

    setActionError("");

    setModal({
      type: "unassign",
      row,
    });
  }

  function openModal(type, row) {
    if (busy) return;

    setActionError("");

    setModal({
      type,
      row,
    });
  }

  function closeModal() {
    if (busy) return;

    setActionError("");
    setModal(null);
  }

  // =====================================
  // ACTION WRAPPER
  // =====================================

  async function runAction(operation) {
    if (busy) return;

    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      await operation();
      reload();
    } catch (error) {
      setActionError(
        error.message || "Operation failed."
      );
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // ASSIGN DRIVER
  // =====================================

  async function saveAssignment(event) {
    event.preventDefault();

    if (modal?.type !== "assign") {
      return;
    }

    const selectedDriver = Number(driverId);

    if (
      !Number.isInteger(selectedDriver) ||
      selectedDriver < 1
    ) {
      setActionError(
        "Please select an eligible driver."
      );

      return;
    }

    const bookingId = modal.row.bookingId;

    await runAction(async () => {
      const result = await apiRequest(
        `${API}/${bookingId}/assign`,
        "PUT",
        {
          driverUserId: selectedDriver,
        }
      );

      setModal(null);

      setNotice(
        `Booking #${bookingId}: driver assigned.` +
        (
          result.emailSent === false
            ? " Email was not sent."
            : ""
        )
      );
    });
  }

  // =====================================
  // DELETE ASSIGNMENT
  // =====================================

  async function removeAssignment() {
    if (modal?.type !== "unassign") {
      return;
    }

    const bookingId = modal.row.bookingId;

    await runAction(async () => {
      const result = await apiRequest(
        `${API}/${bookingId}/unassign`,
        "PUT"
      );

      setModal(null);

      setNotice(
        `Driver removed from Booking #${bookingId}.` +
        (
          result.emailSent === false
            ? " Notification email was not sent."
            : ""
        )
      );
    });
  }

  // =====================================
  // DELETE JOURNEY HISTORY
  // =====================================

  async function deleteHistory() {
    if (
      modal?.type !== "delete-history" ||
      busy
    ) {
      return;
    }

    const trip = modal.row;

    if (!canDeleteHistory(trip, Date.now())) {
      return;
    }

    await runAction(async () => {
      await apiRequest(
        `${HISTORY_API}/${trip.journeyId}`,
        "DELETE"
      );

      setHistory(
        (rows) =>
          rows.filter(
            (row) =>
              row.historyKey !== trip.historyKey
          )
      );

      setModal(null);

      setNotice(
        `Journey #${trip.journeyId} hidden ` +
        "from Admin History. " +
        "Database record preserved."
      );
    });
  }

  // =====================================
  // ASSIGNMENT STATISTICS
  // =====================================

  const visibleAssignments = assignments.filter(
    (row) =>
      new Date(row.returnAt).getTime() > now
  );

  const assignedCount = visibleAssignments.filter(
    (row) =>
      row.driverUserId != null
  ).length;

  const unassignedCount = visibleAssignments.filter(
    (row) =>
      row.driverUserId == null &&
      canManage(row, now)
  ).length;

  const lockedCount = visibleAssignments.filter(
    (row) =>
      !canManage(row, now)
  ).length;

  // =====================================
  // ASSIGNMENT FILTERS
  // =====================================

  const filteredAssignments =
    visibleAssignments.filter((row) => {
      const keyword = search.toLowerCase().trim();

      const matchesText = [
        row.bookingId,
        row.journeyId,
        row.purpose,
        row.vanRegistration,
        row.vanModel,
        row.driverName,
        row.requesterName,
        row.bookedForName,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(keyword)
      );

      if (!matchesText) {
        return false;
      }

      if (filter === "ASSIGNED") {
        return row.driverUserId != null;
      }

      if (filter === "UNASSIGNED") {
        return (
          row.driverUserId == null &&
          canManage(row, now)
        );
      }

      if (filter === "LOCKED") {
        return !canManage(row, now);
      }

      return true;
    });

  // =====================================
  // HISTORY FILTERS
  // =====================================

  const filteredHistory = history.filter((trip) => {
    const keyword =
      historySearch.toLowerCase().trim();

    const matchesText = [
      trip.journeyId,
      trip.bookingId,
      trip.purpose,
      trip.driverName,
      trip.vanRegistration,
      trip.vanModel,
      trip.drivingOption,
      trip.historyKey,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(keyword)
    );

    return (
      matchesText &&
      (
        historyStatus === "ALL" ||
        upper(trip.status) === historyStatus
      )
    );
  });

  const completedCount = history.filter(
    (trip) =>
      upper(trip.status) === "COMPLETED"
  ).length;

  const inProgressCount = history.filter(
    (trip) =>
      upper(trip.status) === "IN_PROGRESS"
  ).length;

  // =====================================
  // RENDER
  // =====================================

  return (
    <>
      <div className="vf-driver-page">

        {/* =====================================
            PAGE HEADER
            ===================================== */}

        <header className="vf-driver-header">
          <div>
            <span className="vf-driver-eyebrow">
              FLEET OPERATIONS
            </span>

            <h1>Journey Management</h1>

            <p>
              Manage drivers, review journeys and
              compare booked passengers with actual
              passengers.
            </p>
          </div>

          <button
            type="button"
            className="vf-driver-btn vf-driver-btn-ghost"
            disabled={
              busy ||
              (
                activeTab === "history"
                  ? loadingHistory
                  : loadingAssignments
              )
            }
            onClick={reload}
          >
            ↻ Refresh
          </button>
        </header>

        {/* =====================================
            TWO TABS
            ===================================== */}

        <div
          className="vf-driver-tabs"
          role="tablist"
          aria-label="Journey management views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={
              activeTab === "assignments"
            }
            className={
              activeTab === "assignments"
                ? "vf-driver-tab-active"
                : ""
            }
            onClick={() =>
              setActiveTab("assignments")
            }
          >
            Assignments
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={
              activeTab === "history"
            }
            className={
              activeTab === "history"
                ? "vf-driver-tab-active"
                : ""
            }
            onClick={() =>
              setActiveTab("history")
            }
          >
            Journey History{" "}
            {activeTab === "history"
              ? `(${history.length})`
              : ""}
          </button>
        </div>

        {/* SUCCESS MESSAGE */}

        {notice && (
          <div
            className="vf-driver-alert vf-driver-alert-success"
            role="status"
          >
            {notice}
          </div>
        )}

        {/* =====================================
            ASSIGNMENTS TAB
            ===================================== */}

        {activeTab === "assignments" && (
          <>
            {assignmentError && (
              <div
                className="vf-driver-alert vf-driver-alert-error"
                role="alert"
              >
                {assignmentError}
              </div>
            )}

            {/* Statistics */}

            <section className="vf-driver-summary">
              {[
                [
                  "Current bookings",
                  visibleAssignments.length,
                ],
                [
                  "Driver assigned",
                  assignedCount,
                ],
                [
                  "Awaiting driver",
                  unassignedCount,
                ],
                [
                  "Started / locked",
                  lockedCount,
                ],
              ].map(([label, value]) => (
                <article
                  className="vf-driver-stat"
                  key={label}
                >
                  <span>{label}</span>

                  <strong>
                    {loadingAssignments
                      ? "—"
                      : value}
                  </strong>

                  <small>
                    Driver Required only
                  </small>
                </article>
              ))}
            </section>

            {/* Assignment table */}

            <section className="vf-driver-panel">
              <div className="vf-driver-panel-head">
                <div>
                  <h2>Driver Assignments</h2>

                  <p>
                    Approved Driver Required bookings
                    whose scheduled return time
                    has not passed.
                  </p>
                </div>

                <span className="vf-driver-count">
                  {filteredAssignments.length} booking(s)
                </span>
              </div>

              {/* Filters */}

              <div className="vf-driver-toolbar">
                <div className="vf-driver-search">
                  <label htmlFor="driver-search">
                    Search
                  </label>

                  <input
                    id="driver-search"
                    type="search"
                    value={search}
                    placeholder="Booking, driver, van..."
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />
                </div>

                <div className="vf-driver-filter">
                  <label htmlFor="driver-filter">
                    Status
                  </label>

                  <select
                    id="driver-filter"
                    value={filter}
                    onChange={(event) =>
                      setFilter(event.target.value)
                    }
                  >
                    <option value="ALL">
                      All bookings
                    </option>

                    <option value="UNASSIGNED">
                      Awaiting driver
                    </option>

                    <option value="ASSIGNED">
                      Assigned
                    </option>

                    <option value="LOCKED">
                      Started / locked
                    </option>
                  </select>
                </div>
              </div>

              {/* Assignment records */}

              {loadingAssignments ? (
                <div className="vf-driver-empty">
                  Loading Driver Assignments...
                </div>
              ) : assignmentError ? (
                <div className="vf-driver-empty">
                  Unable to load assignments.
                </div>
              ) : filteredAssignments.length === 0 ? (
                <div className="vf-driver-empty">
                  No matching Driver Required bookings.
                </div>
              ) : (
                <div className="vf-driver-table-wrap">
                  <table className="vf-driver-table">
                    <thead>
                      <tr>
                        <th>BOOKING</th>
                        <th>VEHICLE</th>
                        <th>DEPARTURE</th>
                        <th>DRIVER</th>
                        <th>JOURNEY</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredAssignments.map((row) => {
                        const manageable =
                          canManage(row, now);

                        return (
                          <tr key={row.bookingId}>
                            <td data-label="Booking">
                              <strong>
                                #{row.bookingId}
                              </strong>

                              <small>
                                {row.purpose || "—"}
                              </small>

                              <small>
                                {row.passengerCount} passenger(s)
                              </small>
                            </td>

                            <td data-label="Vehicle">
                              <strong>
                                {row.vanRegistration || "—"}
                              </strong>

                              <small>
                                {row.vanModel || "—"}
                              </small>
                            </td>

                            <td data-label="Departure">
                              {formatDate(row.departureAt)}

                              <small>
                                Return:{" "}
                                {formatDate(row.returnAt)}
                              </small>
                            </td>

                            <td data-label="Driver">
                              <strong>
                                {row.driverName || "Unassigned"}
                              </strong>
                            </td>

                            <td data-label="Journey">
                              <span className="vf-driver-status">
                                {assignmentStatus(row, now)}
                              </span>

                              <small>
                                {row.journeyId
                                  ? `Journey #${row.journeyId}`
                                  : "Not created"}
                              </small>
                            </td>

                            <td data-label="Actions">
                              <div className="vf-driver-actions">
                                {manageable && (
                                  <button
                                    type="button"
                                    className="vf-driver-btn vf-driver-btn-primary"
                                    disabled={busy}
                                    onClick={() =>
                                      openAssign(row)
                                    }
                                  >
                                    {row.driverUserId == null
                                      ? "Assign"
                                      : "Change"}
                                  </button>
                                )}

                                {manageable &&
                                  row.driverUserId != null && (
                                    <button
                                      type="button"
                                      className="vf-driver-btn vf-driver-btn-remove"
                                      disabled={busy}
                                      onClick={() =>
                                        openUnassign(row)
                                      }
                                    >
                                      Delete Assignment
                                    </button>
                                  )}

                                <button
                                  type="button"
                                  className="vf-driver-btn vf-driver-btn-ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    openModal("details", row)
                                  }
                                >
                                  View
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="vf-driver-panel-foot">
                <span>
                  Driver conflicts are checked by the server.
                </span>

                <span>
                  {filteredAssignments.length} shown
                </span>
              </div>
            </section>
          </>
        )}

        {/* =====================================
            JOURNEY HISTORY TAB
            ===================================== */}

        {activeTab === "history" && (
          <>
            {historyError && (
              <div
                className="vf-driver-alert vf-driver-alert-error"
                role="alert"
              >
                {historyError}
              </div>
            )}

            <section className="vf-driver-panel">
              <div className="vf-driver-panel-head">
                <div>
                  <h2>Journey History</h2>

                  <p>
                    Driver Required journeys and
                    automatic Self Drive trips
                    in one place.
                  </p>
                </div>

                <span className="vf-driver-count">
                  {inProgressCount} in progress ·{" "}
                  {completedCount} completed
                </span>
              </div>

              {/* History Filters */}

              <div className="vf-driver-toolbar">
                <div className="vf-driver-search">
                  <label htmlFor="journey-history-search">
                    Search
                  </label>

                  <input
                    id="journey-history-search"
                    type="search"
                    value={historySearch}
                    placeholder="Booking, journey, Staff, driver, van..."
                    onChange={(event) =>
                      setHistorySearch(event.target.value)
                    }
                  />
                </div>

                <div className="vf-driver-filter">
                  <label htmlFor="journey-history-filter">
                    Status
                  </label>

                  <select
                    id="journey-history-filter"
                    value={historyStatus}
                    onChange={(event) =>
                      setHistoryStatus(event.target.value)
                    }
                  >
                    <option value="ALL">
                      All statuses
                    </option>

                    <option value="SCHEDULED">
                      Scheduled
                    </option>

                    <option value="IN_PROGRESS">
                      In progress
                    </option>

                    <option value="COMPLETED">
                      Completed
                    </option>

                    <option value="CANCELLED">
                      Cancelled
                    </option>
                  </select>
                </div>
              </div>

              {/* History Table */}

              {loadingHistory ? (
                <div className="vf-driver-empty">
                  Loading Journey History...
                </div>
              ) : historyError ? (
                <div className="vf-driver-empty">
                  Unable to load Journey History.
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="vf-driver-empty">
                  No matching journeys or
                  Self Drive bookings.
                </div>
              ) : (
                <div className="vf-driver-table-wrap">
                  <table className="vf-driver-table vf-history-table">
                    <thead>
                      <tr>
                        <th>JOURNEY / BOOKING</th>
                        <th>TYPE / DRIVER</th>
                        <th>VAN</th>
                        <th>BOOKED</th>
                        <th>ACTUAL</th>
                        <th>START / END</th>
                        <th>STATUS</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredHistory.map((trip) => {
                        const isSelfDrive =
                          upper(trip.drivingOption) ===
                          "SELF_DRIVE";

                        const deletable =
                          canDeleteHistory(trip, now);

                        return (
                          <tr
                            key={
                              trip.historyKey ||
                              `journey-${trip.journeyId}`
                            }
                          >
                            <td data-label="Journey / Booking">
                              <strong>
                                {isSelfDrive
                                  ? `Booking #${trip.bookingId}`
                                  : `Journey #${trip.journeyId}`}
                              </strong>

                              <small>
                                {isSelfDrive
                                  ? "Automatic Self Drive"
                                  : `Booking #${trip.bookingId}`}
                              </small>

                              <small>
                                {trip.purpose || "—"}
                              </small>
                            </td>

                            <td data-label="Type / Driver">
                              <strong>
                                {isSelfDrive
                                  ? "Self Drive"
                                  : "Driver Required"}
                              </strong>

                              <small>
                                {trip.driverName || "Not assigned"}
                                {isSelfDrive ? " (Staff)" : ""}
                              </small>
                            </td>

                            <td data-label="Van">
                              <strong>
                                {trip.vanRegistration ||
                                  (
                                    trip.vanId
                                      ? `Van #${trip.vanId}`
                                      : "—"
                                  )}
                              </strong>

                              <small>
                                {trip.vanModel || "—"}
                              </small>
                            </td>

                            <td data-label="Booked">
                              <strong>
                                {trip.bookedPassengers ?? "—"}
                              </strong>
                            </td>

                            <td data-label="Actual">
                              <strong>
                                {trip.actualPassengerCount ??
                                  "Not recorded"}
                              </strong>
                            </td>

                            <td data-label="Start / End">
                              <strong>
                                {formatDate(trip.startedAt)}
                              </strong>

                              <small>
                                End: {formatDate(trip.endedAt)}
                              </small>

                              {isSelfDrive && (
                                <small>
                                  Scheduled times
                                </small>
                              )}
                            </td>

                            <td data-label="Status">
                              <span
                                className={
                                  "vf-driver-status " +
                                  (
                                    upper(trip.status) ===
                                    "COMPLETED"
                                      ? "vf-driver-status-assigned"
                                      : upper(trip.status) ===
                                        "SCHEDULED"
                                        ? "vf-driver-status-pending"
                                        : "vf-driver-status-neutral"
                                  )
                                }
                              >
                                {readable(trip.status)}
                              </span>
                            </td>

                            <td data-label="Actions">
                              <div className="vf-driver-actions">
                                <button
                                  type="button"
                                  className="vf-driver-btn vf-driver-btn-ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    openModal(
                                      "history-details",
                                      trip
                                    )
                                  }
                                >
                                  View
                                </button>

                                {deletable && (
                                  <button
                                    type="button"
                                    className="vf-driver-btn vf-driver-btn-remove"
                                    disabled={busy}
                                    onClick={() =>
                                      openModal(
                                        "delete-history",
                                        trip
                                      )
                                    }
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="vf-driver-panel-foot">
                <span>
                  Self Drive uses scheduled times;
                  actual passengers are not recorded.
                </span>

                <span>
                  {filteredHistory.length} /{" "}
                  {history.length} shown
                </span>
              </div>
            </section>
          </>
        )}
      </div>

      {/* =====================================
          ASSIGN DRIVER MODAL
          ===================================== */}

      {modal?.type === "assign" && (
        <Modal
          open
          size="md"
          busy={busy}
          onClose={closeModal}
          title={
            `${
              modal.row.driverUserId == null
                ? "Assign"
                : "Change"
            } Driver — Booking #${modal.row.bookingId}`
          }
          subtitle="Select an eligible Driver account."
        >
          <form
            className="vf-driver-modal-form"
            onSubmit={saveAssignment}
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

              <div className="vf-driver-booking-info">
                <p>
                  <strong>Purpose:</strong>{" "}
                  {modal.row.purpose || "—"}
                </p>

                <p>
                  <strong>Van:</strong>{" "}
                  {modal.row.vanRegistration || "—"}
                </p>

                <p>
                  <strong>Departure:</strong>{" "}
                  {formatDate(modal.row.departureAt)}
                </p>

                <p>
                  <strong>Return:</strong>{" "}
                  {formatDate(modal.row.returnAt)}
                </p>

                <p>
                  <strong>Booked passengers:</strong>{" "}
                  {modal.row.passengerCount}
                </p>
              </div>

              <div className="vfm-form-grid">
                <div className="vfm-field vfm-full">
                  <label htmlFor="assign-driver">
                    Driver
                  </label>

                  <select
                    id="assign-driver"
                    required
                    data-modal-autofocus
                    disabled={busy}
                    value={driverId}
                    onChange={(event) =>
                      setDriverId(event.target.value)
                    }
                  >
                    <option value="">
                      Select a driver
                    </option>

                    {drivers.map((driver) => (
                      <option
                        key={driver.userId}
                        value={driver.userId}
                      >
                        {driver.fullName} — {driver.email}
                      </option>
                    ))}
                  </select>

                  {drivers.length === 0 && (
                    <small>
                      No eligible drivers found.
                    </small>
                  )}
                </div>
              </div>
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
                disabled={
                  busy ||
                  drivers.length === 0
                }
              >
                {busy
                  ? "Saving..."
                  : "Save Driver Assignment"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================
          DELETE ASSIGNMENT MODAL
          ===================================== */}

      {modal?.type === "unassign" && (
        <ConfirmModal
          open
          title={
            `Delete Assignment — Booking #${modal.row.bookingId}`
          }
          message={
            `Remove ${
              modal.row.driverName || "the driver"
            } from this Booking? ` +
            "The Booking and Journey record will remain."
          }
          confirmText="Delete Assignment"
          variant="danger"
          busy={busy}
          error={actionError}
          onClose={closeModal}
          onConfirm={removeAssignment}
        />
      )}

      {/* =====================================
          ASSIGNMENT DETAILS MODAL
          ===================================== */}

      {modal?.type === "details" && (
        <Modal
          open
          size="sm"
          busy={busy}
          onClose={closeModal}
          title={`Booking #${modal.row.bookingId}`}
          subtitle="Driver Assignment details"
        >
          <div className="vfm-body">
            <div className="vf-driver-booking-info">
              <p>
                <strong>Purpose:</strong>{" "}
                {modal.row.purpose || "—"}
              </p>

              <p>
                <strong>Requested by:</strong>{" "}
                {modal.row.requesterName || "—"}
              </p>

              <p>
                <strong>Booked for:</strong>{" "}
                {modal.row.bookedForName || "—"}
              </p>

              <p>
                <strong>Driver:</strong>{" "}
                {modal.row.driverName || "Unassigned"}
              </p>

              <p>
                <strong>Van:</strong>{" "}
                {modal.row.vanRegistration || "—"}
              </p>

              <p>
                <strong>Departure:</strong>{" "}
                {formatDate(modal.row.departureAt)}
              </p>

              <p>
                <strong>Return:</strong>{" "}
                {formatDate(modal.row.returnAt)}
              </p>

              <p>
                <strong>Journey:</strong>{" "}
                {modal.row.journeyId
                  ? `#${modal.row.journeyId}`
                  : "Not created"}
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {assignmentStatus(modal.row, now)}
              </p>
            </div>
          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              onClick={closeModal}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* =====================================
          JOURNEY HISTORY DETAILS MODAL
          ===================================== */}

      {modal?.type === "history-details" && (
        <Modal
          open
          size="md"
          busy={busy}
          onClose={closeModal}
          title={
            modal.row.isVirtual
              ? `Self Drive — Booking #${modal.row.bookingId}`
              : `Journey #${modal.row.journeyId}`
          }
          subtitle={
            `Booking #${modal.row.bookingId} · ` +
            readable(modal.row.status)
          }
        >
          <div className="vfm-body">
            <div className="vf-history-passengers">
              <div>
                <span>
                  Booked passengers
                </span>

                <strong>
                  {modal.row.bookedPassengers ?? "—"}
                </strong>
              </div>

              <div>
                <span>
                  Actual passengers
                </span>

                <strong>
                  {modal.row.actualPassengerCount ??
                    "Not recorded"}
                </strong>
              </div>
            </div>

            <div className="vf-driver-booking-info">
              <p>
                <strong>Driving type:</strong>{" "}
                {modal.row.isVirtual
                  ? "Self Drive"
                  : "Driver Required"}
              </p>

              <p>
                <strong>Person driving:</strong>{" "}
                {modal.row.driverName ||
                  "Not assigned"}
              </p>

              <p>
                <strong>Van:</strong>{" "}
                {modal.row.vanRegistration || "—"}{" "}
                {modal.row.vanModel || ""}
              </p>

              <p>
                <strong>Purpose:</strong>{" "}
                {modal.row.purpose || "—"}
              </p>

              <p>
                <strong>Booking status:</strong>{" "}
                {readable(modal.row.bookingStatus)}
              </p>

              <p>
                <strong>Journey status:</strong>{" "}
                {readable(modal.row.status)}
              </p>

              <p>
                <strong>Scheduled departure:</strong>{" "}
                {formatDate(modal.row.departureAt)}
              </p>

              <p>
                <strong>Scheduled return:</strong>{" "}
                {formatDate(modal.row.returnAt)}
              </p>

              <p>
                <strong>
                  {modal.row.isAutoTimed
                    ? "Auto start (scheduled):"
                    : "Actual start:"}
                </strong>{" "}
                {formatDate(modal.row.startedAt)}
              </p>

              <p>
                <strong>
                  {modal.row.isAutoTimed
                    ? "Auto end (scheduled):"
                    : "Actual end:"}
                </strong>{" "}
                {formatDate(modal.row.endedAt)}
              </p>
            </div>

            {modal.row.isVirtual && (
              <p className="vfm-form-note">
                Self Drive status is calculated from
                approved Booking times. It is not a
                recorded physical Journey. No confirmed
                passenger total or actual departure
                and arrival times are available.
              </p>
            )}
          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              onClick={closeModal}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* =====================================
          DELETE HISTORY MODAL
          ===================================== */}

      {modal?.type === "delete-history" && (
        <ConfirmModal
          open
          title={
            `Delete Journey #${modal.row.journeyId} from History`
          }
          message={
            `Hide Journey #${modal.row.journeyId} ` +
            "from Admin History? The real Journey " +
            "record and passenger counts remain " +
            "in the database."
          }
          confirmText="Delete from History"
          variant="danger"
          busy={busy}
          error={actionError}
          onClose={closeModal}
          onConfirm={deleteHistory}
        />
      )}
    </>
  );
}