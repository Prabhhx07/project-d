import { useState, useEffect, useRef } from "react";
import { XIcon } from "./icons.jsx";

function ConfirmModal({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  requireTypedConfirmation = "",
  onConfirm,
  onCancel,
}) {
  const [typedValue, setTypedValue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (requireTypedConfirmation && inputRef.current) {
      inputRef.current.focus();
    }
  }, [requireTypedConfirmation]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onCancel();
  };

  const canConfirm = requireTypedConfirmation
    ? typedValue === requireTypedConfirmation
    : true;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setConfirming(true);
    try {
      await onConfirm();
    } catch {
    } finally {
      setConfirming(false);
    }
  };

  const btnClass = confirmVariant === "danger" ? "btn-danger" : "btn-primary";

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="animate-scale-in w-full max-w-md rounded-2xl bg-surface p-6 shadow-modal">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-text-faint hover:bg-bg hover:text-text-muted transition-colors"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Message */}
        {message && (
          <p className="mb-5 text-sm text-text-muted leading-relaxed">
            {message}
          </p>
        )}

        {/* Typed confirmation */}
        {requireTypedConfirmation && (
          <div className="mb-5">
            <p className="mb-2 text-sm text-text-secondary">
              Type{" "}
              <span className="font-mono font-semibold text-text-primary">
                {requireTypedConfirmation}
              </span>{" "}
              to confirm:
            </p>
            <input
              ref={inputRef}
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              className="input-field"
              placeholder={requireTypedConfirmation}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || confirming}
            className={`${btnClass}`}
          >
            {confirming ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
