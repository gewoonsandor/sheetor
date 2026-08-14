import type { Duration, TabMeasure, MLayout } from './types';
import { getDurationVal } from './songUtils';
export const SLOT_WIDTH = 22;

export const MIN_BEAT_WIDTH = 30;
export const MIN_16TH_WIDTH = 38;
export const MIN_32ND_WIDTH = 46;
export const MIN_MEASURE_WIDTH = 100;
export const MAX_ROW_WIDTH = 980;

export const TAB_STAFF_TOP = 90;
export const TAB_STAFF_HEIGHT_PX = 10; // pixels per string line

export const getBeatMinContribution = (duration: Duration): number => {
  if (duration === '16') return MIN_16TH_WIDTH;
  if (duration === '32') return MIN_32ND_WIDTH;
  return MIN_BEAT_WIDTH;
};

export const computeMeasureContentWidth = (beats: { duration: Duration }[]): number => {
  return beats.reduce((acc, b) => acc + getBeatMinContribution(b.duration), 0);
};

export const FRETBOARD_STRING_TOP = 20;
export const FRETBOARD_STRING_BOTTOM = 20;
export const FRETBOARD_STRING_GAP = 24;

export const STEM_TOP_PAD = 25;

export const computeRowHeight = (stringCount: number): number => {
  const tabStaffHeight = stringCount * 10;
  return STEM_TOP_PAD + TAB_STAFF_TOP + tabStaffHeight + 30;
};

export const computeFretboardStringSpan = (stringCount: number): number =>
  (stringCount - 1) * FRETBOARD_STRING_GAP;

export const computeFretboardNeckHeight = (stringCount: number): number => {
  const span = computeFretboardStringSpan(stringCount);
  return FRETBOARD_STRING_TOP + span + FRETBOARD_STRING_BOTTOM;
};

export const getFretboardStringY = (stringIdx: number, stringCount: number): number => {
  if (stringCount <= 1) return FRETBOARD_STRING_TOP + computeFretboardStringSpan(stringCount) / 2;
  return FRETBOARD_STRING_TOP + stringIdx * FRETBOARD_STRING_GAP;
};

export const computeMeasureLayouts = (measures: TabMeasure[]): MLayout[] => {
  const infos = measures.map((measure) => {
    const contentWidth = computeMeasureContentWidth(measure.beats);
    return {
      contentWidth,
      hasTimingChange: !!(measure?.bpm || measure?.timeSignature),
    };
  });

  const layouts: MLayout[] = [];
  let curRow = 0;
  let curX = 0;

  for (let i = 0; i < infos.length; i++) {
    const { contentWidth, hasTimingChange } = infos[i];
    const isFirstInRow = curX === 0;
    const padding = isFirstInRow ? 70 : (hasTimingChange ? 46 : 18);
    const totalWidth = padding + contentWidth + 20;

    if (!isFirstInRow && curX + totalWidth > MAX_ROW_WIDTH) {
      curRow++;
      curX = 0;
      const newPadding = 70;
      const newTotalWidth = newPadding + contentWidth + 20;
      layouts.push({ row: curRow, x: 0, width: Math.max(newTotalWidth, MIN_MEASURE_WIDTH), padding: newPadding });
      curX = Math.max(newTotalWidth, MIN_MEASURE_WIDTH);
    } else {
      layouts.push({ row: curRow, x: curX, width: Math.max(totalWidth, MIN_MEASURE_WIDTH), padding });
      curX += Math.max(totalWidth, MIN_MEASURE_WIDTH);
    }
  }

  // Second pass: stretch measures within each row to fill MAX_ROW_WIDTH
  const rowTotals = new Map<number, number>();
  layouts.forEach(l => {
    rowTotals.set(l.row, (rowTotals.get(l.row) || 0) + l.width);
  });

  rowTotals.forEach((totalRowWidth, row) => {
    if (totalRowWidth >= MAX_ROW_WIDTH) return;
    const factor = Math.min(MAX_ROW_WIDTH / totalRowWidth, 1.5);
    const rowLayouts = layouts.filter(l => l.row === row);
    let newX = 0;
    rowLayouts.forEach(l => {
      const stretched = l.width * factor;
      l.x = newX;
      l.width = stretched;
      newX += stretched;
    });
    // Give remaining space to the last measure on the row so the line fills
    if (newX < MAX_ROW_WIDTH) {
      const last = rowLayouts[rowLayouts.length - 1];
      last.width += MAX_ROW_WIDTH - newX;
    }
  });

  return layouts;
};

export const checkMeasureBeats = (measure: TabMeasure, measureIndex: number, getEffectiveTimeSignature: (idx: number) => { numerator: number; denominator: number }) => {
  const actual = measure.beats.reduce((acc, b) => acc + getDurationVal(b.duration, b.dot), 0);
  const timeSignature = getEffectiveTimeSignature(measureIndex);
  const expected = timeSignature.numerator * (4 / timeSignature.denominator);
  return {
    isValid: Math.abs(actual - expected) < 0.001,
    actual,
    expected
  };
};

// Virtual fretboard logarithmic layout
export const FRET_COUNT = 15;
const scaleFactor = 1 - Math.pow(2, -FRET_COUNT / 12);

export const getFretLeftPercentage = (fret: number): number => {
  return (1 - Math.pow(2, -fret / 12)) / scaleFactor * 100;
};

export const getFretCellLeft = (fret: number): number => {
  return fret === 0 ? 0 : getFretLeftPercentage(fret);
};

export const getFretCellWidth = (fret: number): number => {
  return getFretLeftPercentage(fret + 1) - getFretLeftPercentage(fret);
};
