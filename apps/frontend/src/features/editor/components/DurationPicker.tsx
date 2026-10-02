import type { ReactNode } from 'react';

import type { Duration, Tuplet } from './types';

const TUPLET_LABEL = 'Tuplet: triplet, sextuplet, off (T)';

const NAMES: Record<Duration, string> = {
  '1': 'Whole', '2': 'Half', '4': 'Quarter', '8': 'Eighth', '16': 'Sixteenth', '32': 'Thirty-second',
};

const HEAD = <ellipse cx="10" cy="14" rx="5" ry="3.5" transform="rotate(-20 10 14)" />;
const STEM = <line x1="15" y1="14" x2="15" y2="4" stroke="currentColor" strokeWidth="2.2" />;
const FLAGS = [
  'M 15 4 C 18 6, 20 10, 18 13 C 17.5 10, 16 7, 15 6',
  'M 15 7.5 C 18 9.5, 20 13.5, 18 16.5 C 17.5 13.5, 16 10.5, 15 9.5',
  'M 15 11 C 18 13, 20 17, 18 20 C 17.5 17, 16 14, 15 13',
];

const glyph = (duration: Duration): ReactNode => {
  if (duration === '1') {
    return (
      <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="6" ry="4" transform="rotate(-20 12 12)" />
      </svg>
    );
  }
  if (duration === '2') {
    return (
      <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" aria-hidden="true">
        {HEAD}
        <line x1="15" y1="14" x2="15" y2="4" strokeWidth="2.2" />
      </svg>
    );
  }
  const flags = { '4': 0, '8': 1, '16': 2, '32': 3 }[duration];
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {HEAD}
      {STEM}
      {FLAGS.slice(0, flags).map(d => <path key={d} d={d} />)}
    </svg>
  );
};

/** The note lengths, the dot and the tuplet, as one segmented group. */
export const DurationPicker = ({ duration, dotted, tuplet, onDuration, onToggleDot, onCycleTuplet }: {
  duration: Duration;
  dotted: boolean;
  tuplet: Tuplet | undefined;
  onDuration: (d: Duration) => void;
  onToggleDot: () => void;
  onCycleTuplet: () => void;
}) => (
  <div className="duration-selector" role="group" aria-label="Note length">
    {(['1', '2', '4', '8', '16', '32'] as const).map(d => (
      <button
        key={d}
        type="button"
        className="btn btn-sm btn-icon btn-ghost"
        aria-pressed={duration === d}
        aria-label={`${NAMES[d]} note`}
        title={`${NAMES[d]} note (+ / − to change)`}
        onMouseDown={e => e.preventDefault()}
        onClick={() => onDuration(d)}
      >
        {glyph(d)}
      </button>
    ))}
    <button
      type="button"
      className="btn btn-sm btn-icon btn-ghost"
      aria-pressed={dotted}
      aria-label="Dotted"
      title="Dotted (.)"
      onMouseDown={e => e.preventDefault()}
      onClick={onToggleDot}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="18" cy="18" r="3" />
        {HEAD}
        {STEM}
      </svg>
    </button>
    <button
      type="button"
      className="btn btn-sm btn-icon btn-ghost duration-tuplet"
      aria-pressed={tuplet !== undefined}
      aria-label={TUPLET_LABEL}
      title={TUPLET_LABEL}
      onMouseDown={e => e.preventDefault()}
      onClick={onCycleTuplet}
    >
      {tuplet ?? 3}
    </button>
  </div>
);
