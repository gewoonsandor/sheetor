import { useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

import { MenuButton } from '../../../app/MenuButton';
import { Stepper } from './Stepper';
import { MAX_BPM, MAX_REPEAT, MIN_BPM, MIN_REPEAT } from './songUtils';
import type { Clef, Staff, StaffDisplay, TimeSignature } from './types';

export type MenuId = 'song' | 'measure' | 'edit' | 'playback' | 'view' | 'track';

const CLEF_LABELS: Record<Clef, string> = { treble: 'Treble (G)', bass: 'Bass (F)' };

const STAFF_LABELS: Record<StaffDisplay, string> = { both: 'Both', notation: 'Notes', tab: 'TAB' };

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
  repeatStart: boolean;
  toggleRepeatStart: () => void;
  activeRepeat: number | undefined;
  setRepeatEnd: (times: number | null) => void;
  addMeasure: () => void;
  insertMeasureAfterActive: () => void;
  duplicateActiveMeasure: () => void;
  deleteActiveMeasure: () => void;
}

export interface EditMenuProps {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
  canPaste: boolean;
  activeBeatIndex: number;
  insertBeatAfterActive: () => void;
  deleteActiveBeat: () => void;
}

export interface ViewMenuProps {
  partName: string;
  staffModes: readonly StaffDisplay[];
  display: StaffDisplay;
  grandStaff: boolean;
  canGrandStaff: boolean;
  pickStaffMode: (mode: StaffDisplay) => void;
  addGrandStaff: () => void;
  leftHandWarning: ReactNode;
  panelName: string;
  showFretboard: boolean;
  toggleFretboard: () => void;
  isViewer: boolean;
  viewMode: boolean;
  toggleViewMode: () => void;
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
    label="Playback"
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
      <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
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
  open, onToggle, readOnly, startNewSong, handleExport, handleImport, clearSong,
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
    <button type="button" className="btn" onClick={handleExport}>Export JSON</button>
    {!readOnly && <button type="button" className="btn" onClick={handleImport}>Import JSON</button>}
    {!readOnly && <div className="popover-divider" />}
    {!readOnly && <ClearSong clearSong={() => { clearSong(); onToggle(); }} />}
  </MenuButton>
);

const MeasureMenu = ({
  open, onToggle, activeMeasureIndex, activeMeasureTimeSignature, setActiveMeasureTimeSignature,
  showNotation, staves, grandStaff, setClef, repeatStart, toggleRepeatStart, activeRepeat, setRepeatEnd,
  addMeasure, insertMeasureAfterActive, duplicateActiveMeasure, deleteActiveMeasure,
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
      <div className="control-group" key={`clef-${staff.top}`}>
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
        aria-pressed={activeRepeat !== undefined}
        onClick={() => setRepeatEnd(activeRepeat !== undefined ? null : MIN_REPEAT)}
        title="End a repeated section at this bar"
      >
        End
      </button>
    </div>
    {activeRepeat !== undefined && (
      <div className="control-group">
        <span className="eyebrow">Plays</span>
        <Stepper
          decrementLabel="Play the section one time fewer"
          incrementLabel="Play the section one time more"
          onDecrement={() => setRepeatEnd(activeRepeat - 1)}
          onIncrement={() => setRepeatEnd(activeRepeat + 1)}
          canDecrement={activeRepeat > MIN_REPEAT}
          canIncrement={activeRepeat < MAX_REPEAT}
        >
          <output className="stepper-value">×{activeRepeat}</output>
        </Stepper>
      </div>
    )}
    <div className="popover-divider" />
    <button type="button" className="btn" onClick={addMeasure}>Add measure at end</button>
    <button type="button" className="btn" onClick={insertMeasureAfterActive}>Insert measure after</button>
    <button type="button" className="btn" onClick={duplicateActiveMeasure}>Duplicate measure</button>
    <button type="button" className="btn btn-danger" onClick={deleteActiveMeasure}>Delete measure</button>
  </MenuButton>
);

const EditMenu = ({
  open, onToggle, undo, redo, canUndo, canRedo, copySelection, cutSelection, pasteClipboard, canPaste,
  activeBeatIndex, insertBeatAfterActive, deleteActiveBeat,
}: EditMenuProps & MenuState) => (
  <MenuButton
    label="Edit"
    icon={(
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    )}
    open={open}
    onToggle={onToggle}
    placement="up"
  >
    <span className="eyebrow">History</span>
    <div className="control-group">
      <button type="button" className="btn" onClick={undo} disabled={!canUndo}>Undo</button>
      <button type="button" className="btn" onClick={redo} disabled={!canRedo}>Redo</button>
    </div>
    <div className="popover-divider" />
    <span className="eyebrow">Clipboard</span>
    <div className="control-group">
      <button type="button" className="btn" onClick={copySelection}>Copy</button>
      <button type="button" className="btn" onClick={cutSelection}>Cut</button>
      <button type="button" className="btn" onClick={pasteClipboard} disabled={!canPaste}>Paste</button>
    </div>
    <div className="popover-divider" />
    <span className="eyebrow">Beat {activeBeatIndex + 1}</span>
    <button type="button" className="btn" onClick={insertBeatAfterActive}>Insert beat</button>
    <button type="button" className="btn btn-danger" onClick={deleteActiveBeat}>Delete beat</button>
  </MenuButton>
);

const ViewMenu = ({
  open, onToggle, partName, staffModes, display, grandStaff, canGrandStaff, pickStaffMode, addGrandStaff,
  leftHandWarning, panelName, showFretboard, toggleFretboard, isViewer, viewMode, toggleViewMode,
  showShortcuts,
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
    <span className="eyebrow">Staff — {partName}</span>
    <div className="control-group" role="group" aria-label="Staff">
      {staffModes.map(mode => (
        <button
          key={mode}
          type="button"
          className="btn"
          aria-pressed={display === mode && !grandStaff}
          onClick={() => pickStaffMode(mode)}
        >
          {STAFF_LABELS[mode]}
        </button>
      ))}
      {canGrandStaff && (
        <button
          type="button"
          className="btn"
          aria-pressed={grandStaff}
          onClick={addGrandStaff}
          title="Treble and bass clef, one track per hand: the notes below middle C move to a new left-hand track with its own rhythm"
        >
          Grand staff
        </button>
      )}
    </div>
    {leftHandWarning}
    <div className="popover-divider" />
    <button type="button" className="btn" aria-pressed={showFretboard} onClick={toggleFretboard}>
      {panelName}
    </button>
    {isViewer ? (
      <button type="button" className="btn" aria-pressed disabled>View only</button>
    ) : (
      <button type="button" className="btn" aria-pressed={viewMode} onClick={toggleViewMode}>Read-only</button>
    )}
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
  edit: EditMenuProps;
  view: ViewMenuProps;
}

/** The dock at the bottom: transport on the left, where the cursor is in the middle, menus on the right. */
export const CommandBar = ({
  openMenu, toggleMenu, readOnly, status, transport, playback, song, measure, edit, view,
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
            Stop
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={transport.startPlaybackFromCursor}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
        )}
        <TempoField {...transport} />
        <PlaybackMenu {...playback} {...menu('playback')} />
      </div>

      <p className="cmd-status" aria-live="polite">{status}</p>

      <div className="bottom-cluster">
        <SongMenu {...song} {...menu('song')} readOnly={readOnly} />
        {!readOnly && <MeasureMenu {...measure} {...menu('measure')} />}
        {!readOnly && <EditMenu {...edit} {...menu('edit')} />}
        <div className="toolbar-divider" />
        <ViewMenu {...view} {...menu('view')} />
      </div>
    </div>
  );
};
