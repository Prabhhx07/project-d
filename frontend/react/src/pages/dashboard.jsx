import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { API_URL } from "../config.js";
import { BuildingIcon, FolderIcon, KeyIcon } from "../components/icons.jsx";

function Dashboard() {
  const { user } = useOutletContext();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [stats, setStats] = useState({ orgCount: 0, fileCount: 0 });
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const orgsRes = await fetch(`${API_URL}/organizations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json();
          const organizations = orgsData.organizations || [];
          let totalFiles = 0;

          for (const org of organizations) {
            try {
              const filesRes = await fetch(
                `${API_URL}/organizations/${org.id}/files`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              if (filesRes.ok) {
                const filesData = await filesRes.json();
                totalFiles += (filesData.files || []).length;
              }
            } catch {}
          }

          setStats({ orgCount: organizations.length, fileCount: totalFiles });
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchStats();
  }, [token]);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    try {
      const response = await fetch(`${API_URL}/profile/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setPasswordSuccess("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(err.message);
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="animate-fade-in p-6 lg:p-10">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Welcome card */}
        <div className="card p-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">
                {getGreeting()}, {user?.name?.split(" ")[0] || "there"} 👋
              </h1>
              <p className="mt-1 text-text-muted">
                Here's what's happening across your workspaces.
              </p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => navigate("/organizations")}
            className="card group flex items-center gap-4 p-6 text-left transition-all hover:shadow-md hover:border-accent/20"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent transition-transform group-hover:scale-105">
              <BuildingIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary tracking-tight">
                {stats.orgCount}
              </p>
              <p className="text-sm text-text-muted">Organizations</p>
            </div>
          </button>

          <div className="card flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success-light text-success">
              <FolderIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary tracking-tight">
                {stats.fileCount}
              </p>
              <p className="text-sm text-text-muted">Total Files</p>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="card p-6">
          <div className="mb-5 flex items-center gap-2">
            <KeyIcon className="h-5 w-5 text-text-muted" />
            <h2 className="text-base font-semibold text-text-primary">
              Change Password
            </h2>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label
                htmlFor="current-password"
                className="mb-1.5 block text-sm font-medium text-text-secondary"
              >
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input-field max-w-sm"
              />
            </div>
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 block text-sm font-medium text-text-secondary"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                className="input-field max-w-sm"
              />
            </div>

            {passwordError && (
              <div className="rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="rounded-lg bg-success-light px-4 py-3 text-sm text-success">
                {passwordSuccess}
              </div>
            )}

            <button type="submit" className="btn-primary">
              Update Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
