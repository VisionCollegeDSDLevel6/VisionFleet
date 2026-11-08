
import { useEffect, useRef, useState } from "react";
import logo from "../assets/logo.png";
import Modal from "../components/Modal";
import "../styles/StaffDashboard.css";

const BOOKING_API = "/api/bookings";
const PROFILE_API = "/api/staff-workspace/profile";

const EMPTY_FORM = {
  purpose: "",
  departureAt: "",
  returnAt: "",
  passengerCount: "1",
  drivingOption: "DRIVER_REQUIRED",
  repeatWeeks: "1",
};

// =====================================
// Helpers
// =====================================

function getStatus(value) {
  return String(value || "UNKNOWN").toUpperCase();
}

function formatDate(value) {
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

function toInputDate(value) {
  return value ? String(value).slice(0, 16) : "";
}

function isFuture(booking) {
  return (
    new Date(booking.departureAt).getTime() >
    Date.now()
  );
}

function canEdit(booking) {
  return (
    getStatus(booking.status) === "PENDING" &&
    isFuture(booking)
  );
}

function canCancel(booking) {
  return (
    ["PENDING", "APPROVED"].includes(
      getStatus(booking.status)
    ) &&
    isFuture(booking)
  );
}

function statusText(value) {
  const current = getStatus(value);

  if (current === "PENDING") return "Pending approval";
  if (current === "APPROVED") return "Approved";
  if (current === "CANCELLED") return "Cancelled";
  if (current === "DECLINED") return "Declined";

  return current.replaceAll("_", " ");
}

// =====================================
// API Helpers
// =====================================

async function readError(response) {
  if (response.status === 401) {
    return "Session expired. Please sign in again.";
  }

  if (response.status === 403) {
    return "You do not have permission to do this.";
  }

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    if (typeof data === "string") return data;

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
    return text && !text.trim().startsWith("<")
      ? text
      : `HTTP ${response.status}`;
  }
}

async function apiRequest(
  url,
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
      throw new Error(await readError(tokenResponse));
    }

    const token = await tokenResponse.json();

    if (!token.csrfToken) {
      throw new Error("Missing security token.");
    }

    headers["X-CSRF-TOKEN"] = token.csrfToken;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
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
// Booking Validation
// =====================================

function validateBooking(
  form,
  canDrive,
  editing = false
) {
  const purpose = form.purpose.trim();

  if (!purpose || purpose.length > 500) {
    return "Purpose must contain 1 to 500 characters.";
  }

  if (!form.departureAt || !form.returnAt) {
    return "Please choose departure and return times.";
  }

  const departure = new Date(form.departureAt);
  const returning = new Date(form.returnAt);

  if (
    Number.isNaN(departure.getTime()) ||
    Number.isNaN(returning.getTime())
  ) {
    return "Invalid booking date.";
  }

  if (departure <= new Date()) {
    return "Departure must be in the future.";
  }

  if (returning <= departure) {
    return "Return must be after departure.";
  }

  const passengers = Number(form.passengerCount);

  if (
    !Number.isInteger(passengers) ||
    passengers < 1 ||
    passengers > 100
  ) {
    return "Passenger count must be between 1 and 100.";
  }

  if (
    !["DRIVER_REQUIRED", "SELF_DRIVE"].includes(
      form.drivingOption
    )
  ) {
    return "Choose a driving option.";
  }

  if (
    form.drivingOption === "SELF_DRIVE" &&
    !canDrive
  ) {
    return "Self Drive is not enabled for your account.";
  }

  if (!editing) {
    const weeks = Number(form.repeatWeeks);

    if (
      !Number.isInteger(weeks) ||
      weeks < 1 ||
      weeks > 52
    ) {
      return "Repeat weeks must be between 1 and 52.";
    }
  }

  return "";
}

function bookingPayload(form, editing = false) {
  const payload = {
    purpose: form.purpose.trim(),
    departureAt: `${form.departureAt}:00`,
    returnAt: `${form.returnAt}:00`,
    passengerCount: Number(form.passengerCount),
    drivingOption: form.drivingOption,
  };

  if (!editing) {
    payload.repeatWeeks = Number(form.repeatWeeks);
  }

  return payload;
}

// =====================================
// Reusable Booking Fields
// =====================================

function BookingFields({
  form,
  onFieldChange,
  canDrive,
  editing = false,
  disabled = false,
}) {
  return (
    <div className="sf-form-grid">
      <label className="sf-field sf-full">
        <span>What is the van needed for?</span>

        <textarea
          required
          rows={3}
          maxLength={500}
          placeholder="e.g. Student event, campus visit or equipment delivery"
          value={form.purpose}
          disabled={disabled}
          onChange={(event) =>
            onFieldChange(
              "purpose",
              event.target.value
            )
          }
        />
      </label>

      <label className="sf-field">
        <span>Departure</span>

        <input
          required
          type="datetime-local"
          value={form.departureAt}
          disabled={disabled}
          onChange={(event) =>
            onFieldChange(
              "departureAt",
              event.target.value
            )
          }
        />
      </label>

      <label className="sf-field">
        <span>Return</span>

        <input
          required
          type="datetime-local"
          value={form.returnAt}
          disabled={disabled}
          onChange={(event) =>
            onFieldChange(
              "returnAt",
              event.target.value
            )
          }
        />
      </label>

      <label className="sf-field">
        <span>Number of passengers</span>

        <input
          required
          type="number"
          min="1"
          max="100"
          step="1"
          value={form.passengerCount}
          disabled={disabled}
          onChange={(event) =>
            onFieldChange(
              "passengerCount",
              event.target.value
            )
          }
        />
      </label>

      {!editing && (
        <label className="sf-field">
          <span>Repeat booking</span>

          <select
            value={form.repeatWeeks}
            disabled={disabled}
            onChange={(event) =>
              onFieldChange(
                "repeatWeeks",
                event.target.value
              )
            }
          >
            <option value="1">One time only</option>
            <option value="2">Every week · 2 weeks</option>
            <option value="3">Every week · 3 weeks</option>
            <option value="4">Every week · 4 weeks</option>
            <option value="6">Every week · 6 weeks</option>
            <option value="8">Every week · 8 weeks</option>
            <option value="12">Every week · 12 weeks</option>
          </select>
        </label>
      )}

      <fieldset className="sf-drive-options sf-full">
        <legend>Who will drive?</legend>

        <label
          className={
            "sf-drive-option" +
            (
              form.drivingOption === "DRIVER_REQUIRED"
                ? " sf-drive-selected"
                : ""
            )
          }
        >
          <input
            type="radio"
            name={
              editing
                ? "edit-driving-option"
                : "new-driving-option"
            }
            checked={
              form.drivingOption ===
              "DRIVER_REQUIRED"
            }
            disabled={disabled}
            onChange={() =>
              onFieldChange(
                "drivingOption",
                "DRIVER_REQUIRED"
              )
            }
          />

          <span>
            <strong>I need a driver</strong>
            <small>
              Admin will assign an eligible driver
              after approving the booking.
            </small>
          </span>
        </label>

        <label
          className={
            "sf-drive-option" +
            (
              form.drivingOption === "SELF_DRIVE"
                ? " sf-drive-selected"
                : ""
            )
          }
        >
          <input
            type="radio"
            name={
              editing
                ? "edit-driving-option"
                : "new-driving-option"
            }
            checked={
              form.drivingOption === "SELF_DRIVE"
            }
            disabled={disabled || !canDrive}
            onChange={() =>
              onFieldChange(
                "drivingOption",
                "SELF_DRIVE"
              )
            }
          />

          <span>
            <strong>I will drive myself</strong>
            <small>
              {canDrive
                ? "Self Drive is enabled for your account."
                : "Ask Admin to enable your driving permission."}
            </small>
          </span>
        </label>
      </fieldset>
    </div>
  );
}

// =====================================
// Booking Card
// =====================================

function BookingCard({
  booking,
  onView,
  onEdit,
  onCancel,
}) {
  const editable = canEdit(booking);
  const cancellable = canCancel(booking);

  return (
    <article className="sf-booking-card">
      <div className="sf-booking-top">
        <div>
          <span className="sf-booking-number">
            BOOKING #{booking.bookingId}
          </span>

          <h3>
            {booking.purpose || "Van booking"}
          </h3>
        </div>

        <span
          className={
            "sf-status sf-status-" +
            getStatus(booking.status).toLowerCase()
          }
        >
          {statusText(booking.status)}
        </span>
      </div>

      <div className="sf-booking-information">
        <div>
          <span>Departure</span>
          <strong>
            {formatDate(booking.departureAt)}
          </strong>
        </div>

        <div>
          <span>Return</span>
          <strong>
            {formatDate(booking.returnAt)}
          </strong>
        </div>

        <div>
          <span>Driving</span>
          <strong>
            {booking.drivingOption === "SELF_DRIVE"
              ? "Self Drive"
              : "Driver Required"}
          </strong>
        </div>

        <div>
          <span>Passengers</span>
          <strong>
            {booking.passengerCount}
          </strong>
        </div>
      </div>

      <div className="sf-booking-actions">
        <button
          type="button"
          className="sf-button sf-button-secondary"
          onClick={() => onView(booking)}
        >
          View details
        </button>

        {editable && (
          <button
            type="button"
            className="sf-button sf-button-secondary"
            onClick={() => onEdit(booking)}
          >
            Edit
          </button>
        )}

        {cancellable && (
          <button
            type="button"
            className="sf-button sf-button-danger"
            onClick={() => onCancel(booking)}
          >
            Cancel
          </button>
        )}
      </div>
    </article>
  );
}

// =====================================
// Staff Workspace
// =====================================

export default function StaffDashboard({
  user,
  onLogout,
  loggingOut,
  logoutError,
}) {
  const [page, setPage] = useState("bookings");
  const [menuOpen, setMenuOpen] = useState(false);

  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("ALL");

  const [form, setForm] = useState({
    ...EMPTY_FORM,
  });

  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // Modal: view / edit / cancel
  const [modal, setModal] = useState(null);
  const [editForm, setEditForm] = useState({
    ...EMPTY_FORM,
  });
  const [modalError, setModalError] = useState("");

  const canDrive = Boolean(profile?.canDrive);

  // =====================================
  // Hamburger menu
  // =====================================

  useEffect(() => {
    if (!menuOpen) return;

    drawerRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [menuOpen]);

  function navigate(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
    setNotice("");
    setFormError("");
    setModal(null);
  }

  // =====================================
  // Load Staff's own data
  // =====================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setLoadError("");

      try {
        const [profileData, bookingData] =
          await Promise.all([
            apiRequest(
              PROFILE_API,
              "GET",
              undefined,
              controller.signal
            ),
            apiRequest(
              BOOKING_API,
              "GET",
              undefined,
              controller.signal
            ),
          ]);

        if (!Array.isArray(bookingData)) {
          throw new Error(
            "Unexpected Booking API response."
          );
        }

        if (controller.signal.aborted) return;

        setProfile(profileData);
        setBookings(bookingData);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error.message ||
            "Unable to load your bookings."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => controller.abort();
  }, [refreshKey]);

  function reload() {
    setRefreshKey((value) => value + 1);
  }

  // =====================================
  // Update forms
  // =====================================

  function changeNewField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setFormError("");
  }

  function changeEditField(name, value) {
    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));

    setModalError("");
  }

  // =====================================
  // CREATE BOOKING
  // =====================================

  async function submitBooking(event) {
    event.preventDefault();

    if (busy) return;

    const problem = validateBooking(
      form,
      canDrive
    );

    if (problem) {
      setFormError(problem);
      return;
    }

    setBusy(true);
    setFormError("");

    try {
      const result = await apiRequest(
        BOOKING_API,
        "POST",
        bookingPayload(form)
      );

      const created =
        result.createdCount ?? 1;

      const skipped =
        result.skippedCount ?? 0;

      setForm({ ...EMPTY_FORM });

      setNotice(
        `Booking request submitted. ` +
        `${created} booking(s) created.` +
        (
          skipped > 0
            ? ` ${skipped} occurrence(s) skipped.`
            : ""
        )
      );

      setPage("bookings");
      reload();
    } catch (error) {
      setFormError(
        error.message ||
        "Could not submit booking."
      );
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // VIEW
  // =====================================

  function openView(booking) {
    setModalError("");

    setModal({
      type: "view",
      booking,
    });
  }

  // =====================================
  // EDIT (PENDING ONLY)
  // =====================================

  function openEdit(booking) {
    if (!canEdit(booking) || busy) return;

    setEditForm({
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
      drivingOption: booking.drivingOption,
      repeatWeeks: "1",
    });

    setModalError("");

    setModal({
      type: "edit",
      booking,
    });
  }

  async function saveEdit(event) {
    event.preventDefault();

    if (
      busy ||
      modal?.type !== "edit"
    ) {
      return;
    }

    const problem = validateBooking(
      editForm,
      canDrive,
      true
    );

    if (problem) {
      setModalError(problem);
      return;
    }

    setBusy(true);
    setModalError("");

    try {
      await apiRequest(
        `${BOOKING_API}/${modal.booking.bookingId}`,
        "PUT",
        bookingPayload(editForm, true)
      );

      setModal(null);

      setNotice(
        `Booking #${modal.booking.bookingId} updated successfully.`
      );

      reload();
    } catch (error) {
      setModalError(
        error.message ||
        "Unable to edit booking."
      );
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // CANCEL (when Backend permits)
  // =====================================

  function openCancel(booking) {
    if (!canCancel(booking) || busy) return;

    setModalError("");

    setModal({
      type: "cancel",
      booking,
    });
  }

  async function confirmCancel() {
    if (
      busy ||
      modal?.type !== "cancel"
    ) {
      return;
    }

    const bookingId =
      modal.booking.bookingId;

    setBusy(true);
    setModalError("");

    try {
      await apiRequest(
        `${BOOKING_API}/${bookingId}/cancel`,
        "PUT"
      );

      setModal(null);

      setNotice(
        `Booking #${bookingId} cancelled successfully.`
      );

      reload();
    } catch (error) {
      setModalError(
        error.message ||
        "This booking cannot be cancelled."
      );
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    if (busy) return;

    setModal(null);
    setModalError("");
  }

  // =====================================
  // Filter bookings
  // =====================================

  const filteredBookings = bookings
    .filter((booking) => {
      const keyword =
        search.trim().toLowerCase();

      const matchesSearch = [
        booking.bookingId,
        booking.purpose,
        booking.drivingOption,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(keyword)
      );

      const matchesStatus =
        statusFilter === "ALL" ||
        getStatus(booking.status) ===
          statusFilter;

      return (
        matchesSearch &&
        matchesStatus
      );
    })
    .sort(
      (a, b) =>
        new Date(b.departureAt) -
        new Date(a.departureAt)
    );

  const pendingCount = bookings.filter(
    (booking) =>
      getStatus(booking.status) === "PENDING"
  ).length;

  const approvedCount = bookings.filter(
    (booking) =>
      getStatus(booking.status) === "APPROVED"
  ).length;

  const displayName =
    profile?.fullName ||
    user?.fullName ||
    "Staff";

  const firstName =
    displayName.trim().split(/\s+/)[0] ||
    "Staff";

  return (
    <div className="sf-app">

      {/* =====================================
          Mobile-friendly header
          ===================================== */}

      <header className="sf-header">
        <div className="sf-header-inner">

          <button
            ref={menuButtonRef}
            type="button"
            className="sf-menu-button"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            aria-controls="sf-navigation"
            onClick={() =>
              setMenuOpen(true)
            }
          >
            <span />
            <span />
            <span />
          </button>

          <button
            type="button"
            className="sf-brand"
            onClick={() =>
              navigate("bookings")
            }
            aria-label="Vision Fleet My Bookings"
          >
            <img
              src={logo}
              alt=""
            />

            <span>Vision Fleet</span>
          </button>

          <span className="sf-header-avatar">
            {displayName
              .trim()
              .charAt(0)
              .toUpperCase()}
          </span>

        </div>
      </header>

      {/* =====================================
          Slide-out hamburger menu
          ===================================== */}

      {menuOpen && (
        <div className="sf-menu-layer">

          <button
            type="button"
            className="sf-menu-backdrop"
            aria-label="Close navigation menu"
            onClick={() =>
              setMenuOpen(false)
            }
          />

          <aside
            id="sf-navigation"
            ref={drawerRef}
            tabIndex={-1}
            className="sf-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="sf-drawer-top">
              <strong>Vision Fleet</strong>

              <button
                type="button"
                className="sf-drawer-close"
                aria-label="Close menu"
                onClick={() => {
                  setMenuOpen(false);
                  menuButtonRef.current?.focus();
                }}
              >
                ×
              </button>
            </div>

            <div className="sf-drawer-user">
              <span className="sf-drawer-avatar">
                {displayName
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </span>

              <div>
                <strong>{displayName}</strong>
                <small>Staff account</small>
              </div>
            </div>

            <nav
              className="sf-drawer-links"
              aria-label="Staff pages"
            >
              <button
                type="button"
                className={
                  page === "bookings"
                    ? "sf-link-active"
                    : ""
                }
                onClick={() =>
                  navigate("bookings")
                }
              >
                <span>▤</span>
                My Bookings
              </button>

              <button
                type="button"
                className={
                  page === "new"
                    ? "sf-link-active"
                    : ""
                }
                onClick={() =>
                  navigate("new")
                }
              >
                <span>＋</span>
                New Booking
              </button>
            </nav>

            <div className="sf-drawer-bottom">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                disabled={loggingOut}
              >
                {loggingOut
                  ? "Signing out..."
                  : "Sign out"}
              </button>
            </div>
          </aside>

        </div>
      )}

      {/* =====================================
          Main user content
          ===================================== */}

      <main className="sf-main">

        {logoutError && (
          <div
            className="sf-alert sf-alert-error"
            role="alert"
          >
            {logoutError}
          </div>
        )}

        {loadError && (
          <div
            className="sf-alert sf-alert-error"
            role="alert"
          >
            {loadError}

            <button
              type="button"
              onClick={reload}
            >
              Retry
            </button>
          </div>
        )}

        {notice && (
          <div
            className="sf-alert sf-alert-success"
            role="status"
          >
            {notice}
          </div>
        )}

        {loading && (
          <div className="sf-loading">
            Loading your bookings...
          </div>
        )}

        {/* =====================================
            MY BOOKINGS
            ===================================== */}

        {!loading &&
          !loadError &&
          page === "bookings" && (
            <>
              <section className="sf-welcome">
                <span className="sf-eyebrow">
                  YOUR FLEET BOOKINGS
                </span>

                <h1>
                  Hello, {firstName}
                </h1>

                <p>
                  Manage your requests and
                  follow their approval status.
                </p>

                <button
                  type="button"
                  className="sf-button sf-button-primary"
                  onClick={() =>
                    navigate("new")
                  }
                >
                  + New Booking
                </button>
              </section>

              <div className="sf-mini-summary">
                <div>
                  <strong>{bookings.length}</strong>
                  <span>Total bookings</span>
                </div>

                <div>
                  <strong>{pendingCount}</strong>
                  <span>Pending</span>
                </div>

                <div>
                  <strong>{approvedCount}</strong>
                  <span>Approved</span>
                </div>
              </div>

              <section className="sf-section-heading">
                <div>
                  <h2>My Bookings</h2>

                  <p>
                    View your booking requests
                    and their latest status.
                  </p>
                </div>

                <button
                  type="button"
                  className="sf-text-button"
                  onClick={reload}
                >
                  ↻ Refresh
                </button>
              </section>

              <div className="sf-filters">
                <label>
                  <span>Search</span>

                  <input
                    type="search"
                    placeholder="Search purpose or booking ID"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Status</span>

                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(
                        event.target.value
                      )
                    }
                  >
                    <option value="ALL">
                      All bookings
                    </option>

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
                      Declined
                    </option>
                  </select>
                </label>
              </div>

              {filteredBookings.length === 0 ? (
                <div className="sf-empty">
                  <div className="sf-empty-icon">
                    ▤
                  </div>

                  <h3>No bookings found</h3>

                  <p>
                    {bookings.length === 0
                      ? "Create your first booking to get started."
                      : "Try changing your search or status filter."}
                  </p>

                  {bookings.length === 0 && (
                    <button
                      type="button"
                      className="sf-button sf-button-primary"
                      onClick={() =>
                        navigate("new")
                      }
                    >
                      Create Booking
                    </button>
                  )}
                </div>
              ) : (
                <div className="sf-booking-list">
                  {filteredBookings.map(
                    (booking) => (
                      <BookingCard
                        key={booking.bookingId}
                        booking={booking}
                        onView={openView}
                        onEdit={openEdit}
                        onCancel={openCancel}
                      />
                    )
                  )}
                </div>
              )}
            </>
          )}

        {/* =====================================
            NEW BOOKING
            ===================================== */}

        {!loading &&
          !loadError &&
          page === "new" && (
            <>
              <section className="sf-page-intro">
                <span className="sf-eyebrow">
                  BOOK A VEHICLE
                </span>

                <h1>New Booking</h1>

                <p>
                  Tell us when you need a van.
                  Your request will be sent
                  to Admin for approval.
                </p>
              </section>

              <section className="sf-form-card">
                <div className="sf-form-heading">
                  <h2>Booking details</h2>

                  <p>
                    Complete the information
                    below to request a van.
                  </p>
                </div>

                <form onSubmit={submitBooking}>
                  <div className="sf-form-body">

                    {formError && (
                      <div
                        className="sf-alert sf-alert-error"
                        role="alert"
                      >
                        {formError}
                      </div>
                    )}

                    <BookingFields
                      form={form}
                      onFieldChange={
                        changeNewField
                      }
                      canDrive={canDrive}
                      disabled={busy}
                    />

                    <div className="sf-form-note">
                      <strong>Before submitting</strong>

                      <p>
                        Your booking will start
                        as Pending. The system
                        checks for an available
                        vehicle when you submit.
                        Admin will review
                        your request.
                      </p>
                    </div>
                  </div>

                  <div className="sf-form-footer">
                    <button
                      type="button"
                      className="sf-button sf-button-secondary"
                      onClick={() =>
                        navigate("bookings")
                      }
                      disabled={busy}
                    >
                      Back
                    </button>

                    <button
                      type="submit"
                      className="sf-button sf-button-primary"
                      disabled={busy}
                    >
                      {busy
                        ? "Submitting..."
                        : "Submit Request"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}

      </main>

      {/* =====================================
          VIEW BOOKING MODAL
          ===================================== */}

      {modal?.type === "view" && (
        <Modal
          open
          title={
            `Booking #${modal.booking.bookingId}`
          }
          subtitle="Your booking information"
          size="md"
          onClose={closeModal}
        >
          <div className="vfm-body">
            <div className="sf-detail-grid">

              {[
                [
                  "Status",
                  statusText(
                    modal.booking.status
                  ),
                ],
                [
                  "Purpose",
                  modal.booking.purpose,
                ],
                [
                  "Departure",
                  formatDate(
                    modal.booking.departureAt
                  ),
                ],
                [
                  "Return",
                  formatDate(
                    modal.booking.returnAt
                  ),
                ],
                [
                  "Passengers",
                  modal.booking.passengerCount,
                ],
                [
                  "Driving option",
                  modal.booking.drivingOption ===
                  "SELF_DRIVE"
                    ? "Self Drive"
                    : "Driver Required",
                ],
                [
                  "Assigned van",
                  modal.booking.assignedVanId == null
                    ? "Not assigned"
                    : `Van #${modal.booking.assignedVanId}`,
                ],
                [
                  "Recurring booking",
                  modal.booking.recurrenceGroupId
                    ? "Yes"
                    : "No",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value ?? "—"}</strong>
                </div>
              ))}

            </div>

            {getStatus(
              modal.booking.status
            ) === "APPROVED" && (
              <p className="sf-modal-note">
                This booking is approved
                and can no longer be edited.
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
          EDIT BOOKING MODAL
          ===================================== */}

      {modal?.type === "edit" && (
        <Modal
          open
          title={
            `Edit Booking #${modal.booking.bookingId}`
          }
          subtitle="Only pending bookings can be edited."
          size="md"
          busy={busy}
          onClose={closeModal}
        >
          <form onSubmit={saveEdit}>

            <div className="vfm-body">

              {modalError && (
                <div
                  className="sf-alert sf-alert-error"
                  role="alert"
                >
                  {modalError}
                </div>
              )}

              <BookingFields
                form={editForm}
                onFieldChange={
                  changeEditField
                }
                canDrive={canDrive}
                editing
                disabled={busy}
              />
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
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>

          </form>
        </Modal>
      )}

      {/* =====================================
          CANCEL BOOKING MODAL
          ===================================== */}

      {modal?.type === "cancel" && (
        <Modal
          open
          title={
            `Cancel Booking #${modal.booking.bookingId}`
          }
          subtitle="This request will remain in your booking history."
          size="sm"
          busy={busy}
          onClose={closeModal}
        >
          <div className="vfm-body">

            {modalError && (
              <div
                className="sf-alert sf-alert-error"
                role="alert"
              >
                {modalError}
              </div>
            )}

            <p className="sf-cancel-message">
              Are you sure you want to
              cancel this booking?
            </p>

            <div className="sf-cancel-summary">
              <strong>
                {modal.booking.purpose}
              </strong>

              <span>
                {formatDate(
                  modal.booking.departureAt
                )}
              </span>
            </div>

            <p className="sf-modal-note">
              Approved bookings with a linked
              Journey record cannot be cancelled.
              Recurring bookings are cancelled
              one occurrence at a time.
            </p>
          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              disabled={busy}
              onClick={closeModal}
            >
              Keep Booking
            </button>

            <button
              type="button"
              className="vfm-btn vfm-btn-delete"
              disabled={busy}
              onClick={confirmCancel}
            >
              {busy
                ? "Cancelling..."
                : "Cancel Booking"}
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
