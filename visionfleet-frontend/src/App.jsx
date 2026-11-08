
import { useEffect, useState } from "react";

import logo from "./assets/logo.png";

import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import DriverDashboard from "./pages/DriverDashboard";

import {
  getCurrentUser,
  logout,
} from "./services/authService";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const [checkingSession, setCheckingSession] =
    useState(true);

  const [sessionError, setSessionError] =
    useState("");

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const user = await getCurrentUser();

        if (!cancelled) {
          setCurrentUser(user);
        }
      } catch {
        if (!cancelled) {
          setSessionError(
            "Unable to check your session. " +
            "Make sure the Backend is running."
          );
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLogoutError("");
    setLoggingOut(true);

    try {
      await logout();

      setCurrentUser(null);
      setSessionError("");
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Unable to sign out."
      );
    } finally {
      setLoggingOut(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="vf-loading-screen">
        <img src={logo} alt="Vision Fleet" />
        <p>Checking your session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Login
        sessionError={sessionError}
        onLogin={(user) => {
          setCurrentUser(user);
          setSessionError("");
        }}
      />
    );
  }

  const role = String(
    currentUser.role || ""
  ).toUpperCase();

  const sharedProps = {
    user: currentUser,
    onLogout: handleLogout,
    loggingOut,
    logoutError,
  };

  // Admin Workspace
  if (role === "ADMIN") {
    return (
      <AdminDashboard {...sharedProps} />
    );
  }

  // Staff Booking Interface
  if (role === "STAFF") {
    return (
      <StaffDashboard {...sharedProps} />
    );
  }

  // Driver Trips Interface
  if (role === "DRIVER") {
    return (
      <DriverDashboard {...sharedProps} />
    );
  }

  return (
    <div className="vf-other-workspace">
      <img src={logo} alt="Vision Fleet" />

      <h1>Unsupported account role</h1>

      <p>
        Role: {currentUser.role}
      </p>

      {logoutError && (
        <p role="alert">
          {logoutError}
        </p>
      )}

      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
      >
        Sign out
      </button>
    </div>
  );
}
