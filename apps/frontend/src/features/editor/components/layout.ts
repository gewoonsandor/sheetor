import type { Duration, TabMeasure, MLayout } from './types';
import { getDurationVal } from './songUtils';
export const SLOT_WIDTH = 22;

export const MIN_BEAT_WIDTH = 30;
export const MIN_16TH_WIDTH = 38;
export const MIN_32ND_WIDTH = 46;
export const MIN_MEASURE_WIDTH = 100;
export const MAX_ROW_WIDTH = 980;

/* How far a row may be stretched to fill the line, and how full the final row
   must be before it is stretched at all. */
export const MAX_JUSTIFY_STRETCH = 1.5;
export const MIN_JUSTIFY_FILL = 0.62;

export const TAB_STAFF_TOP = 90;
// With the notation staff hidden the TAB takes its place at the top of the row,
// keeping just enough room above it for the P.M. / let ring marks.
export const TAB_ONLY_STAFF_TOP = 20;
export const getTabStaffTop = (includeNotation: boolean): number =>
  includeNotation ? TAB_STAFF_TOP : TAB_ONLY_STAFF_TOP;
export const TAB_STAFF_HEIGHT_PX = 10; // pixels per string line
export const TAB_FRET_FONT_SIZE = TAB_STAFF_HEIGHT_PX * 0.9;

export const getBeatMinContribution = (duration: Duration): number => {
  if (duration === '16') return MIN_16TH_WIDTH;
  if (duration === '32') return MIN_32ND_WIDTH;
  return MIN_BEAT_WIDTH;
};

/**
 * Spaces bars drawn one above another, a grand staff's two hands, on the rhythm
 * they share: each beat sits where its onset falls, spaced by the square root of
 * the time to the next onset in any of them, so notes struck together line up.
 * `positions[bar][beat]` runs 0..1 across the bar; a bar alone spaces as it always
 * has, and a lone onset is centred.
 */
export const alignBars = (bars: TabMeasure[]): { positions: number[][]; minWidth: number } => {
  // Onsets are sums of dyadic durations, so they compare exactly as map keys.
  const onsets = bars.map(bar => {
    let at = 0;
    return bar.beats.map(b => {
      const start = at;
      at += getDurationVal(b.duration, b.dot);
      return start;
    });
  });
  const room = new Map<number, number>();
  let end = 0;
  bars.forEach((bar, i) => bar.beats.forEach((b, j) => {
    const at = onsets[i][j];
    room.set(at, Math.max(room.get(at) ?? 0, getBeatMinContribution(b.duration)));
    end = Math.max(end, at + getDurationVal(b.duration, b.dot));
  }));
  const times = [...room.keys()].sort((a, b) => a - b);
  const offsets = new Map<number, number>();
  let total = 0;
  times.forEach((at, k) => {
    offsets.set(at, total);
    total += Math.sqrt((times[k + 1] ?? end) - at);
  });
  return {
    positions: onsets.map(list => list.map(at => (times.length === 1 ? 0.5 : (offsets.get(at) ?? 0) / total))),
    minWidth: [...room.values()].reduce((sum, w) => sum + w, 0),
  };
};

export const FRETBOARD_STRING_TOP = 20;
export const FRETBOARD_STRING_BOTTOM = 20;
export const FRETBOARD_STRING_GAP = 24;

export const STEM_TOP_PAD = 25;

// With the TAB staff hidden there's no fret-number block to reserve room for —
// just the standard staff (bottom line at y=50) plus clearance for ledger lines.
// Lower notes grow the row through the same per-row shift that pushes the TAB down.
const NOTATION_ONLY_CLEARANCE = 30;

/** Where a grand staff's bass staff starts below the treble staff's origin: four spaces between them. */
export const GRAND_BASS_TOP = 80;

export const computeRowHeight = (
  stringCount: number,
  includeTab: boolean = true,
  includeNotation: boolean = true,
  grandStaff: boolean = false,
): number => {
  if (!includeTab) {
    return STEM_TOP_PAD + (grandStaff ? GRAND_BASS_TOP : 0) + 50 + NOTATION_ONLY_CLEARANCE;
  }
  const tabStaffHeight = stringCount * 10;
  return STEM_TOP_PAD + getTabStaffTop(includeNotation) + tabStaffHeight + 30;
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

/** Room a ‖: sign takes before a bar's first beat. */
export const REPEAT_PADDING = 16;

/** A row's clef and time signature, then room for an accidental on its first note. */
const ROW_START_PADDING = 78;

/** Room a smaller clef takes where a staff changes clef partway through a row. */
export const CLEF_CHANGE_ROOM = 24;

/**
 * `widths` is each bar's content width (`alignBars`); metre and repeat marks come from the
 * conductor. `keyRoom` is what the key signature adds to the clef area at the start of every row;
 * `clefChanges` marks the bars where some staff changes clef, which reprint the clefs and the key
 * signature there, unless the bar opens a row and already shows them.
 */
export const computeMeasureLayouts = (
  widths: number[],
  conductor: TabMeasure[],
  keyRoom: number = 0,
  clefChanges: boolean[] = [],
): MLayout[] => {
  const infos = widths.map((contentWidth, i) => {
    const marks = conductor[i];
    return {
      contentWidth,
      // Only a metre takes room on the staff; a tempo mark sits above it.
      metreRoom: marks?.timeSignature ? 28 : 0,
      repeatRoom: marks?.repeatStart ? REPEAT_PADDING : 0,
      clefRoom: clefChanges[i] ? CLEF_CHANGE_ROOM + keyRoom : 0,
    };
  });

  const layouts: MLayout[] = [];
  let curRow = 0;
  let curX = 0;

  for (let i = 0; i < infos.length; i++) {
    const { contentWidth, metreRoom, repeatRoom, clefRoom } = infos[i];
    const isFirstInRow = curX === 0;
    const padding = (isFirstInRow ? ROW_START_PADDING + keyRoom : 18 + metreRoom + clefRoom) + repeatRoom;
    const totalWidth = padding + contentWidth + 20;

    if (!isFirstInRow && curX + totalWidth > MAX_ROW_WIDTH) {
      curRow++;
      curX = 0;
      const newPadding = ROW_START_PADDING + keyRoom + repeatRoom;
      const newTotalWidth = newPadding + contentWidth + 20;
      layouts.push({ row: curRow, x: 0, width: Math.max(newTotalWidth, MIN_MEASURE_WIDTH), padding: newPadding });
      curX = Math.max(newTotalWidth, MIN_MEASURE_WIDTH);
    } else {
      layouts.push({ row: curRow, x: curX, width: Math.max(totalWidth, MIN_MEASURE_WIDTH), padding });
      curX += Math.max(totalWidth, MIN_MEASURE_WIDTH);
    }
  }

  // Second pass: justify each row to the full line width. A final row that is
  // barely started stays at its natural width — engravers leave the last
  // system short rather than blowing one bar up across the page.
  const rowTotals = new Map<number, number>();
  layouts.forEach(l => {
    rowTotals.set(l.row, (rowTotals.get(l.row) || 0) + l.width);
  });

  rowTotals.forEach((totalRowWidth, row) => {
    if (totalRowWidth >= MAX_ROW_WIDTH) return;
    if (row === curRow && totalRowWidth < MAX_ROW_WIDTH * MIN_JUSTIFY_FILL) return;

    const rowLayouts = layouts.filter(l => l.row === row);
    const factor = Math.min(MAX_ROW_WIDTH / totalRowWidth, MAX_JUSTIFY_STRETCH);
    // Anything the stretch cap leaves over is shared out, never dumped on the
    // last bar of the row.
    const share = Math.max(0, MAX_ROW_WIDTH - totalRowWidth * factor) / rowLayouts.length;
    let newX = 0;
    rowLayouts.forEach(l => {
      l.x = newX;
      l.width = l.width * factor + share;
      newX += l.width;
    });
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

// Piano keyboard (sheet-only mode): the playable pitch range is whatever the
// current tuning can reach, so the keys always match what the guitar can voice.
const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

export const isWhiteKey = (midi: number): boolean =>
  WHITE_PITCH_CLASSES.includes(((midi % 12) + 12) % 12);

export const computeKeyboardRange = (tuning: number[], maxFret: number): number[] => {
  const low = Math.min(...tuning);
  const high = Math.max(...tuning) + maxFret;
  const keys: number[] = [];
  // Start on a white key so the leftmost edge of the keyboard isn't a stray black key.
  let start = low;
  while (!isWhiteKey(start)) start--;
  for (let midi = start; midi <= high; midi++) keys.push(midi);
  return keys;
};
