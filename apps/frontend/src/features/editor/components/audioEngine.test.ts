import { describe, it, expect } from 'vitest';

import { createGuitarBuffer } from './audioEngine';

const stubContext = (): AudioContext => ({
  sampleRate: 44100,
  createBuffer: (_channels: number, length: number) => ({
    length,
    getChannelData: () => new Float32Array(length),
  }),
} as unknown as AudioContext);

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
