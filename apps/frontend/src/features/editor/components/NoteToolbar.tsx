import type { MouseEvent } from 'react';

import { DurationPicker } from './DurationPicker';
import { ACCENTS, BEND_LABELS, DYNAMICS, HAIRPINS, STRING_TECHNIQUES, techniqueBlocked } from './songUtils';
import type { Accent, Duration, Dynamic, Hairpin, NoteTechniques, TabNote, Tuplet } from './types';
import { TECHNIQUE_LABELS, TECHNIQUE_SHORTCUTS } from '../shortcuts';
import type { TechniqueId } from '../shortcuts';

/** Technique buttons in toolbar order, each with its text glyph. */
const TECHNIQUES: [TechniqueId, string][] = [
  ['tie', '‿'], ['slur', '⌢'], ['legatoSlide', '╱'], ['bend', 'b'], ['vibrato', '~~'],
  ['palmMute', 'P.M.'], ['letRing', 'Ring'], ['harmonic', '</>'], ['ghostNote', '(x)'],
];

const RELEASE_LABEL = 'Release the bend (Shift+B)';
const SLIDE_OUT_LABEL = 'Slide out: down, up, off (Shift+S)';

/** Each hairpin's button: its word, as hairpins are also written, and what it does. */
const HAIRPIN_BUTTONS: Record<Hairpin, [string, string]> = {
  cresc: ['cresc.', 'Crescendo: louder into the next mark, over the selected beats'],
  dim: ['dim.', 'Diminuendo: softer into the next mark, over the selected beats'],
};

/** Each accent's button: its mark and what it does. */
const ACCENT_BUTTONS: Record<Accent, [string, string]> = {
  accent: ['>', 'Accent (A)'],
  marcato: ['^', 'Marcato, a stronger accent (Shift+A)'],
};

/** What a button adds to its glyph for a technique with more kinds than on and off. */
const kindOf = (technique: TechniqueId, note: TabNote | undefined): string | undefined => {
  if (technique === 'bend' && note?.bend) return BEND_LABELS[note.bend];
  if (technique === 'legatoSlide') return note?.slideIn;
  return undefined;
};

// A toolbar button never takes focus from the score, so digits keep entering frets.
const keepFocus = (e: MouseEvent) => e.preventDefault();

interface NoteToolbarProps {
  /** A fretted track; any other leaves out what only a string can do. */
  fretted: boolean;
  duration: Duration;
  dotted: boolean;
  tuplet: Tuplet | undefined;
  onDuration: (d: Duration) => void;
  onToggleDot: () => void;
  onCycleTuplet: () => void;
  isRest: boolean;
  toggleActiveBeatRest: () => void;
  activeNote: TabNote | undefined;
  /** Every note in the cursor beat, which palm mute and let ring check. */
  beatNotes: TabNote[];
  toggleNoteTechnique: (technique: keyof NoteTechniques) => void;
  clearBeat: () => void;
  dynamic: Dynamic | undefined;
  setDynamic: (dynamic: Dynamic | null) => void;
  hairpin: Hairpin | undefined;
  toggleHairpin: (hairpin: Hairpin) => void;
  accent: Accent | undefined;
  toggleAccent: (accent: Accent) => void;
  midiInput: boolean;
  midiAvailable: boolean;
  toggleMidiInput: () => void;
  midiStatus: string;
}

/** Everything that writes the beat under the cursor, always in view above the score. */
export const NoteToolbar = ({
  fretted, duration, dotted, tuplet, onDuration, onToggleDot, onCycleTuplet, isRest, toggleActiveBeatRest, activeNote, beatNotes,
  toggleNoteTechnique, clearBeat, dynamic, setDynamic, hairpin, toggleHairpin, accent, toggleAccent,
  midiInput, midiAvailable, toggleMidiInput, midiStatus,
}: NoteToolbarProps) => (
  <div className="note-toolbar card" role="toolbar" aria-label="Note">
    <DurationPicker
      duration={duration}
      dotted={dotted}
      tuplet={tuplet}
      onDuration={onDuration}
      onToggleDot={onToggleDot}
      onCycleTuplet={onCycleTuplet}
    />
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
    {TECHNIQUES.filter(([technique]) => fretted || !STRING_TECHNIQUES[technique]).map(([technique, glyph]) => {
      const label = `${TECHNIQUE_LABELS[technique]} (${TECHNIQUE_SHORTCUTS[technique]})`;
      const kind = kindOf(technique, activeNote);
      return [
        <button
          key={technique}
          type="button"
          className="btn btn-sm"
          aria-pressed={!!activeNote?.[technique] || !!kind}
          aria-label={kind ? `${label}: ${kind}` : label}
          title={label}
          disabled={!activeNote || techniqueBlocked(beatNotes, activeNote, technique)}
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
            aria-label={activeNote?.slideOut ? `${SLIDE_OUT_LABEL}: ${activeNote.slideOut}` : SLIDE_OUT_LABEL}
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
    {/* A select's list opens in the top layer, so the toolbar's scrolling does not clip it. */}
    <select
      className="control-select note-toolbar-select dynamic-select"
      aria-label="Dynamic"
      title="Dynamic: holds until the next one"
      value={dynamic ?? ''}
      onChange={(e) => setDynamic(DYNAMICS.find(d => d === e.target.value) ?? null)}
    >
      <option value="">dyn</option>
      {DYNAMICS.map(d => <option key={d} value={d}>{d}</option>)}
    </select>
    {HAIRPINS.map(kind => (
      <button
        key={kind}
        type="button"
        className="btn btn-sm"
        aria-pressed={hairpin === kind}
        aria-label={HAIRPIN_BUTTONS[kind][1]}
        title={HAIRPIN_BUTTONS[kind][1]}
        onMouseDown={keepFocus}
        onClick={() => toggleHairpin(kind)}
      >
        {HAIRPIN_BUTTONS[kind][0]}
      </button>
    ))}
    {ACCENTS.map(kind => (
      <button
        key={kind}
        type="button"
        className="btn btn-sm"
        aria-pressed={accent === kind}
        aria-label={ACCENT_BUTTONS[kind][1]}
        title={ACCENT_BUTTONS[kind][1]}
        onMouseDown={keepFocus}
        onClick={() => toggleAccent(kind)}
      >
        {ACCENT_BUTTONS[kind][0]}
      </button>
    ))}
    <div className="toolbar-divider" />
    <button
      type="button"
      className="btn btn-sm btn-icon btn-danger"
      aria-label="Clear beat"
      title="Clear beat (Delete or D removes one note)"
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
