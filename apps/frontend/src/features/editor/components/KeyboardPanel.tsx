import { midiToNoteOctave } from './songUtils';

/** Which hand of a grand staff: the treble staff's track is the right. */
export type Hand = 'right' | 'left';

const HAND_LABELS: Record<Hand, string> = { right: 'Right hand', left: 'Left hand' };

export const HidePanelButton = ({ name, onHide }: { name: string; onHide: () => void }) => (
  <button
    type="button"
    className="btn btn-ghost btn-sm btn-icon"
    onClick={onHide}
    title="Hide (View menu shows it again)"
    aria-label={`Hide the ${name}`}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>
);

interface KeyboardPanelProps {
  grandStaff: boolean;
  activeHand: Hand;
  switchHand: (hand: Hand) => void;
  whiteKeyMidis: number[];
  blackKeys: { midi: number; leftPct: number }[];
  blackKeyWidthPct: number;
  activeMidis: Set<number>;
  keyClass: (midi: number) => string;
  toggleNoteAtMidi: (midi: number) => void;
  onHide: () => void;
}

/** Pitch input for a track without TAB: a key adds or removes its pitch on the cursor's beat. */
export const KeyboardPanel = ({
  grandStaff, activeHand, switchHand, whiteKeyMidis, blackKeys, blackKeyWidthPct, activeMidis,
  keyClass, toggleNoteAtMidi, onHide,
}: KeyboardPanelProps) => (
  <div className="sheetor-fretboard card">
    <div className="fretboard-header">
      <div className="fretboard-title eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v9M15 4v9" />
        </svg>
        Keyboard
      </div>
      {grandStaff && (
        // Which hand the keys, the keyboard and MIDI write to: its keys are the solid ones.
        <div className="control-group" role="group" aria-label="Hand">
          {(['left', 'right'] as const).map(hand => (
            <button
              key={hand}
              type="button"
              className="btn"
              aria-pressed={activeHand === hand}
              onClick={() => switchHand(hand)}
            >
              {HAND_LABELS[hand]}
            </button>
          ))}
        </div>
      )}
      <HidePanelButton name="keyboard" onHide={onHide} />
    </div>

    <div className="piano-keyboard">
      <div className="piano-white-row">
        {whiteKeyMidis.map((midi) => (
          <button
            key={`wk-${midi}`}
            type="button"
            className={`piano-key white${keyClass(midi)}`}
            aria-label={midiToNoteOctave(midi)}
            aria-pressed={activeMidis.has(midi)}
            onClick={() => toggleNoteAtMidi(midi)}
          >
            <span className="piano-key-label" aria-hidden="true">{midiToNoteOctave(midi)}</span>
          </button>
        ))}
      </div>
      {blackKeys.map(({ midi, leftPct }) => (
        <button
          key={`bk-${midi}`}
          type="button"
          className={`piano-key black${keyClass(midi)}`}
          style={{
            left: `${leftPct}%`,
            width: `${blackKeyWidthPct}%`,
            marginLeft: `-${blackKeyWidthPct / 2}%`,
          }}
          aria-label={midiToNoteOctave(midi)}
          aria-pressed={activeMidis.has(midi)}
          onClick={() => toggleNoteAtMidi(midi)}
        />
      ))}
    </div>

    <span className="fretboard-hint">
      {grandStaff
        ? `Click a key to add or remove that pitch on the ${HAND_LABELS[activeHand].toLowerCase()}'s selected beat`
        : 'Click a key to add or remove that pitch on the selected beat'}
    </span>
  </div>
);
