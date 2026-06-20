import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { API_URL } from "../config.js";
import {
  DashboardIcon,
  BuildingIcon,
  LogoutIcon,
  ChevronDownIcon,
  MenuIcon,
  XIcon,
  KeyIcon,
} from "./icons.jsx";

function SidebarLayout() {
  const [user, setUser] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchData = async () => {
      try {
        const [profileRes, orgsRes] = await Promise.all([
          fetch(`${API_URL}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/organizations`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!profileRes.ok) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }

        const profileData = await profileRes.json();
        setUser(profileData.user);

        if (orgsRes.ok) {
          const orgsData = await orgsRes.json();
          setOrgs(orgsData.organizations || []);
        }
      } catch (err) {
        console.error(err);
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, navigate]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spinner rounded-full border-[2.5px] border-accent border-t-transparent" />
          <span className="text-sm text-text-muted">Loading…</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: DashboardIcon },
    { to: "/organizations", label: "Organizations", icon: BuildingIcon },
  ];

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Org Switcher */}
        <div className="border-b border-white/10 p-4">
          <button
            id="org-switcher"
            onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">
              D
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                Project-D
              </p>
              <p className="truncate text-xs text-sidebar-text">
                {orgs.length} organization{orgs.length !== 1 ? "s" : ""}
              </p>
            </div>
            <ChevronDownIcon
              className={`h-4 w-4 shrink-0 text-sidebar-text transition-transform duration-200 ${
                orgDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Org Dropdown */}
          {orgDropdownOpen && (
            <div className="mt-2 animate-scale-in rounded-lg border border-white/10 bg-sidebar-hover p-1">
              {orgs.length === 0 ? (
                <p className="px-3 py-2 text-xs text-sidebar-text">
                  No organizations yet
                </p>
              ) : (
                orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      navigate(`/organizations/${org.id}`);
                      setOrgDropdownOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-sidebar-text transition-colors hover:bg-sidebar-active hover:text-white"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-white">
                      {org.name?.[0]?.toUpperCase() || "?"}
                    </span>
                    <span className="truncate">{org.name}</span>
                    <span className="ml-auto text-xs text-sidebar-text opacity-60">
                      {org.role}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-active text-white"
                    : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                }`
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        {user && (
          <div className="border-t border-white/10 p-3">
            <NavLink
              to="/dashboard"
              end
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-hover"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent-muted">
                {getInitials(user.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-sidebar-text">
                  {user.email}
                </p>
              </div>
            </NavLink>
            <button
              id="logout-btn"
              onClick={handleLogout}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white"
            >
              <LogoutIcon className="h-5 w-5 shrink-0" />
              Log out
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
          <button
            id="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1 text-text-muted hover:bg-bg hover:text-text-primary"
          >
            <MenuIcon />
          </button>
          <span className="text-sm font-semibold text-text-primary">
            Project-D
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet context={{ user, orgs, setOrgs }} />
        </main>
      </div>
    </div>
  );
}

export default SidebarLayout;
