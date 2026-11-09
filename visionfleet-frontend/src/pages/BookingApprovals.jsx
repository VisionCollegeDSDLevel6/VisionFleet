
import { useEffect, useState } from "react";
import Modal, { ConfirmModal } from "../components/Modal";
import logo from "../assets/logo.png";
import {
  exportBookingPdf,
  exportBookingsReportPdf,
} from "../utils/bookingPdf";
import "../styles/BookingApprovals.css";

const API = "/api/bookings";

// Report dates use the browser's local calendar.
// Both start and end dates are inclusive.
function departureDateKey(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (number) =>
    String(number).padStart(2, "0");

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}`
  );
}

function filterBookingsForReport(
  items,
  mode,
  fromDate,
  toDate
) {
  if (mode === "all") return items;

  return items.filter((booking) => {
    const key = departureDateKey(
      booking.departureAt
    );

    return (
      key &&
      key >= fromDate &&
      key <= toDate
    );
  });
}

const EMPTY_FORM = {
  purpose: "",
  departureAt: "",
  returnAt: "",
  passengerCount: "1",
  drivingOption: "DRIVER_REQUIRED",
  bookedForUserId: "",
  repeatWeeks: "1",
};

// =====================================
// HELPERS
// =====================================

function statusOf(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

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

function toInputDate(value) {
  if (!value) return "";

  const raw = String(value);

  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) &&
    !/[zZ]|[+-]\d{2}:\d{2}$/.test(
      raw.slice(10)
    )
  ) {
    return raw.slice(0, 16);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (n) =>
    String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  );
}

// =====================================
// API ERROR HANDLING
// =====================================

async function readApiError(response) {
  if (response.status === 401) {
    return "Session expired. Please sign in again.";
  }

  if (response.status === 403) {
    return "Access denied.";
  }

  let text = "";

  try {
    text = await response.text();
  } catch {
    // Ignore body read error
  }

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
      data.detail ||
      data.title ||
      `HTTP ${response.status}`
    );
  } catch {
    return text &&
      !text.trim().startsWith("<")
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
  body
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
        await readApiError(tokenResponse)
      );
    }

    const { csrfToken } =
      await tokenResponse.json();

    if (!csrfToken) {
      throw new Error(
        "Security token is missing."
      );
    }

    headers["X-CSRF-TOKEN"] =
      csrfToken;
  }

  if (body !== undefined) {
    headers["Content-Type"] =
      "application/json";
  }

  const response = await fetch(path, {
    method,
    credentials: "include",
    cache: "no-store",
    headers,
    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
        }
      : {}),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response)
    );
  }

  return response.status === 204
    ? {}
    : response.json();
}

// =====================================
// BOOKING VALIDATION
// =====================================

function validateBooking(form) {
  if (!form.purpose.trim()) {
    return "Booking purpose is required.";
  }

  if (
    form.purpose.trim().length > 500
  ) {
    return (
      "Purpose must be 500 characters " +
      "or less."
    );
  }

  if (
    !form.departureAt ||
    !form.returnAt
  ) {
    return (
      "Departure and return are required."
    );
  }

  const departure =
    new Date(form.departureAt);

  const returnTime =
    new Date(form.returnAt);

  if (
    Number.isNaN(departure.getTime()) ||
    Number.isNaN(returnTime.getTime())
  ) {
    return "Invalid booking date or time.";
  }

  if (returnTime <= departure) {
    return "Return must be after departure.";
  }

  const passengers =
    Number(form.passengerCount);

  if (
    !Number.isInteger(passengers) ||
    passengers < 1 ||
    passengers > 100
  ) {
    return (
      "Passenger count must be " +
      "between 1 and 100."
    );
  }

  if (
    ![
      "SELF_DRIVE",
      "DRIVER_REQUIRED",
    ].includes(form.drivingOption)
  ) {
    return "Invalid driving option.";
  }

  return "";
}

// =====================================
// DELETE ICON
// =====================================

function TrashIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

// =====================================
// BOOKING FORM FIELDS
// =====================================

function BookingFields({
  form,
  updateField,
  busy,
  isCreate,
}) {
  return (
    <div className="vfm-form-grid">

      {/* Purpose */}

      <div className="vfm-field vfm-full">
        <label htmlFor="booking-purpose">
          Booking purpose
        </label>

        <input
          id="booking-purpose"
          data-modal-autofocus
          type="text"
          maxLength={500}
          required
          disabled={busy}
          value={form.purpose}
          placeholder="Reason for booking"
          onChange={(e) =>
            updateField(
              "purpose",
              e.target.value
            )
          }
        />
      </div>

      {/* Departure */}

      <div className="vfm-field">
        <label htmlFor="booking-departure">
          Departure date & time
        </label>

        <input
          id="booking-departure"
          type="datetime-local"
          required
          disabled={busy}
          value={form.departureAt}
          onChange={(e) =>
            updateField(
              "departureAt",
              e.target.value
            )
          }
        />
      </div>

      {/* Return */}

      <div className="vfm-field">
        <label htmlFor="booking-return">
          Return date & time
        </label>

        <input
          id="booking-return"
          type="datetime-local"
          required
          disabled={busy}
          min={
            form.departureAt || undefined
          }
          value={form.returnAt}
          onChange={(e) =>
            updateField(
              "returnAt",
              e.target.value
            )
          }
        />
      </div>

      {/* Passengers */}

      <div className="vfm-field">
        <label htmlFor="booking-passengers">
          Number of passengers
        </label>

        <input
          id="booking-passengers"
          type="number"
          min="1"
          max="100"
          step="1"
          required
          disabled={busy}
          value={form.passengerCount}
          onChange={(e) =>
            updateField(
              "passengerCount",
              e.target.value
            )
          }
        />
      </div>

      {/* Driving option */}

      <div className="vfm-field">
        <label htmlFor="booking-driving">
          Driving option
        </label>

        <select
          id="booking-driving"
          disabled={busy}
          value={form.drivingOption}
          onChange={(e) =>
            updateField(
              "drivingOption",
              e.target.value
            )
          }
        >
          <option value="DRIVER_REQUIRED">
            Driver required
          </option>

          <option value="SELF_DRIVE">
            Self-drive
          </option>
        </select>
      </div>

      {/* Create-only fields */}

      {isCreate && (
        <>
          <div className="vfm-field">
            <label htmlFor="booking-repeat">
              Repeat for (weeks)
            </label>

            <input
              id="booking-repeat"
              type="number"
              min="1"
              max="52"
              step="1"
              required
              disabled={busy}
              value={form.repeatWeeks}
              onChange={(e) =>
                updateField(
                  "repeatWeeks",
                  e.target.value
                )
              }
            />

            <small>
              1 = once; 8 = up to
              eight weekly bookings.
            </small>
          </div>

          <div className="vfm-field">
            <label htmlFor="booking-user">
              Booked-for User ID (optional)
            </label>

            <input
              id="booking-user"
              type="number"
              min="1"
              step="1"
              disabled={busy}
              placeholder="Blank = current Admin"
              value={form.bookedForUserId}
              onChange={(e) =>
                updateField(
                  "bookedForUserId",
                  e.target.value
                )
              }
            />
          </div>
        </>
      )}

      <div className="vfm-form-note vfm-full">
        Vehicle availability and scheduled
        maintenance are checked by the server.
        Self-drive requires driving permission
        for the booked-for user.
      </div>

    </div>
  );
}

// =====================================
// BOOKING MANAGEMENT
// =====================================

export default function BookingApprovals() {
  // Booking list
  const [
    bookings,
    setBookings,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  // Single Booking PDF
  const [
    exportingBookingId,
    setExportingBookingId,
  ] = useState(null);

  // PDF report: all or date range
  const [
    reportOpen,
    setReportOpen,
  ] = useState(false);

  const [
    reportMode,
    setReportMode,
  ] = useState("all");

  const [
    fromDate,
    setFromDate,
  ] = useState("");

  const [
    toDate,
    setToDate,
  ] = useState("");

  const [
    reportError,
    setReportError,
  ] = useState("");

  const [
    exportingReport,
    setExportingReport,
  ] = useState(false);

  // Messages
  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  // Search and filter
  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("PENDING");

  // Modal types:
  // create, edit, approve, cancel, delete
  const [
    modal,
    setModal,
  ] = useState(null);

  const [
    form,
    setForm,
  ] = useState({
    ...EMPTY_FORM,
  });

  // =====================================
  // LOAD BOOKINGS
  // =====================================

  useEffect(() => {
    const controller =
      new AbortController();

    async function load() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(
          API,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            await readApiError(response)
          );
        }

        const data =
          await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "Unexpected booking API response."
          );
        }

        if (!controller.signal.aborted) {
          setBookings(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(
            err.message ||
            "Could not load bookings."
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

  function reload() {
    setRefreshKey(
      (value) => value + 1
    );
  }

  // =====================================
  // EXPORT INDIVIDUAL BOOKING
  // =====================================

  async function downloadBookingPdf(
    booking
  ) {
    if (
      exportingBookingId !== null
    ) {
      return;
    }

    setActionError("");
    setExportingBookingId(
      booking.bookingId
    );

    try {
      const latest = await apiRequest(
        `${API}/${booking.bookingId}`
      );

      await exportBookingPdf(
        latest,
        logo
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not export booking PDF."
      );
    } finally {
      setExportingBookingId(null);
    }
  }

  // =====================================
  // EXPORT ALL / DATE RANGE
  // =====================================

  function openReportDialog() {
    setReportError("");
    setReportOpen(true);
  }

  function closeReportDialog() {
    if (exportingReport) return;

    setReportOpen(false);
    setReportError("");
  }

  async function downloadBookingsReport(
    event
  ) {
    event.preventDefault();

    if (
      exportingReport ||
      busy
    ) {
      return;
    }

    if (reportMode === "range") {
      if (
        !fromDate ||
        !toDate
      ) {
        setReportError(
          "Please select both From date and To date."
        );
        return;
      }

      if (fromDate > toDate) {
        setReportError(
          "From date must not be later than To date."
        );
        return;
      }
    }

    setExportingReport(true);
    setReportError("");

    try {
      // Fetch all current Admin bookings.
      // Ignore search/status filters on screen.

      const latest =
        await apiRequest(API);

      if (!Array.isArray(latest)) {
        throw new Error(
          "Unexpected booking API response."
        );
      }

      const selected =
        filterBookingsForReport(
          latest,
          reportMode,
          fromDate,
          toDate
        );

      if (selected.length === 0) {
        throw new Error(
          "No bookings found for the selected period."
        );
      }

      await exportBookingsReportPdf(
        selected,
        logo,
        {
          fromDate:
            reportMode === "range"
              ? fromDate
              : null,
          toDate:
            reportMode === "range"
              ? toDate
              : null,
        }
      );

      setReportOpen(false);
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "Unable to export PDF report."
      );
    } finally {
      setExportingReport(false);
    }
  }

  // =====================================
  // MODAL HELPERS
  // =====================================

  function closeModal() {
    if (busy) return;

    setModal(null);
    setActionError("");
  }

  function updateField(name, value) {
    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setActionError("");
  }

  function openModal(
    type,
    booking = null
  ) {
    if (busy) return;

    setActionError("");
    setNotice("");

    if (type === "create") {
      setForm({
        ...EMPTY_FORM,
      });
    }

    if (type === "edit") {
      if (
        statusOf(
          booking?.status
        ) !== "PENDING"
      ) {
        return;
      }

      setForm({
        ...EMPTY_FORM,
        purpose: booking.purpose || "",
        departureAt: toInputDate(
          booking.departureAt
        ),
        returnAt: toInputDate(
          booking.returnAt
        ),
        passengerCount: String(
          booking.passengerCount
        ),
        drivingOption:
          booking.drivingOption ||
          "SELF_DRIVE",
      });
    }

    setModal({
      type,
      booking,
    });
  }

  // =====================================
  // SHARED API MUTATION
  // =====================================

  async function runAction(callback) {
    if (busy) return;

    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      await callback();
      reload();
    } catch (err) {
      setActionError(
        err?.message ||
        "Operation failed."
      );
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // CREATE BOOKING
  // =====================================

  async function createBooking(event) {
    event.preventDefault();

    const error =
      validateBooking(form);

    if (error) {
      return setActionError(error);
    }

    const weeks =
      Number(form.repeatWeeks);

    if (
      !Number.isInteger(weeks) ||
      weeks < 1 ||
      weeks > 52
    ) {
      return setActionError(
        "Repeat weeks must be between 1 and 52."
      );
    }

    const userIdText =
      form.bookedForUserId.trim();

    const bookedForUserId =
      userIdText
        ? Number(userIdText)
        : null;

    if (
      userIdText &&
      (
        !Number.isInteger(bookedForUserId) ||
        bookedForUserId < 1
      )
    ) {
      return setActionError(
        "Booked-for User ID is invalid."
      );
    }

    await runAction(async () => {
      const result =
        await apiRequest(
          API,
          "POST",
          {
            purpose:
              form.purpose.trim(),
            departureAt:
              form.departureAt,
            returnAt:
              form.returnAt,
            passengerCount:
              Number(
                form.passengerCount
              ),
            drivingOption:
              form.drivingOption,
            bookedForUserId,
            repeatWeeks: weeks,
          }
        );

      setModal(null);
      setStatusFilter("ALL");

      setNotice(
        `Created ${result.createdCount} booking(s). ` +
        `${result.skippedCount || 0} week(s) skipped.` +
        (
          result.emailSent === false
            ? " Confirmation email was not sent."
            : ""
        )
      );
    });
  }

  // =====================================
  // EDIT BOOKING
  // =====================================

  async function saveEdit(event) {
    event.preventDefault();

    if (modal?.type !== "edit") {
      return;
    }

    const error =
      validateBooking(form);

    if (error) {
      return setActionError(error);
    }

    const bookingId =
      modal.booking.bookingId;

    await runAction(async () => {
      await apiRequest(
        `${API}/${bookingId}`,
        "PUT",
        {
          purpose:
            form.purpose.trim(),
          departureAt:
            form.departureAt,
          returnAt:
            form.returnAt,
          passengerCount:
            Number(
              form.passengerCount
            ),
          drivingOption:
            form.drivingOption,
        }
      );

      setModal(null);

      setNotice(
        `Booking #${bookingId} updated successfully.`
      );
    });
  }

  // =====================================
  // APPROVE BOOKING
  // =====================================

  async function approveBooking() {
    if (modal?.type !== "approve") {
      return;
    }

    const id =
      modal.booking.bookingId;

    await runAction(async () => {
      const result =
        await apiRequest(
          `${API}/${id}/approve`,
          "PUT"
        );

      setModal(null);

      setNotice(
        `Booking #${id} approved.` +
        (
          result.emailSent === false
            ? " Approval email could not be sent."
            : ""
        )
      );
    });
  }

  // =====================================
  // CANCEL BOOKING
  // =====================================

  async function confirmCancel(
    cancelFollowing
  ) {
    if (modal?.type !== "cancel") {
      return;
    }

    const id =
      modal.booking.bookingId;

    await runAction(async () => {
      const result =
        await apiRequest(
          `${API}/${id}/cancel?cancelFollowing=${cancelFollowing}`,
          "PUT"
        );

      setModal(null);

      setNotice(
        `${result.cancelledCount ?? 1} booking(s) cancelled. ` +
        "History preserved." +
        (
          result.emailsFailed > 0
            ? ` ${result.emailsFailed} email(s) failed.`
            : result.emailSent === false
              ? " Cancellation email could not be sent."
              : ""
        )
      );
    });
  }

  // =====================================
  // DELETE BOOKING
  // =====================================

  async function deleteBooking() {
    if (modal?.type !== "delete") {
      return;
    }

    const id =
      modal.booking.bookingId;

    await runAction(async () => {
      await apiRequest(
        `${API}/${id}`,
        "DELETE"
      );

      setModal(null);

      setNotice(
        `Booking #${id} permanently deleted.`
      );
    });
  }

  // =====================================
  // STATISTICS
  // =====================================

  const pending =
    bookings.filter(
      (booking) =>
        statusOf(
          booking.status
        ) === "PENDING"
    ).length;

  const approved =
    bookings.filter(
      (booking) =>
        statusOf(
          booking.status
        ) === "APPROVED"
    ).length;

  const cancelled =
    bookings.filter(
      (booking) =>
        statusOf(
          booking.status
        ) === "CANCELLED"
    ).length;

  // =====================================
  // SEARCH AND FILTER
  // =====================================

  const filtered = bookings
    .filter((booking) => {
      const keyword =
        search.trim().toLowerCase();

      const matchesSearch =
        String(
          booking.bookingId
        ).includes(keyword) ||
        String(
          booking.requestedByUserId ?? ""
        ).includes(keyword) ||
        String(
          booking.purpose || ""
        )
          .toLowerCase()
          .includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        statusOf(
          booking.status
        ) === statusFilter;

      return (
        matchesSearch &&
        matchesStatus
      );
    })
    .sort((a, b) => {
      const aPending =
        statusOf(a.status) ===
        "PENDING";

      const bPending =
        statusOf(b.status) ===
        "PENDING";

      if (aPending !== bPending) {
        return aPending ? -1 : 1;
      }

      return (
        new Date(a.departureAt) -
        new Date(b.departureAt)
      );
    });

  // =====================================
  // RECURRING CANCELLATION
  // =====================================

  const cancelTarget =
    modal?.type === "cancel"
      ? modal.booking
      : null;

  const futureCount =
    cancelTarget?.recurrenceGroupId
      ? bookings.filter(
          (booking) =>
            booking.recurrenceGroupId ===
              cancelTarget.recurrenceGroupId &&
            new Date(
              booking.departureAt
            ) >=
              new Date(
                cancelTarget.departureAt
              ) &&
            [
              "PENDING",
              "APPROVED",
            ].includes(
              statusOf(
                booking.status
              )
            )
        ).length
      : 1;

  const reportPreviewCount =
    filterBookingsForReport(
      bookings,
      reportMode,
      fromDate,
      toDate
    ).length;

  // =====================================
  // RENDER PAGE
  // =====================================

  return (
    <>
      <div className="vf-booking-page">

        {/* Header */}

        <header className="vf-booking-header">
          <div>
            <span className="vf-booking-eyebrow">
              BOOKING MANAGEMENT
            </span>

            <h1>
              Booking Management
            </h1>

            <p>
              Create, review, approve and
              cancel vehicle bookings.
            </p>
          </div>

          <div className="vf-booking-header-actions">

            <button
              type="button"
              className="vf-booking-refresh"
              onClick={reload}
              disabled={
                busy ||
                loading
              }
            >
              ↻ Refresh
            </button>

            {/* All / Date range PDF */}

            <button
              type="button"
              className="vf-booking-export-main"
              onClick={openReportDialog}
              disabled={
                busy ||
                loading ||
                exportingReport
              }
            >
              Export PDF
            </button>

            <button
              type="button"
              className="vf-booking-approve"
              onClick={() =>
                openModal("create")
              }
              disabled={busy}
            >
              + Add Booking
            </button>

          </div>
        </header>

        {/* Summary Cards */}

        <section className="vf-booking-summary">
          {[
            [
              "Total bookings",
              bookings.length,
            ],
            [
              "Pending approval",
              pending,
            ],
            [
              "Approved",
              approved,
            ],
            [
              "Cancelled",
              cancelled,
            ],
          ].map(
            ([label, number]) => (
              <article
                key={label}
                className="vf-booking-summary-card"
              >
                <span>
                  {label}
                </span>

                <strong>
                  {loading
                    ? "—"
                    : number}
                </strong>

                <small>
                  Live database records
                </small>
              </article>
            )
          )}
        </section>

        {/* Notifications */}

        {loadError && (
          <div
            className="vf-booking-error"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {!modal &&
          actionError && (
            <div
              className="vf-booking-error"
              role="alert"
            >
              {actionError}
            </div>
          )}

        {notice && (
          <div
            className="vf-booking-success"
            role="status"
          >
            {notice}
          </div>
        )}

        {/* Booking Table */}

        <section className="vf-booking-panel">

          <div className="vf-booking-panel-header">
            <div>
              <h2>
                Booking requests
              </h2>

              <p>
                Live data from VisionFleetDB
              </p>
            </div>

            <span className="vf-booking-count">
              {filtered.length} booking(s)
            </span>
          </div>

          {/* Search / Status filter */}

          <div className="vf-booking-toolbar">

            <div className="vf-booking-search">
              <label htmlFor="booking-search">
                Search bookings
              </label>

              <input
                id="booking-search"
                type="search"
                placeholder="ID, requester or purpose..."
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
              />
            </div>

            <div className="vf-booking-filter">
              <label htmlFor="booking-filter">
                Status
              </label>

              <select
                id="booking-filter"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value
                  )
                }
              >
                <option value="PENDING">
                  Pending
                </option>

                <option value="APPROVED">
                  Approved
                </option>

                <option value="CANCELLED">
                  Cancelled
                </option>

                <option value="DECLINED">
                  Declined (old records)
                </option>

                <option value="ALL">
                  All bookings
                </option>
              </select>
            </div>

          </div>

          {/* Results */}

          {loading ? (
            <div className="vf-booking-empty">
              Loading bookings...
            </div>
          ) : filtered.length === 0 ? (
            <div className="vf-booking-empty">
              No matching bookings.
            </div>
          ) : (
            <div className="vf-booking-table-scroll">
              <table className="vf-booking-table">

                <thead>
                  <tr>
                    <th>BOOKING</th>
                    <th>REQUESTED BY</th>
                    <th>DEPARTURE</th>
                    <th>RETURN</th>
                    <th>PASSENGERS</th>
                    <th>VAN ID</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map(
                    (booking) => {
                      const status =
                        statusOf(
                          booking.status
                        );

                      const isPending =
                        status === "PENDING";

                      const canCancel =
                        isPending ||
                        status === "APPROVED";

                      return (
                        <tr
                          key={
                            booking.bookingId
                          }
                        >

                          {/* Booking */}

                          <td data-label="Booking">
                            <div className="vf-booking-identity">
                              <strong>
                                #
                                {booking.bookingId}
                              </strong>

                              <small>
                                {booking.purpose ||
                                  "No purpose"}
                              </small>

                              {booking.recurrenceGroupId && (
                                <small>
                                  Recurring booking
                                </small>
                              )}
                            </div>
                          </td>

                          {/* Requester */}

                          <td data-label="Requested by">
                            User #
                            {booking.requestedByUserId}
                          </td>

                          {/* Departure */}

                          <td data-label="Departure">
                            {formatDate(
                              booking.departureAt
                            )}
                          </td>

                          {/* Return */}

                          <td data-label="Return">
                            {formatDate(
                              booking.returnAt
                            )}
                          </td>

                          {/* Passengers */}

                          <td data-label="Passengers">
                            {booking.passengerCount}
                          </td>

                          {/* Van */}

                          <td data-label="Van ID">
                            {booking.assignedVanId == null
                              ? "Not assigned"
                              : `#${booking.assignedVanId}`}
                          </td>

                          {/* Status */}

                          <td data-label="Status">
                            <span
                              className={
                                "vf-booking-status " +
                                `vf-booking-${status.toLowerCase()}`
                              }
                            >
                              {status}
                            </span>
                          </td>

                          {/* Actions */}

                          <td data-label="Actions">
                            <div className="vf-booking-inline-actions">

                              {/* Individual PDF */}

                              <button
                                type="button"
                                className="vf-booking-pdf-action"
                                disabled={
                                  busy ||
                                  exportingBookingId !== null
                                }
                                onClick={() =>
                                  downloadBookingPdf(
                                    booking
                                  )
                                }
                                aria-label={
                                  `Download PDF for booking ${booking.bookingId}`
                                }
                              >
                                {exportingBookingId ===
                                  booking.bookingId
                                  ? "Exporting..."
                                  : "Download PDF"}
                              </button>

                              {/* Edit & Approve */}

                              {isPending && (
                                <>
                                  <button
                                    type="button"
                                    className="vf-booking-approve"
                                    disabled={busy}
                                    onClick={() =>
                                      openModal(
                                        "edit",
                                        booking
                                      )
                                    }
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    className="vf-booking-approve"
                                    disabled={busy}
                                    onClick={() =>
                                      openModal(
                                        "approve",
                                        booking
                                      )
                                    }
                                  >
                                    Approve
                                  </button>
                                </>
                              )}

                              {/* Cancel */}

                              {canCancel && (
                                <button
                                  type="button"
                                  className="vf-booking-cancel-action"
                                  disabled={busy}
                                  onClick={() =>
                                    openModal(
                                      "cancel",
                                      booking
                                    )
                                  }
                                >
                                  Cancel
                                </button>
                              )}

                              {/* Delete */}

                              <button
                                type="button"
                                className="vf-booking-trash-action"
                                disabled={busy}
                                title="Permanently delete"
                                aria-label={
                                  `Delete booking ${booking.bookingId}`
                                }
                                onClick={() =>
                                  openModal(
                                    "delete",
                                    booking
                                  )
                                }
                              >
                                <TrashIcon />
                              </button>

                            </div>
                          </td>

                        </tr>
                      );
                    }
                  )}
                </tbody>

              </table>
            </div>
          )}

          <div className="vf-booking-footer">
            <span>
              Cancel preserves history.
              Delete permanently removes
              the booking.
            </span>

            <span>
              {filtered.length} of{" "}
              {bookings.length} shown
            </span>
          </div>

        </section>
      </div>

      {/* =====================================
          EXPORT ALL / DATE RANGE MODAL
          ===================================== */}

      {reportOpen && (
        <Modal
          open
          title="Export Bookings to PDF"
          subtitle="Download all bookings or a selected departure-date range."
          size="md"
          busy={exportingReport}
          onClose={closeReportDialog}
        >
          <form
            onSubmit={
              downloadBookingsReport
            }
          >

            <div className="vfm-body vf-booking-report-body">

              {reportError && (
                <div
                  className="vfm-error"
                  role="alert"
                >
                  {reportError}
                </div>
              )}

              {/* Report Mode */}

              <fieldset
                className="vf-booking-report-options"
                disabled={exportingReport}
              >
                <legend>
                  What would you like to export?
                </legend>

                <label className="vf-booking-report-option">
                  <input
                    type="radio"
                    name="booking-report-mode"
                    value="all"
                    checked={
                      reportMode === "all"
                    }
                    onChange={() => {
                      setReportMode("all");
                      setReportError("");
                    }}
                  />

                  <span>
                    <strong>
                      All Bookings
                    </strong>

                    <small>
                      Every booking, including
                      Pending, Approved
                      and Cancelled
                    </small>
                  </span>
                </label>

                <label className="vf-booking-report-option">
                  <input
                    type="radio"
                    name="booking-report-mode"
                    value="range"
                    checked={
                      reportMode === "range"
                    }
                    onChange={() => {
                      setReportMode("range");
                      setReportError("");
                    }}
                  />

                  <span>
                    <strong>
                      Date Range
                    </strong>

                    <small>
                      Bookings departing within
                      the selected dates (inclusive)
                    </small>
                  </span>
                </label>
              </fieldset>

              {/* Date Range */}

              {reportMode === "range" && (
                <div className="vf-booking-report-dates">

                  <label htmlFor="report-from-date">
                    From date

                    <input
                      id="report-from-date"
                      type="date"
                      value={fromDate}
                      max={
                        toDate ||
                        undefined
                      }
                      onChange={(e) => {
                        setFromDate(
                          e.target.value
                        );
                        setReportError("");
                      }}
                      disabled={exportingReport}
                      required
                    />
                  </label>

                  <label htmlFor="report-to-date">
                    To date

                    <input
                      id="report-to-date"
                      type="date"
                      value={toDate}
                      min={
                        fromDate ||
                        undefined
                      }
                      onChange={(e) => {
                        setToDate(
                          e.target.value
                        );
                        setReportError("");
                      }}
                      disabled={exportingReport}
                      required
                    />
                  </label>

                </div>
              )}

              {/* Preview Count */}

              <p className="vf-booking-report-note">
                {
                  reportMode === "range" &&
                  (!fromDate || !toDate)
                    ? "Select both dates to preview the number of bookings."
                    : `${reportPreviewCount} booking(s) in the currently loaded data. The full list will be refreshed before export.`
                }
              </p>

            </div>

            <div className="vfm-footer">
              <button
                type="button"
                className="vfm-btn vfm-btn-secondary"
                onClick={closeReportDialog}
                disabled={exportingReport}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="vfm-btn vfm-btn-primary"
                disabled={exportingReport}
              >
                {exportingReport
                  ? "Generating PDF..."
                  : "Download Report PDF"}
              </button>
            </div>

          </form>
        </Modal>
      )}

      {/* =====================================
          CREATE / EDIT BOOKING MODAL
          ===================================== */}

      {(
        modal?.type === "create" ||
        modal?.type === "edit"
      ) && (
        <Modal
          title={
            modal.type === "create"
              ? "Add Booking"
              : `Edit Booking #${modal.booking.bookingId}`
          }
          subtitle={
            modal.type === "create"
              ? "Create a one-time or weekly recurring booking."
              : "Update booking details and check vehicle availability."
          }
          busy={busy}
          onClose={closeModal}
          size="md"
        >
          <form
            onSubmit={
              modal.type === "create"
                ? createBooking
                : saveEdit
            }
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

              <BookingFields
                form={form}
                updateField={updateField}
                busy={busy}
                isCreate={
                  modal.type === "create"
                }
              />

            </div>

            <div className="vfm-footer">
              <button
                type="button"
                className="vfm-btn vfm-btn-secondary"
                onClick={closeModal}
                disabled={busy}
              >
                Close
              </button>

              <button
                type="submit"
                className="vfm-btn vfm-btn-primary"
                disabled={busy}
              >
                {busy
                  ? modal.type === "create"
                    ? "Creating..."
                    : "Saving..."
                  : modal.type === "create"
                    ? "Create Booking"
                    : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================
          CANCEL MODAL
          ===================================== */}

      {cancelTarget && (
        <Modal
          title={
            `Cancel Booking #${cancelTarget.bookingId}`
          }
          subtitle="Choose which occurrence(s) to cancel."
          size="sm"
          onClose={closeModal}
          busy={busy}
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

            <div className="vfm-cancel-summary">

              <p>
                <strong>
                  Departure:
                </strong>{" "}
                {formatDate(
                  cancelTarget.departureAt
                )}
              </p>

              <p>
                <strong>
                  Status:
                </strong>{" "}
                {statusOf(
                  cancelTarget.status
                )}
              </p>

              <p>
                <strong>
                  Recurring booking:
                </strong>{" "}
                {cancelTarget.recurrenceGroupId
                  ? "Yes"
                  : "No"}
              </p>

              {cancelTarget.recurrenceGroupId && (
                <p>
                  <strong>
                    Active occurrences from this date:
                  </strong>{" "}
                  {futureCount}
                </p>
              )}
            </div>

            <p className="vfm-confirm-message">
              Cancelled bookings remain in
              the database as CANCELLED.
              The requester will receive
              a cancellation email if available.
            </p>

            <div className="vfm-cancel-actions">

              <button
                type="button"
                className="vfm-btn vfm-btn-primary"
                data-modal-autofocus
                disabled={busy}
                onClick={() =>
                  confirmCancel(false)
                }
              >
                {busy
                  ? "Cancelling..."
                  : "Only this booking"}
              </button>

              {cancelTarget.recurrenceGroupId && (
                <button
                  type="button"
                  className="vfm-btn vfm-btn-danger"
                  disabled={busy}
                  onClick={() =>
                    confirmCancel(true)
                  }
                >
                  This and all future bookings
                  {" "}({futureCount})
                </button>
              )}

              <button
                type="button"
                className="vfm-btn vfm-btn-secondary"
                onClick={closeModal}
                disabled={busy}
              >
                Close — do not cancel
              </button>

            </div>
          </div>
        </Modal>
      )}

      {/* =====================================
          APPROVE CONFIRMATION
          ===================================== */}

      {modal?.type === "approve" && (
        <ConfirmModal
          open
          title={
            `Approve Booking #${modal.booking.bookingId}`
          }
          message={
            `Approve the booking for ` +
            `${formatDate(modal.booking.departureAt)}? ` +
            `The requester will receive an approval email.`
          }
          confirmText="Approve Booking"
          onConfirm={approveBooking}
          onClose={closeModal}
          busy={busy}
          error={actionError}
        />
      )}

      {/* =====================================
          DELETE CONFIRMATION
          ===================================== */}

      {modal?.type === "delete" && (
        <ConfirmModal
          open
          title={
            `Delete Booking #${modal.booking.bookingId}`
          }
          message={
            `Purpose: ${modal.booking.purpose || "Not specified"}\n\n` +
            `This permanently deletes the booking from SQL Server. ` +
            `This action cannot be undone. ` +
            `Bookings linked to Journeys cannot be deleted.`
          }
          confirmText="Delete Permanently"
          variant="danger"
          onConfirm={deleteBooking}
          onClose={closeModal}
          busy={busy}
          error={actionError}
        />
      )}

    </>
  );
}
