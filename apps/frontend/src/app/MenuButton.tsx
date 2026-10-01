import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface MenuButtonProps {
  /** The accessible name; also the visible text unless `iconOnly`. */
  label: string;
  icon?: ReactNode;
  iconOnly?: boolean;
  open: boolean;
  /** The caller owns which menu is open. */
  onToggle: () => void;
  placement: 'up' | 'down';
  align?: 'start' | 'end';
  /** Extra trigger classes, e.g. 'btn-sm btn-ghost'. */
  triggerClassName?: string;
  /** Rendered only while open. */
  children: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), [href], input, select, textarea';

/// A trigger and the popover it opens. Opening moves focus into the popover;
/// Escape closes it and hands focus back to the trigger.
export const MenuButton = ({
  label, icon, iconOnly, open, onToggle, placement, align = 'end', triggerClassName, children,
}: MenuButtonProps) => {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) popoverRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  return (
    <div className="menu">
      <button
        ref={triggerRef}
        type="button"
        className={`btn ${triggerClassName ?? ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={label}
        onClick={onToggle}
      >
        {icon}
        <span className={iconOnly ? 'visually-hidden' : 'menu-label'}>{label}</span>
      </button>
      {open && (
        <>
          <div className="popover-scrim" onClick={onToggle} />
          <div
            ref={popoverRef}
            id={id}
            role="dialog"
            aria-label={label}
            className={`popover popover-${placement} popover-${align}`}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              onToggle();
              triggerRef.current?.focus();
            }}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
};
