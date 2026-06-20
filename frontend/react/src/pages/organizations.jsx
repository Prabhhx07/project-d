import { useState, useEffect } from "react";
import { useNavigate, Link, useOutletContext } from "react-router-dom";
import { API_URL } from "../config.js";
import { PlusIcon, BuildingIcon, ChevronDownIcon } from "../components/icons.jsx";

function Organizations() {
  const { orgs, setOrgs } = useOutletContext();
  const [newOrgName, setNewOrgName] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
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
      setOrgs(data.organizations || []);
    } catch (err) {
      console.error(err);
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
    setCreating(true);

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
      setShowCreate(false);
      fetchOrgs();
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const getRoleBadge = (role) => {
    const classes = {
      admin: "badge-admin",
      editor: "badge-editor",
      viewer: "badge-viewer",
    };
    return <span className={classes[role] || "badge-viewer"}>{role}</span>;
  };

  return (
    <div className="animate-fade-in p-6 lg:p-10">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Organizations
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Manage your workspaces and team access
            </p>
          </div>
          <button
            id="create-org-btn"
            onClick={() => setShowCreate(!showCreate)}
            className="btn-primary"
          >
            <PlusIcon className="h-4 w-4" />
            New Organization
          </button>
        </div>

        {/* Create form (collapsible) */}
        {showCreate && (
          <div className="card mb-6 animate-slide-up p-6">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              Create a new organization
            </h2>
            <form onSubmit={handleCreate} className="flex gap-3">
              <div className="flex-1">
                <input
                  id="new-org-name"
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name"
                  required
                  className="input-field"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary shrink-0"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setError("");
                }}
                className="btn-secondary shrink-0"
              >
                Cancel
              </button>
            </form>
            {error && (
              <div className="mt-3 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Organizations list */}
        {orgs.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg text-text-faint">
              <BuildingIcon className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">
              No organizations yet
            </h3>
            <p className="mt-1 max-w-xs text-sm text-text-muted">
              Create your first organization to start managing files and
              collaborating with your team.
            </p>
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary mt-5"
              >
                <PlusIcon className="h-4 w-4" />
                Create Organization
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {orgs.map((org, index) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="card group flex items-center gap-4 p-5 transition-all hover:shadow-md hover:border-accent/20"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-light text-sm font-bold text-accent transition-transform group-hover:scale-105">
                  {org.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                    {org.name}
                  </h3>
                </div>
                {getRoleBadge(org.role)}
                <svg
                  className="h-5 w-5 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Organizations;
