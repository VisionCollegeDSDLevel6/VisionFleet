
import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import AddVanForm from "../components/AddVanForm";
import MaintenanceWorkspace from "../components/MaintenanceWorkspace";
import { getVans } from "../services/vanService";
import "../styles/VanManagement.css";

const API = "/api/vans";

const emptyEditForm = {
  registration: "",
  makeModel: "",
  capacity: "",
};

// =====================================
// API Helpers
// =====================================

async function readError(response) {
  if (response.status === 401) {
    return "Session expired. Please log in again.";
  }

  if (response.status === 403) {
    return "Only Admin can perform this action.";
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

async function getCsrfToken() {
  const response = await fetch(
    "/api/security/csrf-token",
    {
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = await response.json();

  if (!data.csrfToken) {
    throw new Error("Security token is missing.");
  }

  return data.csrfToken;
}

async function getVanDetails(id) {
  const response = await fetch(
    `${API}/${id}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

async function updateVan(id, data) {
  const csrfToken = await getCsrfToken();

  const response = await fetch(
    `${API}/${id}`,
    {
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrfToken,
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

async function removeVan(id) {
  const csrfToken = await getCsrfToken();

  const response = await fetch(
    `${API}/${id}`,
    {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
      headers: {
        "X-CSRF-TOKEN": csrfToken,
      },
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

// =====================================
// Van Management
// =====================================

export default function VanManagement() {
  const [activeTab, setActiveTab] =
    useState("vehicles");

  const [vans, setVans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All");

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [successMessage, setSuccessMessage] =
    useState("");

  // CREATE
  const [showAddForm, setShowAddForm] =
    useState(false);

  // READ
  const [viewTarget, setViewTarget] =
    useState(null);

  const [viewDetails, setViewDetails] =
    useState(null);

  const [viewLoading, setViewLoading] =
    useState(false);

  const [viewError, setViewError] =
    useState("");

  // UPDATE
  const [editTarget, setEditTarget] =
    useState(null);

  const [editForm, setEditForm] =
    useState({ ...emptyEditForm });

  const [editLoading, setEditLoading] =
    useState(false);

  const [editError, setEditError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  // DELETE
  const [deleteTarget, setDeleteTarget] =
    useState(null);

  const [deleteError, setDeleteError] =
    useState("");

  const [deleting, setDeleting] =
    useState(false);

  const isBusy = saving || deleting;

  // =====================================
  // Load all vehicles
  // =====================================

  useEffect(() => {
    let cancelled = false;

    async function loadVans() {
      setLoading(true);
      setError("");

      try {
        const data = await getVans();

        if (!cancelled) {
          setVans(
            Array.isArray(data) ? data : []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load vehicles."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadVans();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function refreshVans() {
    setRefreshKey((previous) => previous + 1);
  }

  // =====================================
  // CREATE - Add Van
  // =====================================

  function openAddVan() {
    setSuccessMessage("");
    setShowAddForm(true);
  }

  function closeAddVan() {
    setShowAddForm(false);
  }

  function handleAddSuccess(createdVan) {
    setShowAddForm(false);

    setSuccessMessage(
      `Vehicle ${createdVan.registration} added successfully.`
    );

    refreshVans();
  }

  // =====================================
  // READ - View Van Details
  // =====================================

  async function openViewVan(van) {
    if (isBusy) return;

    setViewTarget(van);
    setViewDetails(null);
    setViewError("");
    setViewLoading(true);

    try {
      const data = await getVanDetails(
        van.vanId
      );

      setViewDetails(data);
    } catch (err) {
      setViewError(
        err.message ||
        "Unable to load vehicle details."
      );
    } finally {
      setViewLoading(false);
    }
  }

  function closeViewVan() {
    setViewTarget(null);
    setViewDetails(null);
    setViewError("");
    setViewLoading(false);
  }

  // =====================================
  // UPDATE - Open Edit Van
  // =====================================

  async function openEditVan(van) {
    if (isBusy) return;

    setSuccessMessage("");
    setEditTarget(van);
    setEditError("");
    setEditLoading(true);

    // Show current table values immediately.
    setEditForm({
      registration: van.registration || "",
      makeModel: van.makeModel || "",
      capacity: String(van.capacity ?? ""),
    });

    try {
      // Refresh form values from database.
      const data = await getVanDetails(
        van.vanId
      );

      setEditForm({
        registration: data.registration || "",
        makeModel: data.makeModel || "",
        capacity: String(data.capacity ?? ""),
      });
    } catch (err) {
      setEditError(
        err.message ||
        "Unable to load vehicle details."
      );
    } finally {
      setEditLoading(false);
    }
  }

  function closeEditVan() {
    if (saving || editLoading) return;

    setEditTarget(null);
    setEditForm({ ...emptyEditForm });
    setEditError("");
  }

  function changeEditField(name, value) {
    setEditForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setEditError("");
  }

  // =====================================
  // UPDATE - Save Van
  // =====================================

  async function handleSaveVan(event) {
    event.preventDefault();

    if (
      !editTarget ||
      saving ||
      editLoading
    ) {
      return;
    }

    const registration =
      editForm.registration.trim();

    const makeModel =
      editForm.makeModel.trim();

    const capacity =
      Number(editForm.capacity);

    // Frontend validation
    if (!registration) {
      setEditError(
        "Registration number is required."
      );
      return;
    }

    if (!makeModel) {
      setEditError(
        "Make and model are required."
      );
      return;
    }

    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 50
    ) {
      setEditError(
        "Capacity must be between 1 and 50."
      );
      return;
    }

    setSaving(true);
    setEditError("");

    try {
      const updated = await updateVan(
        editTarget.vanId,
        {
          registration,
          makeModel,
          capacity,
        }
      );

      setEditTarget(null);
      setEditForm({ ...emptyEditForm });

      setSuccessMessage(
        `Vehicle ${updated.registration || registration} updated successfully.`
      );

      refreshVans();
    } catch (err) {
      setEditError(
        err.message ||
        "Unable to update this vehicle."
      );
    } finally {
      setSaving(false);
    }
  }

  // =====================================
  // DELETE - Open confirmation
  // =====================================

  function openDeleteVan(van) {
    if (isBusy) return;

    setSuccessMessage("");
    setDeleteError("");
    setDeleteTarget(van);
  }

  function closeDeleteVan() {
    if (deleting) return;

    setDeleteTarget(null);
    setDeleteError("");
  }

  // =====================================
  // DELETE - Remove Van
  // =====================================

  async function handleDeleteVan() {
    if (!deleteTarget || deleting) return;

    const van = deleteTarget;

    setDeleting(true);
    setDeleteError("");

    try {
      await removeVan(van.vanId);

      setDeleteTarget(null);

      setSuccessMessage(
        `Vehicle ${van.registration} deleted successfully.`
      );

      refreshVans();
    } catch (err) {
      setDeleteError(
        err.message ||
        "Unable to delete this vehicle."
      );
    } finally {
      setDeleting(false);
    }
  }

  // =====================================
  // Navigation
  // =====================================

  function changeTab(tab) {
    if (isBusy) return;

    setActiveTab(tab);
    setShowAddForm(false);
    setSuccessMessage("");
  }

  // =====================================
  // Statistics
  // =====================================

  const availableCount = vans.filter(
    (van) =>
      String(
        van.availabilityStatus || ""
      ).toLowerCase() === "available"
  ).length;

  const totalSeats = vans.reduce(
    (total, van) =>
      total + (Number(van.capacity) || 0),
    0
  );

  const statusOptions = [
    "All",
    ...new Set(
      vans
        .map((van) => van.availabilityStatus)
        .filter(Boolean)
    ),
  ];

  // =====================================
  // Search and filter
  // =====================================

  const filteredVans = vans.filter(
    (van) => {
      const keyword =
        search.trim().toLowerCase();

      const matchesSearch =
        String(van.registration || "")
          .toLowerCase()
          .includes(keyword) ||
        String(van.makeModel || "")
          .toLowerCase()
          .includes(keyword);

      const matchesStatus =
        statusFilter === "All" ||
        van.availabilityStatus ===
          statusFilter;

      return (
        matchesSearch &&
        matchesStatus
      );
    }
  );

  const dataReady =
    !loading && !error;

  function getStatusClass(status) {
    const value = String(
      status || ""
    ).toLowerCase();

    if (value === "available") {
      return "vf-van-status-available";
    }

    if (
      value === "maintenance" ||
      value === "in maintenance"
    ) {
      return "vf-van-status-maintenance";
    }

    return "vf-van-status-other";
  }

  const pageDescriptions = {
    vehicles:
      "View, add, edit and delete fleet vehicles.",
    maintenance:
      "Monitor scheduled and ongoing vehicle maintenance.",
    records:
      "Review the maintenance history of your fleet.",
  };

  // =====================================
  // Render Page
  // =====================================

  return (
    <>
      <div className="vf-van-page">

        {/* Header */}

        <header className="vf-van-page-header">
          <div>
            <span className="vf-eyebrow">
              FLEET MANAGEMENT
            </span>

            <h1>Van Management</h1>

            <p>
              {pageDescriptions[activeTab]}
            </p>
          </div>

          {activeTab === "vehicles" && (
            <div className="vf-van-header-actions">

              <button
                type="button"
                className="vf-van-refresh"
                onClick={refreshVans}
                disabled={loading || isBusy}
              >
                ↻ Refresh
              </button>

              <button
                type="button"
                className="vf-addvan-trigger"
                onClick={openAddVan}
                disabled={isBusy}
              >
                + Add Van
              </button>

            </div>
          )}
        </header>

        {/* Navigation Tabs */}

        <nav
          className="vf-van-toolbar"
          aria-label="Van management sections"
        >
          <button
            type="button"
            className={
              activeTab === "vehicles"
                ? "vf-addvan-trigger"
                : "vf-van-refresh"
            }
            onClick={() =>
              changeTab("vehicles")
            }
            aria-pressed={
              activeTab === "vehicles"
            }
          >
            Vehicles
          </button>

          <button
            type="button"
            className={
              activeTab === "maintenance"
                ? "vf-addvan-trigger"
                : "vf-van-refresh"
            }
            onClick={() =>
              changeTab("maintenance")
            }
            aria-pressed={
              activeTab === "maintenance"
            }
          >
            Maintenance
          </button>

          <button
            type="button"
            className={
              activeTab === "records"
                ? "vf-addvan-trigger"
                : "vf-van-refresh"
            }
            onClick={() =>
              changeTab("records")
            }
            aria-pressed={
              activeTab === "records"
            }
          >
            Maintenance Records
          </button>
        </nav>

        {/* =====================================
            Vehicles Tab
            ===================================== */}

        {activeTab === "vehicles" && (
          <>
            {successMessage && (
              <div
                className="vf-addvan-success"
                role="status"
              >
                {successMessage}
              </div>
            )}

            {/* Summary Cards */}

            <section
              className="vf-van-summary"
              aria-label="Fleet summary"
            >

              <article className="vf-van-summary-card">
                <div className="vf-van-summary-label">
                  Total vehicles
                  <Icon
                    name="van"
                    size={20}
                  />
                </div>

                <strong>
                  {dataReady
                    ? vans.length
                    : "—"}
                </strong>

                <p>
                  Registered fleet vehicles
                </p>
              </article>

              <article className="vf-van-summary-card">
                <div className="vf-van-summary-label">
                  Available vehicles
                  <Icon
                    name="check"
                    size={20}
                  />
                </div>

                <strong>
                  {dataReady
                    ? availableCount
                    : "—"}
                </strong>

                <p>
                  Marked Available in database
                </p>
              </article>

              <article className="vf-van-summary-card">
                <div className="vf-van-summary-label">
                  Total passenger capacity
                  <Icon
                    name="driver"
                    size={20}
                  />
                </div>

                <strong>
                  {dataReady
                    ? totalSeats
                    : "—"}
                </strong>

                <p>
                  Combined seating capacity
                </p>
              </article>

            </section>

            {/* Fleet Table */}

            <section className="vf-van-panel">

              <div className="vf-van-panel-header">
                <div>
                  <h2>Fleet vehicles</h2>

                  <p>
                    Search and manage registered vans
                  </p>
                </div>

                <span className="vf-van-result-count">
                  {dataReady
                    ? `${filteredVans.length} vehicles`
                    : "—"}
                </span>
              </div>

              {/* Search and Filter */}

              <div className="vf-van-toolbar">
                <div className="vf-van-search">
                  <label htmlFor="van-search">
                    Search vehicles
                  </label>

                  <input
                    id="van-search"
                    type="search"
                    placeholder="Search model or registration..."
                    value={search}
                    onChange={(e) =>
                      setSearch(e.target.value)
                    }
                  />
                </div>

                <div className="vf-van-filter">
                  <label htmlFor="van-status">
                    Operational status
                  </label>

                  <select
                    id="van-status"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(
                        e.target.value
                      )
                    }
                  >
                    {statusOptions.map(
                      (status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {status === "All"
                            ? "All statuses"
                            : status}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              {/* API error */}

              {error && (
                <div
                  className="vf-van-error"
                  role="alert"
                >
                  <strong>
                    Could not load vehicles
                  </strong>

                  <p>{error}</p>

                  <button
                    type="button"
                    onClick={refreshVans}
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Loading */}

              {!error && loading && (
                <div
                  className="vf-van-loading"
                  role="status"
                >
                  Loading vehicles...
                </div>
              )}

              {/* Table */}

              {!error &&
                !loading &&
                (
                  filteredVans.length > 0
                    ? (
                      <div className="vf-van-table-scroll">
                        <table className="vf-van-table">
                          <thead>
                            <tr>
                              <th>VEHICLE</th>
                              <th>REGISTRATION</th>
                              <th>CAPACITY</th>
                              <th>OPERATIONAL STATUS</th>
                              <th>ACTIONS</th>
                            </tr>
                          </thead>

                          <tbody>
                            {filteredVans.map(
                              (van) => (
                                <tr
                                  key={van.vanId}
                                >

                                  <td data-label="Vehicle">
                                    <div className="vf-van-vehicle">
                                      <span className="vf-van-vehicle-icon">
                                        <Icon
                                          name="van"
                                          size={21}
                                        />
                                      </span>

                                      <div>
                                        <strong>
                                          {van.makeModel ||
                                            "Unknown model"}
                                        </strong>

                                        <small>
                                          Fleet vehicle
                                        </small>
                                      </div>
                                    </div>
                                  </td>

                                  <td data-label="Registration">
                                    <span className="vf-van-registration">
                                      {van.registration || "—"}
                                    </span>
                                  </td>

                                  <td data-label="Capacity">
                                    {van.capacity} seats
                                  </td>

                                  <td data-label="Operational status">
                                    <span
                                      className={
                                        "vf-van-status " +
                                        getStatusClass(
                                          van.availabilityStatus
                                        )
                                      }
                                    >
                                      <span
                                        className="vf-van-status-dot"
                                      />

                                      {van.availabilityStatus ||
                                        "Unknown"}
                                    </span>
                                  </td>

                                  {/* CRUD actions */}

                                  <td data-label="Actions">
                                    <div className="vf-van-actions">

                                      <button
                                        type="button"
                                        className="vf-van-view-btn"
                                        onClick={() =>
                                          openViewVan(van)
                                        }
                                        disabled={isBusy}
                                      >
                                        View
                                      </button>

                                      <button
                                        type="button"
                                        className="vf-van-edit-btn"
                                        onClick={() =>
                                          openEditVan(van)
                                        }
                                        disabled={isBusy}
                                      >
                                        Edit
                                      </button>

                                      <button
                                        type="button"
                                        className="vf-van-delete-btn"
                                        onClick={() =>
                                          openDeleteVan(van)
                                        }
                                        disabled={isBusy}
                                      >
                                        Delete
                                      </button>

                                    </div>
                                  </td>

                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )
                    : (
                      <div className="vf-van-empty">
                        <Icon
                          name="van"
                          size={30}
                        />

                        <h3>
                          {vans.length === 0
                            ? "No vehicles registered"
                            : "No matching vehicles"}
                        </h3>

                        <p>
                          {vans.length === 0
                            ? "There are currently no vans in the database."
                            : "Try changing your search or status filter."}
                        </p>
                      </div>
                    )
                )}

              <div className="vf-van-panel-footer">
                <span>
                  Vehicle data from VisionFleetDB
                </span>

                <span>
                  {dataReady
                    ? `${filteredVans.length} of ${vans.length} shown`
                    : "—"}
                </span>
              </div>

            </section>

            <p className="vf-van-note">
              <Icon
                name="info"
                size={17}
              />

              Availability for a particular date
              is checked separately when making
              a booking.
            </p>
          </>
        )}

        {/* Maintenance tab */}

        {activeTab === "maintenance" && (
          <MaintenanceWorkspace
            key="maintenance"
            mode="maintenance"
            vans={vans}
          />
        )}

        {/* Maintenance Records tab */}

        {activeTab === "records" && (
          <MaintenanceWorkspace
            key="records"
            mode="records"
            vans={vans}
          />
        )}

      </div>

      {/* =====================================
          CREATE - Add Van Modal
          ===================================== */}

      {showAddForm && (
        <Modal
          open
          title="Add New Van"
          subtitle="Register a new vehicle in Vision Fleet."
          size="md"
          onClose={closeAddVan}
        >
          <div className="vfm-body">
            <AddVanForm
              onAdded={handleAddSuccess}
              onCancel={closeAddVan}
            />
          </div>
        </Modal>
      )}

      {/* =====================================
          READ - View Details Modal
          ===================================== */}

      {viewTarget && (
        <Modal
          open
          title="Vehicle Details"
          subtitle="Information stored in VisionFleetDB."
          size="md"
          onClose={closeViewVan}
        >
          <div className="vfm-body">

            {viewLoading && (
              <p className="vf-van-detail-loading">
                Loading vehicle details...
              </p>
            )}

            {viewError && (
              <div
                className="vfm-error"
                role="alert"
              >
                {viewError}
              </div>
            )}

            {viewDetails && (
              <>
                <div className="vf-van-detail-hero">
                  <span className="vf-van-detail-icon">
                    <Icon
                      name="van"
                      size={27}
                    />
                  </span>

                  <div>
                    <span className="vf-van-detail-eyebrow">
                      FLEET VEHICLE
                    </span>

                    <h3>
                      {viewDetails.makeModel}
                    </h3>

                    <p>
                      {viewDetails.registration}
                    </p>
                  </div>
                </div>

                <div className="vf-van-detail-grid">

                  <div className="vf-van-detail-item">
                    <span>Van ID</span>
                    <strong>
                      #{viewDetails.vanId}
                    </strong>
                  </div>

                  <div className="vf-van-detail-item">
                    <span>Registration</span>
                    <strong>
                      {viewDetails.registration}
                    </strong>
                  </div>

                  <div className="vf-van-detail-item">
                    <span>Make & Model</span>
                    <strong>
                      {viewDetails.makeModel}
                    </strong>
                  </div>

                  <div className="vf-van-detail-item">
                    <span>Passenger Capacity</span>
                    <strong>
                      {viewDetails.capacity} seats
                    </strong>
                  </div>

                  <div className="vf-van-detail-item vf-van-detail-full">
                    <span>Operational Status</span>

                    <strong>
                      <span
                        className={
                          "vf-van-status " +
                          getStatusClass(
                            viewDetails.availabilityStatus
                          )
                        }
                      >
                        <span className="vf-van-status-dot" />
                        {viewDetails.availabilityStatus}
                      </span>
                    </strong>
                  </div>

                </div>

                <div className="vf-van-detail-note">
                  Vehicle status is controlled by
                  the fleet and maintenance workflow.
                </div>
              </>
            )}

          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              onClick={closeViewVan}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* =====================================
          UPDATE - Edit Van Modal
          ===================================== */}

      {editTarget && (
        <Modal
          open
          title={`Edit Vehicle - ${editTarget.registration}`}
          subtitle="Update registration, model and capacity."
          size="md"
          onClose={closeEditVan}
          busy={saving || editLoading}
        >
          <form onSubmit={handleSaveVan}>

            <div className="vfm-body">

              {editError && (
                <div
                  className="vfm-error"
                  role="alert"
                >
                  {editError}
                </div>
              )}

              {editLoading ? (
                <p className="vf-van-detail-loading">
                  Loading current vehicle data...
                </p>
              ) : (
                <div className="vf-van-edit-grid">

                  <div className="vf-van-edit-field">
                    <label htmlFor="edit-registration">
                      Registration Number
                    </label>

                    <input
                      id="edit-registration"
                      data-modal-autofocus
                      type="text"
                      required
                      maxLength={30}
                      value={editForm.registration}
                      disabled={saving}
                      placeholder="ABC123"
                      onChange={(e) =>
                        changeEditField(
                          "registration",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div className="vf-van-edit-field">
                    <label htmlFor="edit-model">
                      Make & Model
                    </label>

                    <input
                      id="edit-model"
                      type="text"
                      required
                      maxLength={120}
                      value={editForm.makeModel}
                      disabled={saving}
                      placeholder="Toyota Hiace"
                      onChange={(e) =>
                        changeEditField(
                          "makeModel",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div className="vf-van-edit-field">
                    <label htmlFor="edit-capacity">
                      Passenger Capacity
                    </label>

                    <input
                      id="edit-capacity"
                      type="number"
                      min="1"
                      max="50"
                      step="1"
                      required
                      value={editForm.capacity}
                      disabled={saving}
                      onChange={(e) =>
                        changeEditField(
                          "capacity",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div className="vf-van-edit-field">
                    <label>
                      Operational Status
                    </label>

                    <div className="vf-van-edit-readonly">
                      {editTarget.availabilityStatus ||
                        "Unknown"}
                    </div>

                    <small>
                      Managed by the Maintenance workflow.
                    </small>
                  </div>

                </div>
              )}

              <div className="vf-van-detail-note">
                Changes will be saved to SQL Server.
                Vehicle availability is not changed
                by editing registration, model or capacity.
              </div>

            </div>

            <div className="vfm-footer">
              <button
                type="button"
                className="vfm-btn vfm-btn-secondary"
                disabled={saving || editLoading}
                onClick={closeEditVan}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="vfm-btn vfm-btn-primary"
                disabled={saving || editLoading}
              >
                {saving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>

          </form>
        </Modal>
      )}

      {/* =====================================
          DELETE - Confirmation Modal
          ===================================== */}

      {deleteTarget && (
        <Modal
          open
          title={`Delete Vehicle - ${deleteTarget.registration}`}
          subtitle="This action cannot be undone."
          size="sm"
          onClose={closeDeleteVan}
          busy={deleting}
        >
          <div className="vfm-body">

            {deleteError && (
              <div
                className="vfm-error"
                role="alert"
              >
                {deleteError}
              </div>
            )}

            <p className="vfm-confirm-message">
              Permanently delete{" "}
              <strong>
                {deleteTarget.registration}
              </strong>
              {" "}({deleteTarget.makeModel})?
            </p>

            <p className="vfm-confirm-message">
              Vehicles with Booking, Journey or
              Maintenance history cannot be deleted.
            </p>

          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              onClick={closeDeleteVan}
              disabled={deleting}
            >
              Go Back
            </button>

            <button
              type="button"
              className="vfm-btn vfm-btn-delete"
              onClick={handleDeleteVan}
              disabled={deleting}
            >
              {deleting
                ? "Deleting..."
                : "Delete Permanently"}
            </button>
          </div>
        </Modal>
      )}

    </>
  );
}
