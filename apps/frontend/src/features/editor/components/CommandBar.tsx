import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { MenuButton } from '../../../app/MenuButton';
import { Stepper } from './Stepper';
import { MAX_BPM, MAX_REPEAT, MIN_BPM, MIN_REPEAT, STAFF_LABELS } from './songUtils';
import type { Clef, Staff, StaffDisplay, TimeSignature } from './types';

export type MenuId = 'song' | 'measure' | 'playback' | 'view' | 'track';

const CLEF_LABELS: Record<Clef, string> = { treble: 'Treble (G)', bass: 'Bass (F)' };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface TransportProps {
  isPlaying: boolean;
  stop: () => void;
  startPlaybackFromCursor: () => void;
  activeMeasureIndex: number;
  activeMeasureBpm: number;
  transportBpmText: string;
  setMeasureBpm: (index: number, bpm: number) => void;
  setBpmDraft: (draft: string | null) => void;
  commitBpmDraft: (index: number) => void;
}

export interface PlaybackMenuProps {
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  volume: number;
  setVolume: (volume: number) => void;
  loopPlayback: boolean;
  setLoopPlayback: Dispatch<SetStateAction<boolean>>;
}

export interface SongMenuProps {
  startNewSong: () => void;
  handleExport: () => void;
  exportPdf: () => void;
  handleImport: () => void;
  clearSong: () => void;
}

export interface MeasureMenuProps {
  activeMeasureIndex: number;
  activeMeasureTimeSignature: TimeSignature;
  setActiveMeasureTimeSignature: (field: 'numerator' | 'denominator', value: number) => void;
  showNotation: boolean;
  staves: Staff[];
  grandStaff: boolean;
  setClef: (staff: Staff, clef: Clef) => void;
  /** Whether the cursor's bar holds a ‖: and a :‖. */
  repeatStart: boolean;
  repeatEnd: boolean;
  toggleRepeatStart: () => void;
  toggleRepeatEnd: () => void;
  /** The repeated section the cursor's bar is in, if any: `end` null is a ‖: nothing closes. */
  repeatSection: { start: number; end: number | null } | null;
  /** How many times that section plays, when a :‖ closes it. */
  repeatPlays: number | undefined;
  setRepeatPlays: (times: number) => void;
  addMeasure: () => void;
  insertMeasureAfterActive: () => void;
  duplicateActiveMeasure: () => void;
  deleteActiveMeasure: () => void;
  activeBeatIndex: number;
  insertBeatAfterActive: () => void;
  deleteActiveBeat: () => void;
}

export interface HistoryProps {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ReadOnlyProps {
  isViewer: boolean;
  viewMode: boolean;
  toggleViewMode: () => void;
}

export interface ViewMenuProps {
  partName: string;
  staffModes: readonly StaffDisplay[];
  display: StaffDisplay;
  pickStaffMode: (mode: StaffDisplay) => void;
  panelName: string;
  showFretboard: boolean;
  toggleFretboard: () => void;
  paperScore: boolean;
  togglePaperScore: () => void;
  showShortcuts: () => void;
}

interface MenuState {
  open: boolean;
  onToggle: () => void;
}

const TempoField = ({
  activeMeasureIndex, activeMeasureBpm, transportBpmText, setMeasureBpm, setBpmDraft, commitBpmDraft,
}: TransportProps) => (
  <div className="transport-field" title={activeMeasureIndex > 0 ? `Tempo from bar ${activeMeasureIndex + 1}` : undefined}>
    <span aria-hidden="true">♩ =</span>
    <Stepper
      decrementLabel="Slower by one"
      incrementLabel="Faster by one"
      onDecrement={() => setMeasureBpm(activeMeasureIndex, activeMeasureBpm - 1)}
      onIncrement={() => setMeasureBpm(activeMeasureIndex, activeMeasureBpm + 1)}
      canDecrement={activeMeasureBpm > MIN_BPM}
      canIncrement={activeMeasureBpm < MAX_BPM}
    >
      <input
        id="transport-bpm"
        aria-label="Tempo"
        type="text"
        inputMode="numeric"
        className="control-input control-input-num stepper-input"
        value={transportBpmText}
        onChange={(e) => setBpmDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => commitBpmDraft(activeMeasureIndex)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setBpmDraft(null); e.currentTarget.blur(); }
        }}
      />
    </Stepper>
    {activeMeasureIndex > 0 && <span className="transport-hint">from bar {activeMeasureIndex + 1}</span>}
  </div>
);

const PlaybackMenu = ({
  open, onToggle, playbackSpeed, setPlaybackSpeed, volume, setVolume, loopPlayback, setLoopPlayback,
}: PlaybackMenuProps & MenuState) => (
  <MenuButton
    label={`Playback ${playbackSpeed}x${loopPlayback ? ', loop' : ''}`}
    iconOnly
    icon={(
      <>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 5a10 10 0 0 1 0 14" />
        </svg>
        <span aria-hidden="true">{playbackSpeed}x{loopPlayback && ' · loop'}</span>
      </>
    )}
    open={open}
    onToggle={onToggle}
    placement="up"
    align="start"
  >
    <span className="eyebrow">Speed</span>
    <div className="speed-choices" role="group" aria-label="Speed">
      {SPEEDS.map(speed => (
        <button
          key={speed}
          type="button"
          className="btn"
          aria-pressed={playbackSpeed === speed}
          onClick={() => setPlaybackSpeed(speed)}
        >
          {speed}x
        </button>
      ))}
    </div>
    <div className="popover-divider" />
    <label className="compact-field wide-field">
      <span>Master</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
      />
    </label>
    <div className="popover-divider" />
    <button type="button" className="btn" aria-pressed={loopPlayback} onClick={() => setLoopPlayback(prev => !prev)}>
      Loop
    </button>
  </MenuButton>
);

/** Clearing asks once more, in place; closing the menu forgets the question. */
const ClearSong = ({ clearSong }: { clearSong: () => void }) => {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="btn btn-danger" autoFocus onClick={() => setConfirming(true)}>
        Clear song
      </button>
    );
  }
  return (
    <>
      <span className="popover-hint">Clears every track. Undo brings it back.</span>
      <div className="control-group">
        <button type="button" className="btn btn-danger" onClick={clearSong}>Clear</button>
        <button type="button" className="btn" autoFocus onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </>
  );
};

const SongMenu = ({
  open, onToggle, readOnly, startNewSong, handleExport, exportPdf, handleImport, clearSong,
}: SongMenuProps & MenuState & { readOnly: boolean }) => (
  <MenuButton
    label="Song"
    icon={(
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    )}
    open={open}
    onToggle={onToggle}
    placement="up"
  >
    <span className="eyebrow">Library</span>
    <button type="button" className="btn btn-primary" onClick={startNewSong}>New song</button>
    <div className="popover-divider" />
    <span className="eyebrow">Song file</span>
    <button type="button" className="btn" onClick={exportPdf}>Export PDF</button>
    <button type="button" className="btn" onClick={handleExport}>Export JSON</button>
    {!readOnly && <button type="button" className="btn" onClick={handleImport}>Import JSON</button>}
    {!readOnly && <div className="popover-divider" />}
    {!readOnly && <ClearSong clearSong={() => { clearSong(); onToggle(); }} />}
  </MenuButton>
);

const MeasureMenu = ({
  open, onToggle, activeMeasureIndex, activeMeasureTimeSignature, setActiveMeasureTimeSignature,
  showNotation, staves, grandStaff, setClef, repeatStart, repeatEnd, toggleRepeatStart, toggleRepeatEnd,
  repeatSection, repeatPlays, setRepeatPlays,
  addMeasure, insertMeasureAfterActive, duplicateActiveMeasure, deleteActiveMeasure,
  activeBeatIndex, insertBeatAfterActive, deleteActiveBeat,
}: MeasureMenuProps & MenuState) => (
  <MenuButton
    label="Measure"
    icon={(
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M3 8h18M3 12h18M3 16h18M4 5v14M20 5v14" />
      </svg>
    )}
    open={open}
    onToggle={onToggle}
    placement="up"
  >
    <span className="eyebrow">Measure {activeMeasureIndex + 1}</span>
    <div className="control-group">
      <span className="eyebrow">Time</span>
      <select
        className="control-select"
        aria-label="Beats per bar"
        value={activeMeasureTimeSignature.numerator}
        onChange={(e) => setActiveMeasureTimeSignature('numerator', parseInt(e.target.value) || 4)}
      >
        {[2, 3, 4, 5, 6, 7, 8, 9, 12].map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <span aria-hidden="true">/</span>
      <select
        className="control-select"
        aria-label="Beat unit"
        value={activeMeasureTimeSignature.denominator}
        onChange={(e) => setActiveMeasureTimeSignature('denominator', parseInt(e.target.value) || 4)}
      >
        {[2, 4, 8, 16].map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
    {/* Each staff's clef from this bar on: a grand staff's hands are set apart. */}
    {showNotation && staves.map((staff, i) => (
      <div
        className="control-group"
        key={`clef-${staff.top}`}
        role="group"
        aria-label={grandStaff ? `${i === 0 ? 'Right hand' : 'Left hand'} clef` : 'Clef'}
      >
        <span className="eyebrow">{grandStaff ? `${i === 0 ? 'R.H.' : 'L.H.'} clef` : 'Clef'}</span>
        {(['treble', 'bass'] as const).map(clef => (
          <button
            key={clef}
            type="button"
            className="btn"
            aria-pressed={staff.clefs[activeMeasureIndex] === clef}
            onClick={() => setClef(staff, clef)}
          >
            {CLEF_LABELS[clef]}
          </button>
        ))}
      </div>
    ))}
    <div className="control-group">
      <span className="eyebrow">Repeat</span>
      <button
        type="button"
        className="btn"
        aria-pressed={repeatStart}
        onClick={toggleRepeatStart}
        title="Start a repeated section at this bar"
      >
        Start
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={repeatEnd}
        onClick={toggleRepeatEnd}
        title="End a repeated section at this bar"
      >
        End
      </button>
    </div>
    {/* Any bar of a section shows that section's play count, wherever the :‖ is. */}
    {repeatSection?.end != null && repeatPlays !== undefined && (
      <div className="control-group" role="group" aria-label={`Plays, bars ${repeatSection.start + 1} to ${repeatSection.end + 1}`}>
        <span className="eyebrow">Plays, bars {repeatSection.start + 1}–{repeatSection.end + 1}</span>
        <Stepper
          decrementLabel="Play the section one time fewer"
          incrementLabel="Play the section one time more"
          onDecrement={() => setRepeatPlays(repeatPlays - 1)}
          onIncrement={() => setRepeatPlays(repeatPlays + 1)}
          canDecrement={repeatPlays > MIN_REPEAT}
          canIncrement={repeatPlays < MAX_REPEAT}
        >
          <output className="stepper-value">×{repeatPlays}</output>
        </Stepper>
      </div>
    )}
    {repeatSection && repeatSection.end === null && (
      <p className="popover-hint is-warning" role="status">
        The repeat from bar {repeatSection.start + 1} has no end: press End on its last bar.
      </p>
    )}
    <div className="popover-divider" />
    <button type="button" className="btn" onClick={addMeasure}>Add measure at end</button>
    <button type="button" className="btn" onClick={insertMeasureAfterActive}>
      Insert measure after <kbd>Shift</kbd><kbd>I</kbd>
    </button>
    <button type="button" className="btn" onClick={duplicateActiveMeasure}>Duplicate measure</button>
    <button type="button" className="btn btn-danger" onClick={deleteActiveMeasure}>
      Delete measure <kbd>Ctrl</kbd><kbd>Del</kbd>
    </button>
    <div className="popover-divider" />
    <span className="eyebrow">Beat {activeBeatIndex + 1}</span>
    <button type="button" className="btn" onClick={insertBeatAfterActive}>
      Insert beat after <kbd>I</kbd>
    </button>
    <button type="button" className="btn btn-danger" onClick={deleteActiveBeat}>
      Delete beat <kbd>Shift</kbd><kbd>Del</kbd>
    </button>
  </MenuButton>
);

const HistoryButtons = ({ undo, redo, canUndo, canRedo }: HistoryProps) => (
  <>
    <button type="button" className="btn btn-icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </svg>
    </button>
    <button type="button" className="btn btn-icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
      </svg>
    </button>
  </>
);

/** One click between editing and reading; a viewer's is stuck on. */
const ReadOnlyToggle = ({ isViewer, viewMode, toggleViewMode }: ReadOnlyProps) => (
  <button
    type="button"
    className="btn"
    aria-pressed={isViewer || viewMode}
    disabled={isViewer}
    onClick={toggleViewMode}
    title={isViewer ? 'You can only view this song' : 'Read-only: play and browse without changing the song'}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={isViewer || viewMode ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2'} />
    </svg>
    <span className="cmd-label">{isViewer ? 'View only' : 'Read-only'}</span>
  </button>
);

const ViewMenu = ({
  open, onToggle, partName, staffModes, display, pickStaffMode, panelName, showFretboard, toggleFretboard,
  paperScore, togglePaperScore, showShortcuts,
}: ViewMenuProps & MenuState) => (
  <MenuButton
    label="View"
    icon={(
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )}
    open={open}
    onToggle={onToggle}
    placement="up"
  >
    {/* Only a fretted part has a choice; a grand staff is set in Track settings. */}
    {staffModes.length > 1 && (
      <>
        <span className="eyebrow">Staff — {partName}</span>
        <div className="control-group" role="group" aria-label="Staff">
          {staffModes.map(mode => (
            <button
              key={mode}
              type="button"
              className="btn"
              aria-pressed={display === mode}
              onClick={() => pickStaffMode(mode)}
            >
              {STAFF_LABELS[mode]}
            </button>
          ))}
        </div>
        <div className="popover-divider" />
      </>
    )}
    <button type="button" className="btn" aria-pressed={showFretboard} onClick={toggleFretboard}>
      {panelName}
    </button>
    <button type="button" className="btn" aria-pressed={paperScore} onClick={togglePaperScore}>
      Paper score
    </button>
    <span className="popover-hint">Dark ink on a light page, in the dark theme too.</span>
    <div className="popover-divider" />
    <button type="button" className="btn" onClick={showShortcuts}>
      Keyboard shortcuts <kbd>?</kbd>
    </button>
  </MenuButton>
);

interface CommandBarProps {
  openMenu: MenuId | null;
  toggleMenu: (id: MenuId) => void;
  readOnly: boolean;
  status: string;
  transport: TransportProps;
  playback: PlaybackMenuProps;
  song: SongMenuProps;
  measure: MeasureMenuProps;
  history: HistoryProps;
  view: ViewMenuProps;
  readOnlyToggle: ReadOnlyProps;
}

/** The dock at the bottom: transport on the left, where the cursor is in the middle, editing then the song and the read-only switch on the right. */
export const CommandBar = ({
  openMenu, toggleMenu, readOnly, status, transport, playback, song, measure, history, view, readOnlyToggle,
}: CommandBarProps) => {
  const menu = (id: MenuId): MenuState => ({ open: openMenu === id, onToggle: () => toggleMenu(id) });
  return (
    <div className="bottom-command-bar">
      <div className="bottom-cluster">
        {transport.isPlaying ? (
          <button type="button" className="btn btn-danger" onClick={transport.stop}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            <span className="cmd-label">Stop</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={transport.startPlaybackFromCursor}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="cmd-label">Play</span>
          </button>
        )}
        <TempoField {...transport} />
        <PlaybackMenu {...playback} {...menu('playback')} />
      </div>

      <p id="sheetor-status" className="cmd-status" aria-live="polite">{status}</p>

      <div className="bottom-cluster">
        {!readOnly && <HistoryButtons {...history} />}
        {!readOnly && <MeasureMenu {...measure} {...menu('measure')} />}
        <ViewMenu {...view} {...menu('view')} />
        <div className="toolbar-divider" />
        <SongMenu {...song} {...menu('song')} readOnly={readOnly} />
        <ReadOnlyToggle {...readOnlyToggle} />
      </div>
    </div>
  );
};
