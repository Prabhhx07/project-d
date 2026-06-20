import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_URL, WS_URL } from "../config.js";

function Organizations() {
  const [orgs, setOrgs] = useState([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const fetchOrgs = async () => {
    try {
      const response = await fetch(`${API_URL}/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        navigate("/login");
        return;
      }

      const data = await response.json();
      setOrgs(data.organizations);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchOrgs();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newOrgName }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create organization");
        return;
      }

      setNewOrgName("");
      fetchOrgs();
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    }
  };

  if (loading) {
    return <p className="p-8 text-gray-600">Loading...</p>;
  }

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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">
            Your Organizations
          </h1>
          <Link
            to="/dashboard"
            className="text-sm text-blue-600 hover:underline"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {orgs.length === 0 ? (
            <p className="text-sm text-gray-500">
              You're not part of any organizations yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    to={`/organizations/${org.id}`}
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-gray-50"
                  >
                    <span className="text-gray-900">{org.name}</span>
                    <span className="text-xs uppercase text-gray-400">
                      {org.role}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            Create a new organization
          </h2>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Organization name"
              required
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default Organizations;
