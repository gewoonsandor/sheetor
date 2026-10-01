import { Fragment } from 'react';

import { HidePanelButton } from './KeyboardPanel';
import {
  computeFretboardNeckHeight,
  FRET_COUNT,
  getFretboardStringY,
  getFretCellLeft,
  getFretCellWidth,
  getFretLeftPercentage,
} from './layout';
import { isFrettedNote, midiToNoteName } from './songUtils';
import type { TabBeat } from './types';

const MARKED_FRETS = [3, 5, 7, 9, 12, 15];

/** Where a fret-relative percentage lands on the neck, past the 30px open-string column. */
const neckX = (pct: number): string => `calc(30px + (100% - 30px) * ${pct / 100})`;
const cellWidth = (fret: number): string =>
  fret === 0 ? '30px' : `calc((100% - 30px) * ${getFretCellWidth(fret) / 100})`;

interface FretboardPanelProps {
  tuning: number[];
  activeBeat: TabBeat | undefined;
  /** The beat sounding now, while playing. */
  playbackBeat: TabBeat | undefined;
  removeActiveNoteOnString: (stringIndex: number) => void;
  setFretForActiveNote: (stringIndex: number, fret: number) => void;
  onHide: () => void;
}

const hasFret = (beat: TabBeat | undefined, stringIndex: number, fret: number): boolean =>
  !!beat?.notes.some(n => isFrettedNote(n) && n.stringIndex === stringIndex && n.fret === fret);

/** String and fret input for a TAB track: a fret places, or removes, the note on its string. */
export const FretboardPanel = ({
  tuning, activeBeat, playbackBeat, removeActiveNoteOnString, setFretForActiveNote, onHide,
}: FretboardPanelProps) => {
  const stringCount = tuning.length;
  const stringY = (stringIdx: number): number => getFretboardStringY(stringIdx, stringCount);

  return (
    <div className="sheetor-fretboard card">
      <div className="fretboard-header">
        <div className="fretboard-title eyebrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v2.5c0 .5-.2 1-.6 1.4L5 12.5V16l1.5.5L5 21h14l-1.5-4.5L19 16v-3.5l-3.4-3.6c-.4-.4-.6-.9-.6-1.4V5a3 3 0 0 0-3-3Z" />
            <circle cx="8" cy="18" r="1" />
          </svg>
          Fretboard
        </div>
        <span className="fretboard-hint">
          Click a fret to place a note on the selected beat
        </span>
        <HidePanelButton name="fretboard" onHide={onHide} />
      </div>

      <div className="fretboard-neck-container" style={{ height: `${computeFretboardNeckHeight(stringCount)}px` }}>
        <div className="fretboard-nut" />

        {MARKED_FRETS.map((fret) => {
          const leftPos = getFretLeftPercentage(fret - 1) + (getFretLeftPercentage(fret) - getFretLeftPercentage(fret - 1)) / 2;
          if (fret === 12) {
            return (
              <Fragment key={`mark-${fret}`}>
                <div className="fretboard-marker double-1" style={{ left: neckX(leftPos) }} />
                <div className="fretboard-marker double-2" style={{ left: neckX(leftPos) }} />
              </Fragment>
            );
          }
          return <div key={`mark-${fret}`} className="fretboard-marker single" style={{ left: neckX(leftPos) }} />;
        })}

        {Array.from({ length: FRET_COUNT }, (_, idx) => (
          <div
            key={`fret-${idx + 1}`}
            className="fretboard-fret-line"
            style={{ left: neckX(getFretLeftPercentage(idx + 1)) }}
          />
        ))}

        {/* Strings, thicker toward the bass */}
        {tuning.map((_, stringIdx) => (
          <div
            key={`fb-str-${stringIdx}`}
            className="fretboard-string"
            style={{
              top: `${stringY(stringIdx)}px`,
              height: `${1.0 + ((stringCount - 1) - stringIdx) * (2.5 / Math.max(stringCount - 1, 1))}px`,
              opacity: 0.85,
            }}
          />
        ))}

        {tuning.map((open, stringIdx) =>
          Array.from({ length: FRET_COUNT + 1 }, (_, fretNum) => {
            const noteName = midiToNoteName(open + fretNum);
            const isSelectedNote = hasFret(activeBeat, stringIdx, fretNum);
            const isPlaybackNote = !playbackBeat?.isRest && hasFret(playbackBeat, stringIdx, fretNum);
            return (
              <button
                key={`cell-${stringIdx}-${fretNum}`}
                type="button"
                className="fretboard-fret-cell"
                aria-label={`String ${stringIdx + 1}, fret ${fretNum} (${noteName})`}
                aria-pressed={isSelectedNote}
                style={{
                  top: `${stringY(stringIdx) - 12}px`,
                  left: fretNum === 0 ? '0px' : neckX(getFretCellLeft(fretNum)),
                  width: cellWidth(fretNum),
                  height: '25px',
                }}
                onClick={() => {
                  if (isSelectedNote) removeActiveNoteOnString(stringIdx);
                  else setFretForActiveNote(stringIdx, fretNum);
                }}
              >
                <span className={`fretboard-note-bubble ${isSelectedNote ? 'active' : ''} ${isPlaybackNote ? 'playback-active' : ''}`}>
                  {fretNum === 0 ? `0 (${noteName})` : noteName}
                </span>
              </button>
            );
          }),
        )}
      </div>

      <div className="fret-labels">
        {Array.from({ length: FRET_COUNT + 1 }, (_, fretNum) => (
          <div key={`fret-lbl-${fretNum}`} className="fret-label" style={{ width: cellWidth(fretNum) }}>
            {fretNum === 0 ? 'Nut' : fretNum}
          </div>
        ))}
      </div>
    </div>
  );
};
