import React from 'react';

import type { TabTrack } from './types';
import { INSTRUMENTS } from './audioEngine';

interface TrackStripProps {
  tracks: TabTrack[];
  activeTrackIndex: number;
  onSelect: (index: number) => void;
  onToggleMute: (index: number) => void;
  onToggleSolo: (index: number) => void;
  onAddTrack: () => void;
  /** Opens the per-track settings popover for the active track. */
  onOpenSettings: () => void;
  settingsOpen: boolean;
  children?: React.ReactNode;
}

const staffLabel = (track: TabTrack): string => {
  if (track.display === 'tab') return 'tab';
  if (track.display === 'both') return 'notes + tab';
  if (track.display === 'grand') return 'grand staff';
  return 'notes';
};

/**
 * The score shows one track at a time; this strip is how you choose which, and
 * where each track's mute/solo live. Presentational only — every change is
 * handed back to the editor.
 */
export const TrackStrip: React.FC<TrackStripProps> = ({
  tracks, activeTrackIndex, onSelect, onToggleMute, onToggleSolo,
  onAddTrack, onOpenSettings, settingsOpen, children,
}) => {
  const anySoloed = tracks.some(t => t.soloed);

  return (
    <div className="sheetor-tracks">
      <div className="track-list" role="tablist" aria-label="Tracks">
        {tracks.map((track, index) => {
          const isActive = index === activeTrackIndex;
          // A track that is not soloed while another one is reads as silenced.
          const dimmed = track.muted || (anySoloed && !track.soloed);
          return (
            <div
              key={track.id}
              className={`track-chip ${isActive ? 'is-active' : ''} ${dimmed ? 'is-silent' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="track-chip-main"
                onClick={() => onSelect(index)}
                onDoubleClick={() => { onSelect(index); onOpenSettings(); }}
              >
                <span className="track-chip-name">{track.name}</span>
                <span className="track-chip-meta">
                  {INSTRUMENTS[track.instrument].label} · {staffLabel(track)}
                </span>
              </button>
              <div className="track-chip-toggles">
                <button
                  type="button"
                  className={`track-toggle ${track.muted ? 'is-muted' : ''}`}
                  onClick={() => onToggleMute(index)}
                  title={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
                  aria-pressed={!!track.muted}
                >M</button>
                <button
                  type="button"
                  className={`track-toggle ${track.soloed ? 'is-soloed' : ''}`}
                  onClick={() => onToggleSolo(index)}
                  title={track.soloed ? `Unsolo ${track.name}` : `Solo ${track.name}`}
                  aria-pressed={!!track.soloed}
                >S</button>
              </div>
            </div>
          );
        })}

        <button type="button" className="track-add" onClick={onAddTrack} title="Add a track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Track
        </button>
      </div>

      <div className="track-settings-anchor">
        <button
          type="button"
          className={`btn ${settingsOpen ? 'btn-active' : ''}`}
          onClick={onOpenSettings}
          title="Track settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
          Settings
        </button>
        {children}
      </div>
    </div>
  );
};

export default TrackStrip;
