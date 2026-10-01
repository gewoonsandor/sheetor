import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

/// A modal on the native <dialog>: being mounted means being open. It traps
/// focus and answers Escape itself, and gives focus back to whatever had it.
export const Dialog = ({
  title, onClose, children, className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      // Closing first lets a remount (StrictMode runs effects twice) see the
      // element that really had focus, not one inside this dialog.
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className ?? ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-panel card">
        <header className="dialog-header">
          <h2 id={titleId} className="dialog-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
};
