
import { useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

import DashboardHome from "./DashboardHome";
import BookingApprovals from "./BookingApprovals";
import VanManagement from "./VanManagement";
import DriverAssignment from "./DriverAssignment";
import UserManagement from "./UserManagement";
import AdminCalendar from "./AdminCalendar";
import "../styles/Dashboard.css";

export default function AdminDashboard({
  user,
  onLogout,
  loggingOut,
  logoutError,
}) {
  const [activePage, setActivePage] =
    useState("dashboard");

  function renderPage() {
    switch (activePage) {
      case "bookings":
        return <BookingApprovals />;

      case "vans":
        return <VanManagement />;

      case "drivers":
        return <DriverAssignment />;

      case "users":
        return (
          <UserManagement
            currentUser={user}
          />
        );

      case "dashboard":
      default:
        return (
          <DashboardHome
            onNavigate={setActivePage}
          />
        );
      case "calendar":
  return <AdminCalendar />;
    }
  }

  return (
    <div className="vf-admin">

      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
      />

      <div className="vf-main-area">

        <Header
          user={user}
          activePage={activePage}
          onLogout={onLogout}
          loggingOut={loggingOut}
        />

        <main className="vf-content">
          {logoutError && (
            <p
              className="vf-error-message"
              role="alert"
            >
              {logoutError}
            </p>
          )}

          {renderPage()}
        </main>

      </div>
    </div>
  );
}
