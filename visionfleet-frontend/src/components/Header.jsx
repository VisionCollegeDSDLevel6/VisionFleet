import Icon from "./Icon";
import { adminNavigation } from "./Sidebar";

export default function Header({ user, activePage, onLogout, loggingOut }) {
  const initials = (user.fullName || "Admin")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const currentPage = adminNavigation.find((item) => item.id === activePage);

  return (
    <header className="vf-topbar">
      <div className="vf-breadcrumb">
        <span>Admin</span>
        <Icon name="chevron" size={14} />
        <strong>{currentPage?.label || "Dashboard"}</strong>
      </div>

      <div className="vf-topbar-right">
        <div className="vf-user-profile">
          <span className="vf-avatar">{initials}</span>
          <div className="vf-user-details">
            <strong>{user.fullName || "Administrator"}</strong>
            <span>Administrator</span>
          </div>
        </div>

        <button
          type="button"
          className="vf-logout-button"
          onClick={onLogout}
          disabled={loggingOut}
        >
          <Icon name="logout" size={17} />
          <span>{loggingOut ? "Signing out..." : "Sign out"}</span>
        </button>
      </div>
    </header>
  );
}
