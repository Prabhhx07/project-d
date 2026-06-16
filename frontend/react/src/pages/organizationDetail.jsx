import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

function OrganizationDetail() {
  const { id } = useParams();
  const [members, setMembers] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [error, setError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const fetchMembers = async () => {
    try {
      const response = await fetch(
        `http://localhost:3000/organizations/${id}/members`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        if (response.status === 403) {
          setError("You don't have access to this organization.");
        } else {
          navigate("/login");
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      setMembers(data.members);
      setCurrentUserRole(data.currentUserRole);
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
    fetchMembers();
  }, [id]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setInviteSuccess("");

    try {
      const response = await fetch(
        `http://localhost:3000/organizations/${id}/invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to invite member");
        return;
      }

      setInviteEmail("");
      setInviteSuccess("Member invited successfully");
      fetchMembers();
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    }
  };

  if (loading) {
    return <p className="p-8 text-gray-600">Loading...</p>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">
            Organization Members
          </h1>
          <Link
            to="/organizations"
            className="text-sm text-blue-600 hover:underline"
          >
            Back to Organizations
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <ul className="space-y-2">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between rounded-md px-3 py-2"
              >
                <div>
                  <p className="text-gray-900">{member.name}</p>
                  <p className="text-xs text-gray-500">{member.email}</p>
                </div>
                <span className="text-xs uppercase text-gray-400">
                  {member.role}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {currentUserRole === "admin" && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-gray-700">
              Invite a member
            </h2>
            <form onSubmit={handleInvite} className="space-y-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Send Invite
              </button>
            </form>
            {inviteSuccess && (
              <p className="mt-2 text-sm text-green-600">{inviteSuccess}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default OrganizationDetail;
