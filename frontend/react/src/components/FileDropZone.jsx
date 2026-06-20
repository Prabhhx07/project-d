import { useState, useRef } from "react";
import { UploadIcon, DocumentIcon, XIcon } from "./icons.jsx";

function FileDropZone({ onFileSelect, uploading, disabled }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all ${
          isDragging
            ? "border-accent bg-accent-light/50"
            : "border-border hover:border-accent/40 hover:bg-bg/50"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spinner rounded-full border-[2.5px] border-accent border-t-transparent" />
            <p className="text-sm font-medium text-accent">Uploading…</p>
          </div>
        ) : (
          <>
            <div
              className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                isDragging
                  ? "bg-accent/10 text-accent"
                  : "bg-bg text-text-faint"
              }`}
            >
              <UploadIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text-primary">
              {isDragging ? "Drop your file here" : "Drag & drop a file here"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              or{" "}
              <span className="text-accent font-medium">click to browse</span>
              {" · "}PDF, DOCX, JPG, PNG, TXT up to 10 MB
            </p>
          </>
        )}
      </div>

      {/* Selected file preview */}
      {selectedFile && !uploading && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-bg px-4 py-3 animate-slide-up">
          <DocumentIcon className="h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {selectedFile.name}
            </p>
            <p className="text-xs font-mono text-text-muted">
              {formatSize(selectedFile.size)}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearFile();
            }}
            className="rounded-md p-1 text-text-faint hover:bg-surface hover:text-text-muted transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default FileDropZone;
