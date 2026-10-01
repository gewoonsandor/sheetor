import type { ReactNode } from 'react';

import { INSTRUMENTS } from './audioEngine';
import { GUITAR_NOTE_OPTIONS, midiToNoteOctave, noteOctaveToMidi, resizeTuning } from './songUtils';
import type { InstrumentId, TabTrack } from './types';

const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENTS).map(([id, voice]) => ({
  id: id as InstrumentId,
  label: voice.label,
}));

/** Key signatures from seven flats to seven sharps, as the Key menu lists them: major / relative minor. */
const KEY_OPTIONS = [
  ['C♭', 'A♭'], ['G♭', 'E♭'], ['D♭', 'B♭'], ['A♭', 'F'], ['E♭', 'C'], ['B♭', 'G'], ['F', 'D'], ['C', 'A'],
  ['G', 'E'], ['D', 'B'], ['A', 'F♯'], ['E', 'C♯'], ['B', 'G♯'], ['F♯', 'D♯'], ['C♯', 'A♯'],
].map(([major, minor], i) => {
  const key = i - 7;
  const count = key === 0 ? '' : ` · ${Math.abs(key)}${key > 0 ? '♯' : '♭'}`;
  return { key, label: `${major} / ${minor}m${count}` };
});

interface TrackSettingsProps {
  /** The part's track: a grand staff's name, key and volume live on its treble. */
  part: TabTrack;
  activeTrack: TabTrack;
  renamePart: (name: string) => void;
  changeInstrument: (instrument: InstrumentId) => void;
  setPartKey: (key: number) => void;
  setPartVolume: (volume: number) => void;
  leftHandWarning: ReactNode;
  isFrettedTrack: boolean;
  presets: Record<string, number[]>;
  presetName: string;
  tuning: number[];
  setTuning: (next: number[]) => void;
  duplicateActiveTrack: () => void;
  deleteActiveTrack: () => void;
  canDeleteTrack: boolean;
}

/** The active part's settings, inside the track strip's menu. */
export const TrackSettings = ({
  part, activeTrack, renamePart, changeInstrument, setPartKey, setPartVolume, leftHandWarning,
  isFrettedTrack, presets, presetName, tuning, setTuning, duplicateActiveTrack, deleteActiveTrack,
  canDeleteTrack,
}: TrackSettingsProps) => (
  <>
    <label className="compact-field wide-field">
      <span>Name</span>
      <input className="control-input" value={part.name} onChange={(e) => renamePart(e.target.value)} />
    </label>
    <label className="compact-field wide-field">
      <span>Sound</span>
      <select
        className="control-select"
        value={activeTrack.instrument}
        onChange={(e) => changeInstrument(e.target.value as InstrumentId)}
      >
        {INSTRUMENT_OPTIONS.map(opt => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    </label>
    {leftHandWarning}
    <label className="compact-field wide-field">
      <span>Key</span>
      <select
        className="control-select"
        value={part.keySignature ?? 0}
        onChange={(e) => setPartKey(Number(e.target.value))}
      >
        {KEY_OPTIONS.map(opt => (
          <option key={opt.key} value={opt.key}>{opt.label}</option>
        ))}
      </select>
    </label>
    <label className="compact-field wide-field">
      <span>Volume</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={part.volume}
        onChange={(e) => setPartVolume(parseFloat(e.target.value))}
      />
    </label>

    {isFrettedTrack && (
      <>
        <div className="popover-divider" />
        <span className="eyebrow">Tuning</span>
        <label className="compact-field wide-field">
          <span>Preset</span>
          <select
            className="control-select"
            value={presetName}
            onChange={(e) => {
              const pitches = presets[e.target.value];
              if (pitches) setTuning([...pitches]);
            }}
          >
            {presetName === '' && <option value="">Custom</option>}
            {Object.keys(presets).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="compact-field wide-field">
          <span>Strings</span>
          <select
            className="control-select"
            value={tuning.length}
            onChange={(e) => setTuning(resizeTuning(tuning, Number(e.target.value)))}
          >
            {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="tuning-grid">
          {tuning.map((pitch, i) => (
            <label key={i} className="tuning-string">
              <span>{i + 1}</span>
              <select
                className="control-select"
                value={midiToNoteOctave(pitch)}
                onChange={(e) => setTuning(tuning.map((p, j) => (j === i ? noteOctaveToMidi(e.target.value) : p)))}
              >
                {GUITAR_NOTE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </>
    )}

    <div className="popover-divider" />
    <button type="button" className="btn" onClick={duplicateActiveTrack}>Duplicate track</button>
    <button type="button" className="btn btn-danger" onClick={deleteActiveTrack} disabled={!canDeleteTrack}>
      Delete track
    </button>
  </>
);
