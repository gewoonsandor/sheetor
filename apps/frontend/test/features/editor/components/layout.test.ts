import { describe, it, expect } from 'vitest';

import type { TabBeat, TabMeasure } from '../../../../src/features/editor/components/types';
import {
  alignBars, computeMeasureLayouts, marksTop, runHeight, scoreRowWidth, TAB_MARK_ROOM, vibratoHeight,
} from '../../../../src/features/editor/components/layout';

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
  const conductor = widths.map(() => ({ repeatStart: false }));

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

describe('marks over the TAB', () => {
  // A vibrato is its line ±1.5; a P.M. closing bar reaches 1 below the run's baseline.
  const vibrato = { vibrato: true };
  const bend = { bend: 2 as const };

  it("raises a vibrato over its own beat's bend, and only then", () => {
    expect(vibratoHeight([vibrato, bend]) - 1.5).toBeGreaterThan(marksTop([bend]));
    expect(vibratoHeight([vibrato]) + 1.5).toBeLessThan(marksTop([bend]));
  });

  it('puts a palm mute line clear of the marks under it, lower where they are lower', () => {
    for (const notes of [[], [vibrato], [bend], [vibrato, bend]]) {
      expect(runHeight(marksTop(notes)) - 1).toBeGreaterThan(marksTop(notes));
    }
    expect(runHeight(marksTop([vibrato]))).toBeLessThan(runHeight(marksTop([bend])));
  });

  it('fits a bend, or a vibrato under palm mute, in the room every row leaves', () => {
    expect(marksTop([bend])).toBeLessThanOrEqual(TAB_MARK_ROOM);
    expect(runHeight(marksTop([vibrato])) + 7).toBeLessThanOrEqual(TAB_MARK_ROOM);
  });
});
