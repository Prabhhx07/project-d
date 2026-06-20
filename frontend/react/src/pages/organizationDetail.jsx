import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { API_URL, WS_URL } from "../config.js";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusBadge(status) {
  const styles = {
    pending: "bg-gray-100 text-gray-700",
    processing: "bg-blue-100 text-blue-700",
    done: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}

function OrganizationDetail() {
  const { id } = useParams();
  const [members, setMembers] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [files, setFiles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    const socket = new WebSocket(`${WS_URL}?token=${token}&orgId=${id}`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "file-status") {
        setFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.id === data.fileId ? { ...file, status: data.status } : file,
          ),
        );
      }
    };

    return () => {
      socket.close();
    };
  }, [id, token]);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchMembers();
    fetchFiles();
  }, [id]);

  useEffect(() => {
    if (currentUserRole === "admin") {
      fetchAuditLogs();
    }
  }, [currentUserRole]);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_URL}/organizations/${id}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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

  const fetchFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/organizations/${id}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const data = await response.json();
      setFiles(data.files);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await fetch(
        `${API_URL}/organizations/${id}/audit-logs`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setInviteSuccess("");

    setInviting(true);

    try {
      const response = await fetch(`${API_URL}/organizations/${id}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

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
    } finally {
      setInviting(false);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    setUploadError("");
    setUploadSuccess("");

    if (!selectedFile) {
      setUploadError("Please select a file");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`${API_URL}/organizations/${id}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setUploadError(data.error || "Upload failed");
        return;
      }

      setSelectedFile(null);
      setUploadSuccess("File uploaded successfully");
      fetchFiles();
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      setUploadError("Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      const response = await fetch(`${API_URL}/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setError("Failed to download file");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while downloading.");
    }
  };

  async function handleDeleteFile(fileId) {
    if (!window.confirm("Delete this file? This cannot be undone.")) return;

    try {
      const response = await fetch(
        `${API_URL}/organizations/${id}/files/${fileId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete file");
      }

      setFiles((prevFiles) => prevFiles.filter((file) => file.id !== fileId));
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      alert("Failed to delete file.");
    }
  }

  async function handleDeleteOrg() {
    if (
      !window.confirm(
        "Delete this entire organization? This will permanently delete all members and files. This cannot be undone.",
      )
    )
      return;

    try {
      const response = await fetch(`${API_URL}/organizations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to delete organization");
      }

      navigate("/organizations");
    } catch (err) {
      console.error(err);
      alert("Failed to delete organization.");
    }
  }

  async function handleRemoveMember(memberId) {
    if (!window.confirm("Remove this member from the organization?")) return;

    try {
      const response = await fetch(
        `${API_URL}/organizations/${id}/members/${memberId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove member");
      }

      setMembers((prevMembers) =>
        prevMembers.filter((member) => member.id !== memberId),
      );
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  async function handleChangeRole(memberId, newRole) {
    try {
      const response = await fetch(
        `${API_URL}/organizations/${id}/members/${memberId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ role: newRole }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update role");
      }

      setMembers((prevMembers) =>
        prevMembers.map((member) =>
          member.id === memberId ? { ...member, role: newRole } : member,
        ),
      );
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const canUpload = currentUserRole === "admin" || currentUserRole === "editor";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Organization</h1>
          <Link
            to="/organizations"
            className="text-sm text-blue-600 hover:underline"
          >
            Back to Organizations
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-700">Members</h2>
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

                <div className="flex items-center gap-3">
                  {currentUserRole === "admin" ? (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleChangeRole(member.id, e.target.value)
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-xs uppercase text-gray-600"
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className="text-xs uppercase text-gray-400">
                      {member.role}
                    </span>
                  )}
                  {currentUserRole === "admin" && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {currentUserRole === "admin" && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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
                disabled={submitting}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "inviting" : "invite"}
              </button>
            </form>
            {inviteSuccess && (
              <p className="mt-2 text-sm text-green-600">{inviteSuccess}</p>
            )}
          </div>
        )}

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-700">Files</h2>
          {files.length === 0 ? (
            <p className="text-sm text-gray-500">No files uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between rounded-md px-3 py-2"
                >
                  <div>
                    <p className="text-gray-900">{file.original_name}</p>
                    <p className="text-xs text-gray-500">
                      {formatBytes(file.size)} · uploaded by{" "}
                      {file.uploaded_by_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(file.status)}
                    <button
                      onClick={() =>
                        handleDownload(file.id, file.original_name)
                      }
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Download
                    </button>
                    {canUpload && (
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canUpload && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-gray-700">
              Upload a file
            </h2>
            <form onSubmit={handleFileUpload} className="space-y-3">
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                className="block w-full text-sm text-gray-700"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "uploading" : "upload"}
              </button>
            </form>
            {uploadError && (
              <p className="mt-2 text-sm text-red-600">{uploadError}</p>
            )}
            {uploadSuccess && (
              <p className="mt-2 text-sm text-green-600">{uploadSuccess}</p>
            )}
          </div>
        )}

        {currentUserRole === "admin" && auditLogs.length > 0 && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-gray-700">
              Audit Log
            </h2>
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-gray-800">
                      {log.performed_by || "Unknown"}
                    </span>
                    <span className="mx-1 text-gray-500">·</span>
                    <span className="text-gray-600">{log.action}</span>
                    {log.metadata?.filename && (
                      <span className="ml-1 text-gray-500">
                        ({log.metadata.filename})
                      </span>
                    )}
                    {log.metadata?.from && (
                      <span className="ml-1 text-gray-500">
                        ({log.metadata.from} → {log.metadata.to})
                      </span>
                    )}
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentUserRole === "admin" && (
          <div className="mb-6 rounded-lg border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-red-700">
              Danger Zone
            </h2>
            <p className="mb-3 text-sm text-gray-500">
              Deleting this organization will permanently remove all members and
              files.
            </p>
            <button
              onClick={handleDeleteOrg}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete Organization
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OrganizationDetail;
