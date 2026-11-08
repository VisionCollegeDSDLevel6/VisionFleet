
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import "../styles/Modal.css";

export default function Modal({
  open = true,
  title,
  subtitle = "",
  children,
  footer = null,
  onClose,
  busy = false,
  size = "md",
}) {
  const dialogRef = useRef(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const subtitleId = useId();

  busyRef.current = busy;
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previousFocusedElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;

    document.body.style.overflow = "hidden";

    // Disable interactions with the React app
    // while the modal is open.
    if (root) {
      root.inert = true;
    }

    const frame = requestAnimationFrame(() => {
      const firstInput = dialogRef.current?.querySelector(
        "[data-modal-autofocus]"
      );

      const firstFocusable = dialogRef.current?.querySelector(
        "input:not([disabled]), select:not([disabled]), " +
        "textarea:not([disabled]), button:not([disabled])"
      );

      (firstInput || firstFocusable || dialogRef.current)
        ?.focus();
    });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          closeRef.current?.();
        }
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll(
          'a[href], button:not([disabled]), ' +
          'input:not([disabled]), select:not([disabled]), ' +
          'textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (element) => element.getClientRects().length > 0
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements.at(-1);

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;

      if (root) {
        root.inert = previousInert;
      }

      if (
        previousFocusedElement?.isConnected &&
        typeof previousFocusedElement.focus === "function"
      ) {
        previousFocusedElement.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const allowedSizes = ["sm", "md", "lg", "xl"];
  const modalSize = allowedSizes.includes(size)
    ? size
    : "md";

  return createPortal(
    <div className="vfm-overlay">
      <section
        className={`vfm-dialog vfm-dialog--${modalSize}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <header className="vfm-header">
          <div className="vfm-header-content">
            <span className="vfm-eyebrow">
              VISION FLEET
            </span>

            <h2 id={titleId}>{title}</h2>

            {subtitle && (
              <p id={subtitleId}>{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            className="vfm-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            title="Close"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {children}

        {footer && (
          <footer className="vfm-footer">
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body
  );
}

// Reusable confirmation dialog for
// Approve, Delete, Start, Finish, etc.
export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Go Back",
  variant = "primary",
  onConfirm,
  onClose,
  busy = false,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      busy={busy}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="vfm-btn vfm-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className={
              variant === "danger"
                ? "vfm-btn vfm-btn-delete"
                : "vfm-btn vfm-btn-primary"
            }
            onClick={onConfirm}
            disabled={busy}
            data-modal-autofocus
          >
            {busy ? "Processing..." : confirmText}
          </button>
        </>
      }
    >
      <div className="vfm-body">
        <p className="vfm-confirm-message">{message}</p>
      </div>
    </Modal>
  );
}
