import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_URL, WS_URL } from "../config.js";

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }

        const data = await response.json();
        setUser(data.user);
      } catch (err) {
        console.error(err);
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

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

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-4 text-2xl font-semibold text-gray-900">
            Dashboard
          </h1>
          {user && (
            <div className="mb-6 space-y-1 text-gray-700">
              <p>Welcome, {user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
          >
            Log Out
          </button>
          <Link
            to="/organizations"
            className="text-sm text-blue-600 hover:underline"
          >
            View Organizations
          </Link>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Update Password
            </button>
          </form>
          {passwordError && (
            <p className="mt-2 text-sm text-red-600">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="mt-2 text-sm text-green-600">{passwordSuccess}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
