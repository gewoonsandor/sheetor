import { describe, expect, it } from 'vitest';
import { readMidiKey } from '../../../src/features/editor/midiInput';

describe('readMidiKey', () => {
  it('groups keys held together into a chord and releases after the last one', () => {
    const held = new Set<number>();
    expect(readMidiKey(held, [0x90, 60, 80])).toEqual({ type: 'press', note: 60, chord: false });
    expect(readMidiKey(held, [0x93, 64, 80])).toEqual({ type: 'press', note: 64, chord: true });
    expect(readMidiKey(held, [0x80, 60, 0])).toBeNull();
    // Velocity 0 is a note-off.
    expect(readMidiKey(held, [0x90, 64, 0])).toEqual({ type: 'release' });
    expect(readMidiKey(held, [0x90, 67, 80])).toEqual({ type: 'press', note: 67, chord: false });
  });

  it('ignores other messages and releases of keys it never saw pressed', () => {
    const held = new Set<number>();
    expect(readMidiKey(held, [0xb0, 64, 127])).toBeNull(); // sustain pedal
    expect(readMidiKey(held, [0xf8])).toBeNull(); // clock
    expect(readMidiKey(held, [0x80, 60, 0])).toBeNull();
  });
});
