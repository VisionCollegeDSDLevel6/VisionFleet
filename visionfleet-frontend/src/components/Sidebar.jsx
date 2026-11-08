
import logo from "../assets/logo.png";
import Icon from "./Icon";


export const adminNavigation = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "bookings", label: "Booking Approvals", icon: "booking" },
  { id: "vans", label: "Van Management", icon: "van" },
  {
  id: "drivers",
  label: "Journey Management",
  icon: "driver"
  },
  { id: "users", label: "User Management", icon: "users" },
  { id: "calendar", label: "Calendar / Schedule", icon: "calendar" },
];



export default function Sidebar({
  activePage,
  onNavigate,
}) {
  return (
    <aside className="vf-sidebar">
      <div className="vf-sidebar-upper">

        <div className="vf-brand">
          <img src={logo} alt="Vision Fleet" />
        </div>

        <div className="vf-sidebar-nav">
          <p className="vf-nav-heading">
            MANAGEMENT
          </p>

          <nav aria-label="Admin navigation">
            {adminNavigation.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  "vf-nav-item" +
                  (
                    activePage === item.id
                      ? " vf-nav-active"
                      : ""
                  )
                }
                onClick={() =>
                  onNavigate(item.id)
                }
                aria-current={
                  activePage === item.id
                    ? "page"
                    : undefined
                }
              >
                <Icon
                  name={item.icon}
                  size={19}
                />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

      </div>

      <div className="vf-sidebar-footer">
        <span>VISION COLLEGE</span>
        <small>© 2026 Vision Fleet</small>
      </div>
    </aside>
  );
}
