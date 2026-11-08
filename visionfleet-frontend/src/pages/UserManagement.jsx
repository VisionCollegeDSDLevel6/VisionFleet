
import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import "../styles/UserManagement.css";

const API = "/api/users";

const EMPTY = {
  fullName: "",
  email: "",
  role: "Staff",
  canDrive: false,
  licenceNumber: "",
  password: "",
  confirmPassword: "",
};

function normalizeRole(role) {
  const value = String(role || "").toUpperCase();

  if (value === "ADMIN") return "Admin";
  if (value === "DRIVER") return "Driver";
  return "Staff";
}

async function errorMessage(response) {
  if (response.status === 401) {
    return "Please sign in again.";
  }

  if (response.status === 403) {
    return "Admin access required.";
  }

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    if (data.errors) {
      return Object.values(data.errors)
        .flat()
        .join(" ");
    }

    return (
      data.message ||
      data.title ||
      `HTTP ${response.status}`
    );
  } catch {
    return `HTTP ${response.status}`;
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
    const csrf = await fetch(
      "/api/security/csrf-token",
      {
        credentials: "include",
        cache: "no-store",
      }
    );

    if (!csrf.ok) {
      throw new Error(await errorMessage(csrf));
    }

    const data = await csrf.json();

    if (!data.csrfToken) {
      throw new Error("Security token is missing.");
    }

    headers["X-CSRF-TOKEN"] = data.csrfToken;
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
    throw new Error(await errorMessage(response));
  }

  return response.status === 204
    ? {}
    : response.json();
}

export default function UserManagement({
  currentUser,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });

  const [resetPassword, setResetPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [actionError, setActionError] =
    useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
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
          throw new Error("Invalid Users response.");
        }

        if (!controller.signal.aborted) {
          setUsers(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error.message ||
            "Unable to load users."
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
    setRefreshKey((value) => value + 1);
  }

  function closeModal() {
    if (busy) return;

    setModal(null);
    setActionError("");
    setForm({ ...EMPTY });
    setResetPassword("");
    setConfirmPassword("");
  }

  function openCreate() {
    setForm({ ...EMPTY });
    setActionError("");
    setModal({ type: "create" });
  }

  function openEdit(user) {
    setForm({
      ...EMPTY,
      fullName: user.fullName || "",
      email: user.email || "",
      role: normalizeRole(user.role),
      canDrive: Boolean(user.canDrive),
      licenceNumber: user.licenceNumber || "",
    });

    setActionError("");
    setModal({ type: "edit", user });
  }

  function openReset(user) {
    setResetPassword("");
    setConfirmPassword("");
    setActionError("");
    setModal({ type: "reset", user });
  }

  function openDelete(user) {
    setActionError("");
    setModal({ type: "delete", user });
  }

  function changeField(name, value) {
    setForm((previous) => {
      if (name === "role") {
        return {
          ...previous,
          role: value,
          canDrive:
            value === "Driver"
              ? true
              : previous.canDrive,
        };
      }

      return {
        ...previous,
        [name]: value,
      };
    });

    setActionError("");
  }

  async function submitUser(event) {
    event.preventDefault();

    if (busy || !modal) return;

    if (!form.fullName.trim()) {
      return setActionError("Full name is required.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      form.email.trim()
    )) {
      return setActionError("Enter a valid email.");
    }

    if (
      modal.type === "create" &&
      (
        form.password.length < 8 ||
        form.password !== form.confirmPassword
      )
    ) {
      return setActionError(
        "Password must contain at least 8 characters and match."
      );
    }

    const body = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      role: form.role,
      canDrive:
        form.role === "Driver"
          ? true
          : form.canDrive,
      licenceNumber:
        form.licenceNumber.trim() || null,
    };

    if (modal.type === "create") {
      body.password = form.password;
    }

    setBusy(true);
    setActionError("");

    try {
      if (modal.type === "create") {
        await apiRequest(API, "POST", body);

        setNotice(
          `${form.role} account created successfully.`
        );
      } else {
        await apiRequest(
          `${API}/${modal.user.userId}`,
          "PUT",
          body
        );

        setNotice("User updated successfully.");
      }

      setModal(null);
      reload();
    } catch (error) {
      setActionError(
        error.message || "Unable to save user."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event) {
    event.preventDefault();

    if (busy || modal?.type !== "reset") return;

    if (
      resetPassword.length < 8 ||
      resetPassword !== confirmPassword
    ) {
      return setActionError(
        "Passwords must match and contain at least 8 characters."
      );
    }

    setBusy(true);
    setActionError("");

    try {
      await apiRequest(
        `${API}/${modal.user.userId}/password`,
        "PUT",
        {
          newPassword: resetPassword,
        }
      );

      setNotice("Password reset successfully.");
      setModal(null);
    } catch (error) {
      setActionError(
        error.message || "Password reset failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (busy || modal?.type !== "delete") return;

    setBusy(true);
    setActionError("");

    try {
      await apiRequest(
        `${API}/${modal.user.userId}`,
        "DELETE"
      );

      setNotice("User deleted successfully.");
      setModal(null);
      reload();
    } catch (error) {
      setActionError(
        error.message || "Unable to delete user."
      );
    } finally {
      setBusy(false);
    }
  }

  const keyword = search.trim().toLowerCase();

  const filtered = users.filter((user) => {
    const matchesSearch = [
      user.fullName,
      user.email,
      user.userId,
      user.licenceNumber,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(keyword)
    );

    const matchesFilter =
      filter === "ALL" ||
      (
        filter === "CAN_DRIVE"
          ? Boolean(user.canDrive)
          : normalizeRole(user.role).toUpperCase() ===
            filter
      );

    return matchesSearch && matchesFilter;
  });

  const roleCount = (role) =>
    users.filter(
      (user) =>
        normalizeRole(user.role) === role
    ).length;

  return (
    <>
      <div className="vf-users-page">

        <header className="vf-users-header">
          <div>
            <span className="vf-users-eyebrow">
              ACCOUNT MANAGEMENT
            </span>

            <h1>User Management</h1>

            <p>
              Manage Admin, Staff and Driver accounts.
            </p>
          </div>

          <div className="vf-users-header-actions">
            <button
              type="button"
              className="vf-users-btn vf-users-btn-light"
              onClick={reload}
              disabled={loading || busy}
            >
              ↻ Refresh
            </button>

            <button
              type="button"
              className="vf-users-btn vf-users-btn-main"
              onClick={openCreate}
            >
              + Add User
            </button>
          </div>
        </header>

        <section className="vf-users-summary">
          {[
            ["Total users", users.length],
            ["Administrators", roleCount("Admin")],
            ["Staff accounts", roleCount("Staff")],
            ["Driver accounts", roleCount("Driver")],
          ].map(([label, value]) => (
            <article
              key={label}
              className="vf-users-summary-card"
            >
              <span>{label}</span>
              <strong>
                {loading ? "—" : value}
              </strong>
              <small>VisionFleetDB</small>
            </article>
          ))}
        </section>

        {loadError && (
          <div
            className="vf-users-error"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {notice && (
          <div
            className="vf-users-success"
            role="status"
          >
            {notice}
          </div>
        )}

        <section className="vf-users-panel">
          <div className="vf-users-panel-header">
            <div>
              <h2>System users</h2>
              <p>
                Account roles and driving permissions
              </p>
            </div>

            <span className="vf-users-count">
              {filtered.length} user(s)
            </span>
          </div>

          <div className="vf-users-toolbar">
            <div className="vf-users-filter-field vf-users-search-field">
              <label htmlFor="users-search">
                Search users
              </label>

              <input
                id="users-search"
                type="search"
                value={search}
                placeholder="Name, email or User ID..."
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />
            </div>

            <div className="vf-users-filter-field">
              <label htmlFor="users-filter">
                Account type
              </label>

              <select
                id="users-filter"
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value)
                }
              >
                <option value="ALL">
                  All accounts
                </option>

                <option value="ADMIN">
                  Admin
                </option>

                <option value="STAFF">
                  Staff
                </option>

                <option value="DRIVER">
                  Driver
                </option>

                <option value="CAN_DRIVE">
                  Can Drive
                </option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="vf-users-empty">
              Loading users...
            </div>
          ) : loadError ? (
            <div className="vf-users-empty">
              Unable to display users.
            </div>
          ) : filtered.length === 0 ? (
            <div className="vf-users-empty">
              No matching users.
            </div>
          ) : (
            <div className="vf-users-table-scroll">
              <table className="vf-users-table">
                <thead>
                  <tr>
                    <th>USER</th>
                    <th>EMAIL</th>
                    <th>ROLE</th>
                    <th>DRIVING</th>
                    <th>LICENCE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((user) => {
                    const role = normalizeRole(user.role);

                    const isSelf =
                      String(user.userId) ===
                      String(currentUser?.userId);

                    return (
                      <tr key={user.userId}>
                        <td>
                          <div className="vf-users-identity">
                            <span className="vf-users-avatar">
                              {(user.fullName || "U")
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <div>
                              <strong>
                                {user.fullName}
                              </strong>

                              <small>
                                #{user.userId}
                                {isSelf ? " · You" : ""}
                              </small>
                            </div>
                          </div>
                        </td>

                        <td>{user.email}</td>

                        <td>
                          <span
                            className={
                              "vf-users-role " +
                              `vf-users-role-${role.toLowerCase()}`
                            }
                          >
                            {role}
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              user.canDrive
                                ? "vf-users-yes"
                                : "vf-users-no"
                            }
                          >
                            {user.canDrive
                              ? "✓ Allowed"
                              : "Not allowed"}
                          </span>
                        </td>

                        <td>
                          {user.licenceNumber || "—"}
                        </td>

                        <td>
                          <div className="vf-users-actions">
                            <button
                              type="button"
                              className="vf-users-btn vf-users-btn-light"
                              onClick={() => openEdit(user)}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="vf-users-btn vf-users-btn-outline"
                              onClick={() => openReset(user)}
                            >
                              Reset password
                            </button>

                            <button
                              type="button"
                              className="vf-users-btn vf-users-btn-delete"
                              disabled={isSelf}
                              onClick={() => openDelete(user)}
                            >
                              Delete
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
        </section>
      </div>

      {/* =====================================
          CREATE / EDIT USER
          ===================================== */}

      {(modal?.type === "create" ||
        modal?.type === "edit") && (
        <Modal
          open
          size="md"
          busy={busy}
          title={
            modal.type === "create"
              ? "Add New User"
              : `Edit User #${modal.user.userId}`
          }
          onClose={closeModal}
        >
          <form onSubmit={submitUser}>
            <div className="vfm-body">
              {actionError && (
                <div
                  className="vfm-error"
                  role="alert"
                >
                  {actionError}
                </div>
              )}

              <div className="vfm-form-grid">

                <div className="vfm-field vfm-full">
                  <label htmlFor="user-name">
                    Full name
                  </label>

                  <input
                    id="user-name"
                    data-modal-autofocus
                    required
                    maxLength={120}
                    value={form.fullName}
                    disabled={busy}
                    onChange={(event) =>
                      changeField(
                        "fullName",
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="vfm-field vfm-full">
                  <label htmlFor="user-email">
                    Email
                  </label>

                  <input
                    id="user-email"
                    type="email"
                    required
                    value={form.email}
                    disabled={busy}
                    onChange={(event) =>
                      changeField(
                        "email",
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="vfm-field">
                  <label htmlFor="user-role">
                    Role
                  </label>

                  <select
                    id="user-role"
                    value={form.role}
                    disabled={busy}
                    onChange={(event) =>
                      changeField(
                        "role",
                        event.target.value
                      )
                    }
                  >
                    <option value="Admin">Admin</option>
                    <option value="Staff">Staff</option>
                    <option value="Driver">Driver</option>
                  </select>
                </div>

                <div className="vfm-field">
                  <label htmlFor="user-licence">
                    Driver licence
                  </label>

                  <input
                    id="user-licence"
                    maxLength={50}
                    value={form.licenceNumber}
                    disabled={busy}
                    onChange={(event) =>
                      changeField(
                        "licenceNumber",
                        event.target.value
                      )
                    }
                  />
                </div>

                <label className="vf-users-driver-toggle vfm-full">
                  <input
                    type="checkbox"
                    checked={
                      form.role === "Driver" ||
                      form.canDrive
                    }
                    disabled={
                      busy ||
                      form.role === "Driver"
                    }
                    onChange={(event) =>
                      changeField(
                        "canDrive",
                        event.target.checked
                      )
                    }
                  />

                  <span>
                    <strong>
                      Can Drive
                    </strong>

                    <small>
                      Automatically enabled for Driver.
                      Staff may also have permission
                      to book Self Drive.
                    </small>
                  </span>
                </label>

                {modal.type === "create" && (
                  <>
                    <div className="vfm-field">
                      <label htmlFor="user-password">
                        Password
                      </label>

                      <input
                        id="user-password"
                        type="password"
                        minLength={8}
                        required
                        autoComplete="new-password"
                        value={form.password}
                        disabled={busy}
                        onChange={(event) =>
                          changeField(
                            "password",
                            event.target.value
                          )
                        }
                      />
                    </div>

                    <div className="vfm-field">
                      <label htmlFor="user-confirm">
                        Confirm password
                      </label>

                      <input
                        id="user-confirm"
                        type="password"
                        minLength={8}
                        required
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        disabled={busy}
                        onChange={(event) =>
                          changeField(
                            "confirmPassword",
                            event.target.value
                          )
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="vfm-footer">
              <button
                type="button"
                className="vfm-btn vfm-btn-secondary"
                onClick={closeModal}
                disabled={busy}
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
                  : modal.type === "create"
                    ? "Create User"
                    : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================
          RESET PASSWORD
          ===================================== */}

      {modal?.type === "reset" && (
        <Modal
          open
          size="sm"
          busy={busy}
          title={`Reset Password #${modal.user.userId}`}
          onClose={closeModal}
        >
          <form onSubmit={submitReset}>
            <div className="vfm-body">
              {actionError && (
                <div
                  className="vfm-error"
                  role="alert"
                >
                  {actionError}
                </div>
              )}

              <div className="vfm-field">
                <label htmlFor="reset-password">
                  New password
                </label>

                <input
                  id="reset-password"
                  type="password"
                  minLength={8}
                  required
                  value={resetPassword}
                  onChange={(event) =>
                    setResetPassword(event.target.value)
                  }
                />
              </div>

              <div className="vfm-field">
                <label htmlFor="reset-confirm">
                  Confirm password
                </label>

                <input
                  id="reset-confirm"
                  type="password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                />
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
                disabled={busy}
              >
                Reset Password
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================
          DELETE USER
          ===================================== */}

      {modal?.type === "delete" && (
        <Modal
          open
          size="sm"
          busy={busy}
          title={`Delete User #${modal.user.userId}`}
          subtitle="This action cannot be undone."
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

            <p>
              Delete{" "}
              <strong>{modal.user.fullName}</strong>?
            </p>

            <p>
              Accounts with Booking or Journey
              history cannot be permanently deleted.
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
              className="vfm-btn vfm-btn-delete"
              disabled={busy}
              onClick={deleteUser}
            >
              {busy
                ? "Deleting..."
                : "Delete Permanently"}
            </button>
          </div>
        </Modal>
      )}

    </>
  );
}
