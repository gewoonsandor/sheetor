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
/// closing hands focus back to the trigger when it would otherwise fall to
/// `<body>`. Escape closes it, as do a press anywhere outside and Tab out.
export const MenuButton = ({
  label, icon, iconOnly, open, onToggle, placement, align = 'end', triggerClassName, children,
}: MenuButtonProps) => {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) popoverRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    else if (wasOpen.current && document.activeElement === document.body) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // A document listener, not a fixed scrim: a `backdrop-filter` ancestor (the
  // command bar) becomes a fixed element's containing block and shrinks it.
  // `focusin`, not the root's `blur`: it fires once focus has moved, so closing
  // cannot unmount the focused control mid-move and drop focus on <body>.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) onToggle();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('focusin', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('focusin', close);
    };
  }, [open, onToggle]);

  return (
    <div className="menu" ref={rootRef}>
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
      )}
    </div>
  );
};
