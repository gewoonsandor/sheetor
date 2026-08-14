import { useEffect, useRef, useState } from 'react';

import type { BeatPosition, TabBeat, TabSong } from './types';
import { createGuitarBuffer } from './audioEngine';
import { firstBeatPosition, getBeatDurationInSeconds, getEffectiveBpm, nextBeatPosition } from './songUtils';

const LOOKAHEAD_SECONDS = 0.1;
const START_DELAY_SECONDS = 0.05;

export interface PlaybackSettings {
  song: TabSong;
  tuning: number[];
  volume: number;
  synthType: string;
  loop: boolean;
  speed: number;
}

export interface PlaybackController {
  isPlaying: boolean;
  playbackBeat: BeatPosition | null;
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

  const settingsRef = useRef<PlaybackSettings>(settings);
  const onCursorMoveRef = useRef<(position: BeatPosition) => void>(onCursorMove);
  useEffect(() => {
    settingsRef.current = settings;
    onCursorMoveRef.current = onCursorMove;
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const positionRef = useRef<BeatPosition>({ measureIndex: 0, beatIndex: 0 });
  const nextBeatTimeRef = useRef<number>(0);
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

  const scheduleVoice = (ctx: AudioContext, freq: number, time: number, duration: number, gain: GainNode): void => {
    const { synthType } = settingsRef.current;
    if (synthType === 'guitar') {
      const source = ctx.createBufferSource();
      source.buffer = createGuitarBuffer(ctx, freq, duration + 0.5); // sustain window
      source.connect(gain);
      source.start(time);
      return;
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = synthType as OscillatorType;
    osc.frequency.setValueAtTime(freq, time);

    // ADSR envelope
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(0.2, time + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.01);

    osc.connect(gainNode);
    gainNode.connect(gain);
    osc.start(time);
    osc.stop(time + duration);
  };

  const playBeat = (beat: TabBeat, time: number, bpm: number): void => {
    if (beat.isRest || beat.notes.length === 0) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const { tuning, volume, speed } = settingsRef.current;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, time);
    masterGain.connect(ctx.destination);

    const duration = getBeatDurationInSeconds(beat.duration, beat.dot, bpm) / speed;
    beat.notes.forEach(note => {
      // A note stranded above the current string count has no open pitch.
      const openPitch = tuning[note.stringIndex];
      if (openPitch === undefined) return;
      const midi = openPitch + note.fret;
      if (!Number.isFinite(midi)) return;
      scheduleVoice(ctx, midiToFrequency(midi), time, duration, masterGain);
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
  };

  const start = (from: BeatPosition): void => {
    if (isPlayingRef.current) return;

    const { song } = settingsRef.current;
    const requested = song.measures[from.measureIndex]?.beats[from.beatIndex]
      ? from
      : firstBeatPosition(song);
    if (!requested) return;

    const ctx = ensureContext();
    setIsPlaying(true);
    isPlayingRef.current = true;
    positionRef.current = requested;
    nextBeatTimeRef.current = ctx.currentTime + START_DELAY_SECONDS;
    setPlaybackBeat(requested);

    const scheduleAhead = (): void => {
      if (!isPlayingRef.current) return;

      while (nextBeatTimeRef.current < ctx.currentTime + LOOKAHEAD_SECONDS) {
        const current = settingsRef.current;
        const position = positionRef.current;
        const beat = current.song.measures[position.measureIndex]?.beats[position.beatIndex];
        if (!beat) {
          // The song shrank underneath us; resync or give up.
          const resync = firstBeatPosition(current.song);
          if (!resync || !current.loop) {
            stop();
            return;
          }
          positionRef.current = resync;
          continue;
        }

        const bpm = getEffectiveBpm(current.song, position.measureIndex);
        const schedTime = nextBeatTimeRef.current;
        playBeat(beat, schedTime, bpm);

        const timerId = window.setTimeout(() => {
          if (!isPlayingRef.current) return;
          setPlaybackBeat(position);
          onCursorMoveRef.current(position);
        }, Math.max(0, (schedTime - ctx.currentTime) * 1000));
        cursorTimersRef.current.push(timerId);

        nextBeatTimeRef.current += getBeatDurationInSeconds(beat.duration, beat.dot, bpm) / current.speed;

        const next = nextBeatPosition(current.song, position, current.loop);
        if (!next) {
          stop();
          return;
        }
        positionRef.current = next;
      }

      rafIdRef.current = requestAnimationFrame(scheduleAhead);
    };

    rafIdRef.current = requestAnimationFrame(scheduleAhead);
  };

  // Single pitch preview for the virtual fretboard and note clicks.
  const playTone = (midi: number): void => {
    if (!Number.isFinite(midi)) return;
    const ctx = ensureContext();
    const { volume } = settingsRef.current;
    const time = ctx.currentTime;
    const duration = 0.8;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume * 0.7, time);
    masterGain.connect(ctx.destination);

    scheduleVoice(ctx, midiToFrequency(midi), time, duration, masterGain);
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

  return { isPlaying, playbackBeat, start, stop, playTone };
};
