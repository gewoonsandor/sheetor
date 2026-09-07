import { describe, it, expect } from 'vitest';

import type { InstrumentId } from './types';
import { INSTRUMENTS, createGuitarBuffer, getVoice } from './audioEngine';

const stubContext = (): AudioContext => ({
  sampleRate: 44100,
  createBuffer: (_channels: number, length: number) => ({
    length,
    getChannelData: () => new Float32Array(length),
  }),
} as unknown as AudioContext);

// Records what a voice builds so we can assert it wired itself up without
// needing a real Web Audio implementation.
const makeParam = () => ({ setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });

const makeVoiceContext = () => {
  const connections: unknown[] = [];
  const started: number[] = [];
  const node = () => ({ connect: (target: unknown) => connections.push(target) });
  const ctx = {
    sampleRate: 44100,
    createBuffer: (_c: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ ...node(), buffer: null, start: (t: number) => started.push(t) }),
    createGain: () => ({ ...node(), gain: makeParam() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: makeParam(), Q: makeParam() }),
    createOscillator: () => ({
      ...node(), type: '', frequency: makeParam(), detune: makeParam(),
      start: (t: number) => started.push(t), stop: () => {},
    }),
  } as unknown as AudioContext;
  const destination = { id: 'dest' } as unknown as AudioNode;
  return { ctx, destination, connections, started };
};

describe('createGuitarBuffer', () => {
  it('sizes the buffer from sample rate and duration', () => {
    expect(createGuitarBuffer(stubContext(), 440, 0.5).length).toBe(22050);
  });

  it('returns one frame of silence instead of throwing on a NaN frequency', () => {
    expect(createGuitarBuffer(stubContext(), NaN, 1).length).toBe(1);
  });

  it('rejects a non-positive frequency', () => {
    expect(createGuitarBuffer(stubContext(), 0, 1).length).toBe(1);
    expect(createGuitarBuffer(stubContext(), -440, 1).length).toBe(1);
  });

  it('rejects a non-finite or non-positive duration', () => {
    expect(createGuitarBuffer(stubContext(), 440, NaN).length).toBe(1);
    expect(createGuitarBuffer(stubContext(), 440, 0).length).toBe(1);
  });

  it('never asks for a fractional frame count', () => {
    const length = createGuitarBuffer(stubContext(), 440, 0.5000001).length;
    expect(Number.isInteger(length)).toBe(true);
    expect(length).toBe(22050);
  });
});

describe('instrument voices', () => {
  const ids = Object.keys(INSTRUMENTS) as InstrumentId[];

  it('covers every instrument id with a label and a builder', () => {
    expect(ids).toContain('guitar');
    expect(ids).toContain('piano');
    expect(ids).toContain('trumpet');
    for (const id of ids) {
      expect(typeof INSTRUMENTS[id].label).toBe('string');
      expect(typeof INSTRUMENTS[id].build).toBe('function');
    }
  });

  it('schedules every voice without throwing and reaches the destination', () => {
    for (const id of ids) {
      const { ctx, destination, connections, started } = makeVoiceContext();
      INSTRUMENTS[id].build({ ctx, frequency: 440, time: 0, duration: 0.5, destination });
      expect(started.length, `${id} started no source`).toBeGreaterThan(0);
      expect(connections, `${id} never reached the destination`).toContain(destination);
    }
  });

  it('falls back instead of throwing on an unknown instrument', () => {
    expect(getVoice('kazoo')).toBe(INSTRUMENTS.sine.build);
    expect(getVoice('piano')).toBe(INSTRUMENTS.piano.build);
  });

  it('ignores a NaN frequency rather than scheduling a broken oscillator', () => {
    const { ctx, destination, started } = makeVoiceContext();
    INSTRUMENTS.piano.build({ ctx, frequency: NaN, time: 0, duration: 0.5, destination });
    expect(started).toHaveLength(0);
  });
});
