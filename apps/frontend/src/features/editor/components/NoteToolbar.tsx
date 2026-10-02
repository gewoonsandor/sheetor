import type { MouseEvent } from 'react';

import { DurationPicker } from './DurationPicker';
import { BEND_LABELS } from './songUtils';
import type { Duration, NoteTechniques, TabNote } from './types';
import { TECHNIQUE_LABELS, TECHNIQUE_SHORTCUTS } from '../shortcuts';
import type { TechniqueId } from '../shortcuts';

/** Technique buttons in toolbar order, each with its text glyph. */
const TECHNIQUES: [TechniqueId, string][] = [
  ['slur', '⌢'], ['legatoSlide', '╱'], ['bend', 'b'], ['vibrato', '~~'],
  ['palmMute', 'P.M.'], ['letRing', 'Ring'], ['harmonic', '</>'], ['ghostNote', '(x)'],
];

const RELEASE_LABEL = 'Release the bend (Shift+B)';
const SLIDE_OUT_LABEL = 'Slide out: down, up, off (Shift+S)';

/** What a button adds to its glyph for a technique with more kinds than on and off. */
const kindOf = (technique: TechniqueId, note: TabNote | undefined): string | undefined => {
  if (technique === 'bend' && note?.bend) return BEND_LABELS[note.bend];
  if (technique === 'legatoSlide') return note?.slideIn;
  return undefined;
};

// A toolbar button never takes focus from the score, so digits keep entering frets.
const keepFocus = (e: MouseEvent) => e.preventDefault();

interface NoteToolbarProps {
  duration: Duration;
  dotted: boolean;
  onDuration: (d: Duration) => void;
  onToggleDot: () => void;
  isRest: boolean;
  toggleActiveBeatRest: () => void;
  activeNote: TabNote | undefined;
  toggleNoteTechnique: (technique: keyof NoteTechniques) => void;
  clearBeat: () => void;
  midiInput: boolean;
  midiAvailable: boolean;
  toggleMidiInput: () => void;
  midiStatus: string;
}

/** Everything that writes the beat under the cursor, always in view above the score. */
export const NoteToolbar = ({
  duration, dotted, onDuration, onToggleDot, isRest, toggleActiveBeatRest, activeNote,
  toggleNoteTechnique, clearBeat, midiInput, midiAvailable, toggleMidiInput, midiStatus,
}: NoteToolbarProps) => (
  <div className="note-toolbar card" role="toolbar" aria-label="Note">
    <DurationPicker duration={duration} dotted={dotted} onDuration={onDuration} onToggleDot={onToggleDot} />
    <button
      type="button"
      className="btn btn-sm"
      aria-pressed={isRest}
      title="Rest (R)"
      onMouseDown={keepFocus}
      onClick={toggleActiveBeatRest}
    >
      Rest
    </button>
    <div className="toolbar-divider" />
    {TECHNIQUES.map(([technique, glyph]) => {
      const label = `${TECHNIQUE_LABELS[technique]} (${TECHNIQUE_SHORTCUTS[technique]})`;
      const kind = kindOf(technique, activeNote);
      return [
        <button
          key={technique}
          type="button"
          className="btn btn-sm"
          aria-pressed={!!activeNote?.[technique] || !!kind}
          aria-label={label}
          title={label}
          disabled={!activeNote}
          onMouseDown={keepFocus}
          onClick={() => toggleNoteTechnique(technique)}
        >
          {kind ? `${glyph} ${kind}` : glyph}
        </button>,
        technique === 'legatoSlide' && (
          <button
            key="slideOut"
            type="button"
            className="btn btn-sm"
            aria-pressed={!!activeNote?.slideOut}
            aria-label={SLIDE_OUT_LABEL}
            title={SLIDE_OUT_LABEL}
            disabled={!activeNote}
            onMouseDown={keepFocus}
            onClick={() => toggleNoteTechnique('slideOut')}
          >
            {activeNote?.slideOut ? `╲ ${activeNote.slideOut}` : '╲'}
          </button>
        ),
        technique === 'bend' && (
          <button
            key="bendRelease"
            type="button"
            className="btn btn-sm"
            aria-pressed={!!activeNote?.bend && !!activeNote.bendRelease}
            aria-label={RELEASE_LABEL}
            title={RELEASE_LABEL}
            disabled={!activeNote?.bend}
            onMouseDown={keepFocus}
            onClick={() => toggleNoteTechnique('bendRelease')}
          >
            ↗↘
          </button>
        ),
      ];
    })}
    <div className="toolbar-divider" />
    <button
      type="button"
      className="btn btn-sm btn-icon btn-danger"
      aria-label="Clear beat"
      title="Clear beat (Delete removes one note)"
      onMouseDown={keepFocus}
      onClick={clearBeat}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    </button>
    <span className="note-toolbar-spacer" />
    <button
      type="button"
      className="btn btn-sm"
      aria-pressed={midiInput}
      disabled={!midiAvailable}
      title={midiStatus}
      onMouseDown={keepFocus}
      onClick={toggleMidiInput}
    >
      MIDI
    </button>
  </div>
);
