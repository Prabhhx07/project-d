import { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { API_URL, WS_URL } from "../config.js";
import {
  UsersIcon,
  FolderIcon,
  AuditIcon,
  SettingsIcon,
  TrashIcon,
  DownloadIcon,
  PlusIcon,
  DocumentIcon,
  UploadIcon,
} from "../components/icons.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import FileDropZone from "../components/FileDropZone.jsx";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(filename) {
  return filename?.split(".").pop()?.toUpperCase() || "FILE";
}

function StatusBadge({ status }) {
  const classes = {
    pending: "badge-pending",
    processing: "badge-processing",
    done: "badge-done",
    failed: "badge-failed",
  };
  return <span className={classes[status] || classes.pending}>{status}</span>;
}

function RoleBadge({ role }) {
  const classes = {
    admin: "badge-admin",
    editor: "badge-editor",
    viewer: "badge-viewer",
  };
  return <span className={classes[role] || classes.viewer}>{role}</span>;
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const TABS = [
  { id: "members", label: "Members", icon: UsersIcon },
  { id: "files", label: "Files", icon: FolderIcon },
  { id: "audit", label: "Audit Log", icon: AuditIcon, adminOnly: true },
  { id: "settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
];

function OrganizationDetail() {
  const { id } = useParams();
  const { orgs } = useOutletContext();
  const [activeTab, setActiveTab] = useState("members");
  const [members, setMembers] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [files, setFiles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const orgName =
    orgs.find((o) => String(o.id) === String(id))?.name || "Organization";

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  // Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  // Modal state
  const [modal, setModal] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // WebSocket for file status updates
  useEffect(() => {
    const socket = new WebSocket(`${WS_URL}?token=${token}&orgId=${id}`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "file-status") {
        setFiles((prev) =>
          prev.map((file) =>
            file.id === data.fileId ? { ...file, status: data.status } : file,
          ),
        );
      }
    };

    return () => socket.close();
  }, [id, token]);

  // Fetch data
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
    setInviteError("");
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
        setInviteError(data.error || "Failed to invite member");
        return;
      }

      setInviteEmail("");
      setInviteSuccess("Member invited successfully");
      fetchMembers();
    } catch (err) {
      console.error(err);
      setInviteError("Something went wrong. Please try again.");
    } finally {
      setInviting(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setUploadError("");
    setUploadSuccess("");
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
      if (currentUserRole === "admin") fetchAuditLogs();
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
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      const response = await fetch(
        `${API_URL}/organizations/${id}/files/${fileId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) throw new Error("Failed to delete file");

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      if (currentUserRole === "admin") fetchAuditLogs();
    } catch (err) {
      console.error(err);
    } finally {
      setModal(null);
    }
  };

  const handleDeleteOrg = async () => {
    try {
      const response = await fetch(`${API_URL}/organizations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to delete organization");
      navigate("/organizations");
    } catch (err) {
      console.error(err);
    } finally {
      setModal(null);
    }
  };

  const handleRemoveMember = async (memberId) => {
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

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      if (currentUserRole === "admin") fetchAuditLogs();
    } catch (err) {
      console.error(err);
    } finally {
      setModal(null);
    }
  };

  const handleChangeRole = async (memberId, newRole) => {
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

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
      );
      if (currentUserRole === "admin") fetchAuditLogs();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spinner rounded-full border-[2.5px] border-accent border-t-transparent" />
          <span className="text-sm text-text-muted">Loading…</span>
        </div>
      </div>
    );
  }

  const canUpload = currentUserRole === "admin" || currentUserRole === "editor";
  const isAdmin = currentUserRole === "admin";

  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <div className="animate-fade-in p-6 lg:p-10">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Organization
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage members, files, and settings
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 border-b border-border">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Members Tab ──────────────────────────────── */}
        {activeTab === "members" && (
          <div className="animate-fade-in space-y-6">
            {/* Invite form (admin only) */}
            {isAdmin && (
              <div className="card p-6">
                <h3 className="mb-4 text-base font-semibold text-text-primary">
                  Invite a member
                </h3>
                <form onSubmit={handleInvite} className="flex flex-wrap gap-3">
                  <div className="min-w-0 flex-1">
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      required
                      className="input-field"
                    />
                  </div>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="select-field w-auto"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="btn-primary shrink-0"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {inviting ? "Inviting…" : "Invite"}
                  </button>
                </form>
                {inviteError && (
                  <div className="mt-3 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="mt-3 rounded-lg bg-success-light px-4 py-3 text-sm text-success">
                    {inviteSuccess}
                  </div>
                )}
              </div>
            )}

            {/* Members list */}
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="card flex items-center gap-4 px-5 py-4 transition-all hover:shadow-md"
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light text-sm font-semibold text-accent">
                    {getInitials(member.name)}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {member.name}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {member.email}
                    </p>
                  </div>

                  {/* Role */}
                  <div className="flex items-center gap-3">
                    {isAdmin ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleChangeRole(member.id, e.target.value)
                        }
                        className="select-field w-auto py-1 text-xs"
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                    {isAdmin && (
                      <button
                        onClick={() =>
                          setModal({
                            type: "removeMember",
                            member,
                          })
                        }
                        className="rounded-lg p-1.5 text-text-faint hover:bg-danger-light hover:text-danger transition-colors"
                        title="Remove member"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Files Tab ────────────────────────────────── */}
        {activeTab === "files" && (
          <div className="animate-fade-in space-y-6">
            {/* Upload zone */}
            {canUpload && (
              <div className="card p-6">
                <h3 className="mb-4 text-base font-semibold text-text-primary">
                  Upload a file
                </h3>
                <FileDropZone
                  onFileSelect={(file) => setSelectedFile(file)}
                  uploading={uploading}
                  disabled={uploading}
                />
                {selectedFile && !uploading && (
                  <button
                    onClick={handleFileUpload}
                    className="btn-primary mt-4"
                  >
                    <UploadIcon className="h-4 w-4" />
                    Upload File
                  </button>
                )}
                {uploadError && (
                  <div className="mt-3 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
                    {uploadError}
                  </div>
                )}
                {uploadSuccess && (
                  <div className="mt-3 rounded-lg bg-success-light px-4 py-3 text-sm text-success">
                    {uploadSuccess}
                  </div>
                )}
              </div>
            )}

            {/* Files table */}
            {files.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg text-text-faint">
                  <FolderIcon className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">
                  No files yet
                </h3>
                <p className="mt-1 max-w-xs text-sm text-text-muted">
                  {canUpload
                    ? "Upload your first file using the drop zone above."
                    : "No files have been uploaded to this organization yet."}
                </p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-bg/50">
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Name
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Type
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Size
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Status
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Uploaded by
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {files.map((file) => (
                        <tr
                          key={file.id}
                          className="transition-colors hover:bg-bg/40"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                                <DocumentIcon className="h-4 w-4" />
                              </div>
                              <span className="text-sm font-medium text-text-primary">
                                {file.original_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-block rounded bg-bg px-2 py-0.5 font-mono text-xs text-text-muted">
                              {getFileExtension(file.original_name)}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-mono text-sm text-text-muted">
                            {formatBytes(file.size)}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={file.status} />
                          </td>
                          <td className="px-5 py-4 text-sm text-text-muted">
                            {file.uploaded_by_name}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() =>
                                  handleDownload(file.id, file.original_name)
                                }
                                className="btn-ghost py-1.5 px-2 text-xs"
                                title="Download"
                              >
                                <DownloadIcon className="h-4 w-4" />
                              </button>
                              {canUpload && (
                                <button
                                  onClick={() =>
                                    setModal({
                                      type: "deleteFile",
                                      file,
                                    })
                                  }
                                  className="rounded-md p-1.5 text-text-faint hover:bg-danger-light hover:text-danger transition-colors"
                                  title="Delete file"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Audit Log Tab ────────────────────────────── */}
        {activeTab === "audit" && isAdmin && (
          <div className="animate-fade-in">
            {auditLogs.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg text-text-faint">
                  <AuditIcon className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">
                  No activity yet
                </h3>
                <p className="mt-1 max-w-xs text-sm text-text-muted">
                  Actions performed in this organization will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="card flex items-start gap-4 px-5 py-4"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-faint">
                      <AuditIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">
                        <span className="font-medium">
                          {log.performed_by || "Unknown"}
                        </span>{" "}
                        <span className="text-text-muted">{log.action}</span>
                        {log.metadata?.filename && (
                          <span className="ml-1 text-text-muted">
                            — {log.metadata.filename}
                          </span>
                        )}
                        {log.metadata?.from && (
                          <span className="ml-1 text-text-muted">
                            ({log.metadata.from} → {log.metadata.to})
                          </span>
                        )}
                      </p>
                      <p className="mt-1 font-mono text-xs text-text-faint">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Settings Tab ─────────────────────────────── */}
        {activeTab === "settings" && isAdmin && (
          <div className="animate-fade-in">
            <div className="rounded-xl border-2 border-danger-border bg-surface p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-light text-danger">
                  <TrashIcon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-danger">
                    Danger Zone
                  </h3>
                  <p className="mt-1 text-sm text-text-muted leading-relaxed">
                    Deleting this organization will permanently remove all
                    members, files, and audit logs. This action cannot be
                    undone.
                  </p>
                  <button
                    id="delete-org-btn"
                    onClick={() => setModal({ type: "deleteOrg" })}
                    className="btn-danger mt-4"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete Organization
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────── */}
      {modal?.type === "deleteFile" && (
        <ConfirmModal
          title="Delete file"
          message={`Are you sure you want to delete "${modal.file.original_name}"? This cannot be undone.`}
          confirmLabel="Delete File"
          confirmVariant="danger"
          onConfirm={() => handleDeleteFile(modal.file.id)}
          onCancel={() => setModal(null)}
        />
      )}

      {modal?.type === "removeMember" && (
        <ConfirmModal
          title="Remove member"
          message={`Are you sure you want to remove ${modal.member.name} (${modal.member.email}) from this organization?`}
          confirmLabel="Remove Member"
          confirmVariant="danger"
          onConfirm={() => handleRemoveMember(modal.member.id)}
          onCancel={() => setModal(null)}
        />
      )}

      {modal?.type === "deleteOrg" && (
        <ConfirmModal
          title="Delete organization"
          message="This will permanently delete the organization, all its members, files, and audit logs. This action is irreversible."
          confirmLabel="Delete Organization"
          confirmVariant="danger"
          requireTypedConfirmation="delete"
          onConfirm={handleDeleteOrg}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default OrganizationDetail;
