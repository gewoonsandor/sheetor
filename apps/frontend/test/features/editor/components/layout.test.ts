import { describe, it, expect } from 'vitest';

import type { TabBeat, TabMeasure } from '../../../../src/features/editor/components/types';
import { alignBars } from '../../../../src/features/editor/components/layout';

const bar = (durations: TabBeat['duration'][]): TabMeasure => ({
  id: 'm',
  beats: durations.map((duration, i) => ({ id: `b${i}`, duration, notes: [] })),
});

const eighths = bar(['8', '8', '8', '8', '8', '8', '8', '8']);

describe('alignBars', () => {
  it('spaces a bar alone by the square root of each beat and centres a lone beat', () => {
    const total = Math.SQRT2 + 2;
    const expected = [0, Math.SQRT2 / total, (Math.SQRT2 + 1) / total];
    alignBars([bar(['2', '4', '4'])]).positions[0].forEach((at, i) => expect(at).toBeCloseTo(expected[i]));
    expect(alignBars([bar(['1'])]).positions).toEqual([[0.5]]);
  });

  it('lines up beats struck together in two rhythms and adds room only for new onsets', () => {
    const { positions, minWidth } = alignBars([eighths, bar(['2', '2'])]);
    expect(positions[1]).toEqual([positions[0][0], positions[0][4]]);
    expect(minWidth).toBe(alignBars([eighths]).minWidth);
  });
});
