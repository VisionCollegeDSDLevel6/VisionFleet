
import { useEffect, useState } from "react";
import Icon from "./Icon";
import Modal from "./Modal";

import {
  getMaintenanceRecords,
  applyMaintenancePlan,
  startMaintenance,
  finishMaintenance,
} from "../services/maintenanceService";

export default function MaintenanceWorkspace({
  mode,
  vans = [],
}) {
  const isMaintenance = mode === "maintenance";

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [selectedVan, setSelectedVan] = useState("all");
  const [selectedStatus, setSelectedStatus] =
    useState("all");

  const [showForm, setShowForm] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [acknowledgeImpact, setAcknowledgeImpact] =
    useState(false);

  const [formVanId, setFormVanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [busyAction, setBusyAction] = useState("");

  const isBusy = Boolean(busyAction);

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  // ======================================
  // Load maintenance records
  // ======================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecords() {
      setLoading(true);
      setError("");

      try {
        const data = await getMaintenanceRecords(
          controller.signal
        );

        if (!controller.signal.aborted) {
          setRecords(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load maintenance records."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRecords();

    return () => controller.abort();
  }, [refreshKey]);

  // ======================================
  // Helpers
  // ======================================

  function refreshRecords() {
    setRefreshKey((previous) => previous + 1);
  }

  function clearMessages() {
    setActionError("");
    setSuccessMessage("");
  }

  function openForm() {
    if (isBusy) return;

    clearMessages();
    setFormError("");
    setAcknowledgeImpact(false);
    setShowForm(true);
  }

  function closeForm() {
    if (isBusy) return;

    setShowForm(false);
    setFormError("");
  }

  function openConfirmation(type, record) {
    if (isBusy) return;

    clearMessages();
    setConfirmation({ type, record });
  }

  function closeConfirmation() {
    if (isBusy) return;

    setConfirmation(null);
    setActionError("");
  }

  function resetForm() {
    setFormVanId("");
    setStartDate("");
    setEndDate("");
    setDescription("");
    setFormError("");
    setAcknowledgeImpact(false);
    setShowForm(false);
  }

  function formatDateOnly(value) {
    if (!value) return "—";

    const datePart = String(value).slice(0, 10);
    const parts = datePart.split("-");

    if (parts.length !== 3) return datePart;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function getStatusClass(status) {
    if (status === "DONE") {
      return "vf-van-status-available";
    }

    if (status === "IN_PROGRESS") {
      return "vf-van-status-maintenance";
    }

    return "vf-van-status-other";
  }

  // ======================================
  // Validate Schedule form
  // ======================================

  function validateForm() {
    const vanId = Number(formVanId);

    if (!Number.isInteger(vanId) || vanId <= 0) {
      return "Please select a vehicle.";
    }

    if (!startDate || !endDate) {
      return "Start and end dates are required.";
    }

    if (startDate < todayString) {
      return "Maintenance cannot be scheduled in the past.";
    }

    if (endDate < startDate) {
      return "End date cannot be before start date.";
    }

    if (!description.trim()) {
      return "Please enter a maintenance description.";
    }

    if (description.trim().length > 500) {
      return "Description cannot exceed 500 characters.";
    }

    if (!acknowledgeImpact) {
      return (
        "Please confirm you understand that " +
        "overlapping bookings may be cancelled."
      );
    }

    return "";
  }

  // ======================================
  // Schedule Maintenance
  // ======================================

  async function handleSchedule(event) {
    event.preventDefault();

    if (isBusy) return;

    setFormError("");
    clearMessages();

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setBusyAction("schedule");

    try {
      const result = await applyMaintenancePlan({
        vanId: Number(formVanId),
        startDate,
        endDate,
        description: description.trim(),
        cancellationBookingIds: [],
      });

      const cancelled = result.cancelledCount ?? 0;
      const emailsSent = result.emailsSent ?? 0;
      const emailsFailed = result.emailsFailed ?? 0;

      resetForm();

      let message =
        `Maintenance #${result.maintenanceId} scheduled. ` +
        `${cancelled} overlapping booking(s) cancelled.`;

      if (cancelled > 0) {
        message +=
          ` ${emailsSent} notification email(s) sent.`;
      }

      if (emailsFailed > 0) {
        message +=
          ` Warning: ${emailsFailed} email(s) failed. ` +
          "The bookings were still cancelled.";
      }

      setSuccessMessage(message);
      refreshRecords();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Unable to schedule maintenance."
      );
    } finally {
      setBusyAction("");
    }
  }

  // ======================================
  // Start Maintenance
  // ======================================

  async function handleStart(record) {
    if (isBusy) return;

    clearMessages();
    setBusyAction(`start-${record.maintenanceId}`);

    try {
      const result = await startMaintenance(
        record.maintenanceId
      );

      setConfirmation(null);

      setSuccessMessage(
        `Maintenance #${record.maintenanceId} started. ` +
        `Vehicle status: ${result.vanStatus}.`
      );

      refreshRecords();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Unable to start maintenance."
      );
    } finally {
      setBusyAction("");
    }
  }

  // ======================================
  // Finish Maintenance
  // ======================================

  async function handleFinish(record) {
    if (isBusy) return;

    clearMessages();
    setBusyAction(`finish-${record.maintenanceId}`);

    try {
      const result = await finishMaintenance(
        record.maintenanceId
      );

      setConfirmation(null);

      setSuccessMessage(
        `Maintenance #${record.maintenanceId} completed. ` +
        `Vehicle status: ${result.vanStatus}.`
      );

      refreshRecords();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Unable to finish maintenance."
      );
    } finally {
      setBusyAction("");
    }
  }

  // ======================================
  // Filters
  // ======================================

  const relevantRecords = isMaintenance
    ? records.filter(
        (record) =>
          record.status === "SCHEDULED" ||
          record.status === "IN_PROGRESS"
      )
    : records;

  const filteredRecords = relevantRecords.filter(
    (record) => {
      const keyword = search.trim().toLowerCase();

      const matchesSearch =
        (record.registration || "")
          .toLowerCase()
          .includes(keyword) ||
        (record.makeModel || "")
          .toLowerCase()
          .includes(keyword) ||
        (record.description || "")
          .toLowerCase()
          .includes(keyword);

      const matchesVan =
        selectedVan === "all" ||
        String(record.vanId) === selectedVan;

      const matchesStatus =
        isMaintenance ||
        selectedStatus === "all" ||
        record.status === selectedStatus;

      return (
        matchesSearch &&
        matchesVan &&
        matchesStatus
      );
    }
  );

  const statuses = [
    ...new Set(records.map((r) => r.status)),
  ].filter(Boolean);

  // ======================================
  // Render
  // ======================================

  return (
    <>
      {/* Maintenance header */}

      {isMaintenance && (
        <div className="vf-van-page-header">
          <div>
            <h2>Maintenance management</h2>

            <p>
              Schedule maintenance and manage vehicle
              availability.
            </p>
          </div>

          <button
            type="button"
            className="vf-addvan-trigger"
            disabled={isBusy}
            onClick={openForm}
            aria-haspopup="dialog"
            aria-expanded={showForm}
          >
            + Schedule Maintenance
          </button>
        </div>
      )}

      {/* Messages */}

      {successMessage && (
        <div
          className="vf-addvan-success"
          role="status"
        >
          {successMessage}
        </div>
      )}

      {actionError && !confirmation && (
        <div
          className="vf-van-error"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {/* ===================================
          Schedule Maintenance Modal
          =================================== */}

      {isMaintenance && showForm && (
        <Modal
          open
          title="Schedule Maintenance"
          subtitle="Plan vehicle servicing and manage its impact on existing bookings."
          size="md"
          onClose={closeForm}
          busy={isBusy}
        >
          <form
            className="vf-maintenance-form"
            onSubmit={handleSchedule}
          >
            <div className="vfm-body">

              {formError && (
                <div
                  className="vfm-error"
                  role="alert"
                >
                  {formError}
                </div>
              )}

              <div className="vfm-form-grid">

                <div className="vfm-field vfm-full">
                  <label htmlFor="maintenance-vehicle">
                    Vehicle
                  </label>

                  <select
                    id="maintenance-vehicle"
                    data-modal-autofocus
                    value={formVanId}
                    required
                    disabled={isBusy}
                    onChange={(event) =>
                      setFormVanId(event.target.value)
                    }
                  >
                    <option value="">
                      Select vehicle
                    </option>

                    {vans.map((van) => (
                      <option
                        key={van.vanId}
                        value={van.vanId}
                      >
                        {van.registration} — {van.makeModel}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="vfm-field">
                  <label htmlFor="maintenance-start">
                    Start date
                  </label>

                  <input
                    id="maintenance-start"
                    type="date"
                    min={todayString}
                    value={startDate}
                    required
                    disabled={isBusy}
                    onChange={(event) => {
                      const value = event.target.value;

                      setStartDate(value);

                      if (endDate && endDate < value) {
                        setEndDate(value);
                      }
                    }}
                  />
                </div>

                <div className="vfm-field">
                  <label htmlFor="maintenance-end">
                    End date
                  </label>

                  <input
                    id="maintenance-end"
                    type="date"
                    min={startDate || todayString}
                    value={endDate}
                    required
                    disabled={isBusy}
                    onChange={(event) =>
                      setEndDate(event.target.value)
                    }
                  />
                </div>

                <div className="vfm-field vfm-full">
                  <label htmlFor="maintenance-description">
                    Maintenance description
                  </label>

                  <textarea
                    id="maintenance-description"
                    value={description}
                    maxLength={500}
                    rows={3}
                    placeholder="e.g. Routine service, brakes inspection, oil change..."
                    required
                    disabled={isBusy}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                  />

                  <small>
                    {description.length}/500 characters
                  </small>
                </div>

              </div>

              {/* Booking cancellation warning */}

              <div className="vf-maintenance-impact">
                <strong>Booking impact</strong>

                <p>
                  Scheduling maintenance takes priority
                  over overlapping bookings. The backend
                  may automatically cancel affected
                  bookings and notify requesters by email.
                </p>

                <label className="vf-maintenance-acknowledge">
                  <input
                    type="checkbox"
                    checked={acknowledgeImpact}
                    disabled={isBusy}
                    onChange={(event) =>
                      setAcknowledgeImpact(
                        event.target.checked
                      )
                    }
                  />

                  <span>
                    I understand that overlapping bookings
                    may be cancelled.
                  </span>
                </label>
              </div>

            </div>

            <div className="vfm-footer">
              <button
                type="button"
                className="vfm-btn vfm-btn-secondary"
                onClick={closeForm}
                disabled={isBusy}
              >
                Close
              </button>

              <button
                type="submit"
                className="vfm-btn vfm-btn-primary"
                disabled={isBusy || vans.length === 0}
              >
                {busyAction === "schedule"
                  ? "Scheduling..."
                  : "Schedule Maintenance"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===================================
          Maintenance Table
          =================================== */}

      <section className="vf-van-panel">

        <div className="vf-van-panel-header">
          <div>
            <h2>
              {isMaintenance
                ? "Scheduled & ongoing maintenance"
                : "Maintenance records"}
            </h2>

            <p>
              {isMaintenance
                ? "Manage upcoming and active maintenance."
                : "Review maintenance history."}
            </p>
          </div>

          <button
            type="button"
            className="vf-van-refresh"
            disabled={loading || isBusy}
            onClick={refreshRecords}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Search / Filter */}

        <div className="vf-van-toolbar">

          <div className="vf-van-search">
            <label htmlFor={`maintenance-search-${mode}`}>
              Search
            </label>

            <input
              id={`maintenance-search-${mode}`}
              type="search"
              placeholder="Registration or description..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <div className="vf-van-filter">
            <label htmlFor={`maintenance-van-${mode}`}>
              Vehicle
            </label>

            <select
              id={`maintenance-van-${mode}`}
              value={selectedVan}
              onChange={(event) =>
                setSelectedVan(event.target.value)
              }
            >
              <option value="all">
                All vehicles
              </option>

              {vans.map((van) => (
                <option
                  key={van.vanId}
                  value={String(van.vanId)}
                >
                  {van.registration}
                </option>
              ))}
            </select>
          </div>

          {!isMaintenance && (
            <div className="vf-van-filter">
              <label htmlFor="maintenance-status-filter">
                Status
              </label>

              <select
                id="maintenance-status-filter"
                value={selectedStatus}
                onChange={(event) =>
                  setSelectedStatus(event.target.value)
                }
              >
                <option value="all">
                  All statuses
                </option>

                {statuses.map((status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          )}

        </div>

        {/* Loading / Error */}

        {error && (
          <div
            className="vf-van-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading && !error && (
          <div className="vf-van-loading">
            Loading maintenance records...
          </div>
        )}

        {/* Maintenance records */}

        {!loading && !error && (
          filteredRecords.length > 0 ? (
            <div className="vf-van-table-scroll">

              <table className="vf-van-table">
                <thead>
                  <tr>
                    <th>VEHICLE</th>
                    <th>START DATE</th>
                    <th>END DATE</th>
                    <th>DESCRIPTION</th>
                    <th>STATUS</th>

                    {isMaintenance && (
                      <th>ACTIONS</th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.maintenanceId}>

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
                              {record.registration}
                            </strong>

                            <small>
                              {record.makeModel}
                            </small>
                          </div>

                        </div>
                      </td>

                      <td data-label="Start date">
                        {formatDateOnly(
                          record.scheduledDate
                        )}
                      </td>

                      <td data-label="End date">
                        {formatDateOnly(
                          record.plannedEndDate ||
                          record.scheduledDate
                        )}
                      </td>

                      <td data-label="Description">
                        {record.description}
                      </td>

                      <td data-label="Status">
                        <span
                          className={
                            "vf-van-status " +
                            getStatusClass(record.status)
                          }
                        >
                          <span className="vf-van-status-dot" />

                          {record.status.replaceAll(
                            "_",
                            " "
                          )}
                        </span>
                      </td>

                      {/* Start / Finish actions */}

                      {isMaintenance && (
                        <td data-label="Actions">

                          {record.status === "SCHEDULED" && (
                            <button
                              type="button"
                              className="vf-addvan-trigger"
                              disabled={
                                isBusy ||
                                formatDateOnly(
                                  record.scheduledDate
                                ) === "—" ||
                                String(
                                  record.scheduledDate
                                ).slice(0, 10) > todayString
                              }
                              onClick={() =>
                                openConfirmation(
                                  "start",
                                  record
                                )
                              }
                            >
                              {busyAction ===
                                `start-${record.maintenanceId}`
                                ? "Starting..."
                                : "Start"}
                            </button>
                          )}

                          {record.status === "IN_PROGRESS" && (
                            <button
                              type="button"
                              className="vf-addvan-trigger"
                              disabled={isBusy}
                              onClick={() =>
                                openConfirmation(
                                  "finish",
                                  record
                                )
                              }
                            >
                              {busyAction ===
                                `finish-${record.maintenanceId}`
                                ? "Finishing..."
                                : "Finish"}
                            </button>
                          )}

                        </td>
                      )}

                    </tr>
                  ))}
                </tbody>
              </table>

            </div>
          ) : (
            <div className="vf-van-empty">
              <h3>No maintenance records found</h3>

              <p>
                Try changing your search or filters.
              </p>
            </div>
          )
        )}

        <div className="vf-van-panel-footer">
          <span>
            Maintenance data from VisionFleetDB
          </span>

          <span>
            {!loading && !error
              ? `${filteredRecords.length} of ${relevantRecords.length} shown`
              : "—"}
          </span>
        </div>

      </section>

      {/* ===================================
          Start / Finish Confirmation Modal
          =================================== */}

      {confirmation && (
        <Modal
          open
          title={
            confirmation.type === "start"
              ? `Start Maintenance #${confirmation.record.maintenanceId}`
              : `Finish Maintenance #${confirmation.record.maintenanceId}`
          }
          subtitle={
            confirmation.type === "start"
              ? "Confirm that this vehicle is ready to enter maintenance."
              : "Confirm that the work has been completed."
          }
          size="sm"
          onClose={closeConfirmation}
          busy={isBusy}
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

            <div className="vf-maintenance-confirm-details">
              <p>
                <strong>Vehicle:</strong>{" "}
                {confirmation.record.registration}
                {" — "}
                {confirmation.record.makeModel}
              </p>

              <p>
                <strong>Maintenance period:</strong>{" "}
                {formatDateOnly(
                  confirmation.record.scheduledDate
                )}
                {" — "}
                {formatDateOnly(
                  confirmation.record.plannedEndDate ||
                  confirmation.record.scheduledDate
                )}
              </p>

              <p>
                <strong>Task:</strong>{" "}
                {confirmation.record.description}
              </p>
            </div>

            <p className="vfm-confirm-message">
              {confirmation.type === "start"
                ? "The vehicle will be marked as in maintenance. Proceed?"
                : "The maintenance record will be completed and the vehicle status updated by the server. Proceed?"}
            </p>

          </div>

          <div className="vfm-footer">
            <button
              type="button"
              className="vfm-btn vfm-btn-secondary"
              onClick={closeConfirmation}
              disabled={isBusy}
            >
              Go Back
            </button>

            <button
              type="button"
              className="vfm-btn vfm-btn-primary"
              data-modal-autofocus
              disabled={isBusy}
              onClick={() => {
                if (confirmation.type === "start") {
                  handleStart(confirmation.record);
                } else {
                  handleFinish(confirmation.record);
                }
              }}
            >
              {isBusy
                ? "Processing..."
                : confirmation.type === "start"
                  ? "Start Maintenance"
                  : "Finish Maintenance"}
            </button>
          </div>

        </Modal>
      )}
    </>
  );
}
