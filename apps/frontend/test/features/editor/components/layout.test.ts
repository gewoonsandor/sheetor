import { describe, it, expect } from 'vitest';

import type { TabBeat, TabMeasure } from '../../../../src/features/editor/components/types';
import { alignBars, computeMeasureLayouts, scoreRowWidth, tabMarkLanes } from '../../../../src/features/editor/components/layout';

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

  it('lines up a hand playing triplets with one playing quarters on every shared beat', () => {
    const triplets: TabMeasure = {
      id: 't',
      beats: [
        ...Array.from({ length: 6 }, (_, i): TabBeat => ({ id: `t${i}`, duration: '8', tuplet: 3, notes: [] })),
        { id: 'h', duration: '2', notes: [] },
      ],
    };
    const { positions } = alignBars([triplets, bar(['4', '4', '2'])]);
    expect(positions[1]).toEqual([positions[0][0], positions[0][3], positions[0][6]]);
  });
});

describe('scoreRowWidth', () => {
  it('fits the card less the gutter, between the readable minimum and the full row', () => {
    expect(scoreRowWidth(2000)).toBe(980);
    expect(scoreRowWidth(500)).toBe(475);
    expect(scoreRowWidth(100)).toBe(320);
  });
});

describe('computeMeasureLayouts', () => {
  const widths = Array.from({ length: 10 }, () => alignBars([eighths]).minWidth);
  const conductor = widths.map((_, i) => ({ id: `m${i}`, beats: [] }));

  it('breaks a narrow row into more rows that each end inside it', () => {
    const wide = computeMeasureLayouts(widths, conductor, 0, [], 980);
    const narrow = computeMeasureLayouts(widths, conductor, 0, [], 400);
    const rows = (layouts: typeof wide) => new Set(layouts.map(l => l.row)).size;
    expect(rows(narrow)).toBeGreaterThan(rows(wide));
    for (const row of new Set(narrow.map(l => l.row))) {
      const inRow = narrow.filter(l => l.row === row);
      if (inRow[0].width > 400) continue;
      const last = inRow[inRow.length - 1];
      expect(last.x + last.width).toBeLessThanOrEqual(400 + 1e-9);
    }
  });
});

describe('tabMarkLanes', () => {
  // Extents up from the top string: a bend's label tops out at 22, a vibrato is its line ±1.5,
  // and a P.M. closing bar reaches 1 below the run's baseline.
  const vibrato = { vibrato: true };
  const bend = { bend: 2 as const };
  const palmMute = { palmMute: true };

  it('keeps bends, vibrato and palm mute apart, each above the one before', () => {
    const all = tabMarkLanes([palmMute, vibrato, bend]);
    expect(all.vibrato - 1.5).toBeGreaterThan(22);
    expect(all.run - 1).toBeGreaterThan(all.vibrato + 1.5);
    const noBend = tabMarkLanes([palmMute, vibrato]);
    expect(noBend.run - 1).toBeGreaterThan(noBend.vibrato + 1.5);
  });

  it('takes extra room only for a row that stacks more than every row leaves', () => {
    expect(tabMarkLanes([]).room).toBe(0);
    expect(tabMarkLanes([bend]).room).toBe(0);
    expect(tabMarkLanes([palmMute, vibrato]).room).toBe(0);
    expect(tabMarkLanes([palmMute, vibrato, bend]).room).toBeGreaterThan(tabMarkLanes([vibrato, bend]).room);
  });
});
