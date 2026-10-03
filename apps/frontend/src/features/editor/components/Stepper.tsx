import type { ReactNode } from 'react';

interface StepperProps {
  decrementLabel: string;
  incrementLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement: boolean;
  canIncrement: boolean;
  children: ReactNode;
}

/** A minus/plus pair around a value, instead of the browser's spinner, which overlapped
 *  the digits at this width. Nudges by one; type into the box for a bigger jump. */
export const Stepper = ({
  decrementLabel, incrementLabel, onDecrement, onIncrement, canDecrement, canIncrement, children,
}: StepperProps) => (
  <div className="stepper">
    <button
      type="button"
      className="btn btn-sm btn-icon"
      onClick={() => { if (canDecrement) onDecrement(); }}
      aria-disabled={!canDecrement}
      aria-label={decrementLabel}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M5 12h14" />
      </svg>
    </button>
    {children}
    <button
      type="button"
      className="btn btn-sm btn-icon"
      onClick={() => { if (canIncrement) onIncrement(); }}
      aria-disabled={!canIncrement}
      aria-label={incrementLabel}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  </div>
);
