import { describe, it, expect } from 'vitest';

import { mergeLayouts } from '../../../src/features/editor/printScore';

describe('mergeLayouts', () => {
  it('gives every bar the room its widest part needs, and every mark any part has', () => {
    const merged = mergeLayouts([
      { widths: [100, 40], marks: [{ timeSignature: { numerator: 3, denominator: 4 } }, {}], keyRoom: 0, clefChanges: [false, false] },
      { widths: [60, 90], marks: [{}, { repeatStart: true }], keyRoom: 18, clefChanges: [false, true] },
    ]);
    expect(merged).toEqual({
      widths: [100, 90],
      marks: [
        { timeSignature: { numerator: 3, denominator: 4 }, repeatStart: false },
        { timeSignature: undefined, repeatStart: true },
      ],
      keyRoom: 18,
      clefChanges: [false, true],
    });
  });
});
