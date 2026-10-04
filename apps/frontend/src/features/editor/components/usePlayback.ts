import { useEffect, useRef, useState } from 'react';

import type { BeatPosition, TabBeat, TabSong, TabTrack } from './types';
import { getVoice } from './audioEngine';
import {
  firstBeatPosition, beatSeconds, beatVelocities, DEFAULT_VELOCITY, getEffectiveBpm, isAudible,
  nextPlayPosition, resolveNoteMidi,
} from './songUtils';

const LOOKAHEAD_SECONDS = 0.1;
const START_DELAY_SECONDS = 0.05;

export interface PlaybackSettings {
  song: TabSong;
  volume: number;
  loop: boolean;
  speed: number;
  /** Only this track's beats drive the visual cursor. */
  activeTrackIndex: number;
  /** A grand staff's other hand, whose playing beat the keyboard shows too. */
  otherHandIndex: number | null;
}

// Each track walks its own beat list at its own rate; they stay locked because
// they share the conductor's tempo map and one AudioContext clock.
interface TrackCursor {
  position: BeatPosition;
  nextTime: number;
  done: boolean;
  /** Times each repeat end has been reached on this pass through the song. */
  passes: Map<number, number>;
}

export interface PlaybackController {
  isPlaying: boolean;
  playbackBeat: BeatPosition | null;
  /** The other hand's playing beat, while a grand staff plays. */
  otherHandBeat: BeatPosition | null;
  start: (from: BeatPosition) => void;
  stop: () => void;
  playTone: (midi: number) => void;
}

// Every setting is read through a ref that is refreshed after each render, so a
// song edit, volume move, tuning change or loop toggle takes effect on the next
// scheduled beat instead of being frozen at start() time.
export const usePlayback = (
  settings: PlaybackSettings,
  onCursorMove: (position: BeatPosition) => void,
): PlaybackController => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackBeat, setPlaybackBeat] = useState<BeatPosition | null>(null);
  const [otherHandBeat, setOtherHandBeat] = useState<BeatPosition | null>(null);

  const settingsRef = useRef<PlaybackSettings>(settings);
  const onCursorMoveRef = useRef<(position: BeatPosition) => void>(onCursorMove);
  useEffect(() => {
    settingsRef.current = settings;
    onCursorMoveRef.current = onCursorMove;
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const cursorsRef = useRef<TrackCursor[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const cursorTimersRef = useRef<number[]>([]);

  const ensureContext = (): AudioContext => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
      let Ctor: typeof AudioContext | undefined = window.AudioContext;
      if (!Ctor && 'webkitAudioContext' in window) {
        // Older Safari only exposes the prefixed constructor; it is the same API.
        Ctor = window.webkitAudioContext as typeof AudioContext;
      }
      if (!Ctor) throw new Error('Web Audio is not supported in this browser.');
      ctx = new Ctor();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  };

  const midiToFrequency = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

  /** `velocity` is the beat's dynamic as MIDI velocity; mf (80) plays at the track's own volume. */
  const playBeat = (beat: TabBeat, track: TabTrack, time: number, bpm: number, velocity: number): void => {
    if (beat.isRest || beat.notes.length === 0) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const { volume, speed } = settingsRef.current;
    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(volume * track.volume * velocity / DEFAULT_VELOCITY, time);
    trackGain.connect(ctx.destination);

    const build = getVoice(track.instrument);
    const duration = beatSeconds(beat, bpm) / speed;
    beat.notes.forEach(note => {
      // A fretted note stranded above the track's string count has no pitch.
      const midi = resolveNoteMidi(note, track);
      if (midi === undefined) return;
      build({ ctx, frequency: midiToFrequency(midi), time, duration, destination: trackGain });
    });
  };

  const clearCursorTimers = (): void => {
    for (const id of cursorTimersRef.current) clearTimeout(id);
    cursorTimersRef.current = [];
  };

  const stop = (): void => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    clearCursorTimers();
    setPlaybackBeat(null);
    setOtherHandBeat(null);
  };

  const start = (from: BeatPosition): void => {
    if (isPlayingRef.current) return;

    const { song, activeTrackIndex } = settingsRef.current;
    const activeMeasures = song.tracks[activeTrackIndex]?.measures ?? song.tracks[0]?.measures;
    if (!activeMeasures) return;

    const requested = activeMeasures[from.measureIndex]?.beats[from.beatIndex]
      ? from
      : firstBeatPosition(activeMeasures);
    if (!requested) return;

    const ctx = ensureContext();
    const startTime = ctx.currentTime + START_DELAY_SECONDS;

    // Every track starts at the same bar so they stay in step, even when the
    // cursor sat mid-bar on a track with a different rhythm.
    cursorsRef.current = song.tracks.map(track => {
      const position = track.measures[requested.measureIndex]?.beats[requested.beatIndex]
        ? requested
        : firstBeatPosition(track.measures);
      return position
        ? { position, nextTime: startTime, done: false, passes: new Map() }
        : { position: { measureIndex: 0, beatIndex: 0 }, nextTime: startTime, done: true, passes: new Map() };
    });

    setIsPlaying(true);
    isPlayingRef.current = true;
    setPlaybackBeat(requested);

    const scheduleAhead = (): void => {
      if (!isPlayingRef.current) return;

      const current = settingsRef.current;
      const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;
      let anyRunning = false;

      cursorsRef.current.forEach((cursor, trackIndex) => {
        const track = current.song.tracks[trackIndex];
        if (!track || cursor.done) return;

        while (!cursor.done && cursor.nextTime < horizon) {
          const beat = track.measures[cursor.position.measureIndex]?.beats[cursor.position.beatIndex];
          if (!beat) {
            // This track shrank underneath us; resync or retire it.
            const resync = firstBeatPosition(track.measures);
            if (!resync || !current.loop) {
              cursor.done = true;
              break;
            }
            cursor.position = resync;
            continue;
          }

          const bpm = getEffectiveBpm(current.song, cursor.position.measureIndex);
          const schedTime = cursor.nextTime;
          if (isAudible(track, current.song.tracks)) {
            // ponytail: every beat walks the whole track for its velocity; cache per measures array if songs grow long.
            const velocity = beatVelocities(track.measures)[cursor.position.measureIndex]?.[cursor.position.beatIndex] ?? DEFAULT_VELOCITY;
            playBeat(beat, track, schedTime, bpm, velocity);
          }

          // Only the active track moves the on-screen cursor; the other hand of a
          // grand staff is followed too, so the keyboard can light both hands.
          const followed = trackIndex === current.activeTrackIndex || trackIndex === current.otherHandIndex;
          if (followed) {
            const position = cursor.position;
            const active = trackIndex === current.activeTrackIndex;
            const timerId = window.setTimeout(() => {
              if (!isPlayingRef.current) return;
              if (!active) {
                setOtherHandBeat(position);
                return;
              }
              setPlaybackBeat(position);
              onCursorMoveRef.current(position);
            }, Math.max(0, (schedTime - ctx.currentTime) * 1000));
            cursorTimersRef.current.push(timerId);
          }

          cursor.nextTime += beatSeconds(beat, bpm) / current.speed;

          const next = nextPlayPosition(track.measures, cursor.position, current.loop, cursor.passes);
          if (!next) {
            cursor.done = true;
            break;
          }
          cursor.position = next;
        }

        if (!cursor.done) anyRunning = true;
      });

      if (!anyRunning) {
        // Everything is scheduled, up to the lookahead before it sounds: stop once the
        // last beat has ended, not now, or its pending cursor moves are cancelled.
        const end = Math.max(...cursorsRef.current.map(c => c.nextTime));
        rafIdRef.current = null;
        cursorTimersRef.current.push(window.setTimeout(stop, Math.max(0, (end - ctx.currentTime) * 1000)));
        return;
      }

      rafIdRef.current = requestAnimationFrame(scheduleAhead);
    };

    rafIdRef.current = requestAnimationFrame(scheduleAhead);
  };

  // Single pitch preview for the virtual fretboard, keyboard and note clicks.
  // Uses the active track's voice so the preview matches what will play back.
  const playTone = (midi: number): void => {
    if (!Number.isFinite(midi)) return;
    const ctx = ensureContext();
    const { volume, song, activeTrackIndex } = settingsRef.current;
    const track = song.tracks[activeTrackIndex] ?? song.tracks[0];
    const time = ctx.currentTime;
    const duration = 0.8;

    const previewGain = ctx.createGain();
    previewGain.gain.setValueAtTime(volume * (track?.volume ?? 1) * 0.7, time);
    previewGain.connect(ctx.destination);

    getVoice(track?.instrument ?? 'sine')({
      ctx, frequency: midiToFrequency(midi), time, duration, destination: previewGain,
    });
  };

  // Refs only, so the teardown needs no dependencies and never touches state
  // after unmount.
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      for (const id of cursorTimersRef.current) clearTimeout(id);
      cursorTimersRef.current = [];
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

  return { isPlaying, playbackBeat, otherHandBeat, start, stop, playTone };
};
