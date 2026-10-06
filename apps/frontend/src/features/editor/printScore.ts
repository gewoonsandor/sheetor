import type { StaffDisplay, TabMeasure } from './components/types';

/** What `computeMeasureLayouts` spaces a part's bars from, besides the row width. */
export interface LayoutArgs {
  widths: number[];
  marks: Pick<TabMeasure, 'timeSignature' | 'repeatStart'>[];
  keyRoom: number;
  clefChanges: boolean[];
}

/**
 * One part as a PDF prints it: its track (the upper hand of a grand staff) and the staves it
 * shows; `layout` replaces its own spacing, so parts printed together break and bar alike.
 */
export interface PrintPart {
  track: number;
  display: StaffDisplay;
  layout?: LayoutArgs;
}

/** Whether the parts print one after the other, or a line of every part at a time like a score. */
export type PrintArrangement = 'separate' | 'merged';

/**
 * Spacing every part fits in: each bar as wide as its widest part, every mark and clef change
 * any part has, and the widest key signature, so all parts break into rows at the same bars.
 */
export const mergeLayouts = (parts: LayoutArgs[]): LayoutArgs => ({
  widths: parts[0].widths.map((_, i) => Math.max(...parts.map(p => p.widths[i] ?? 0))),
  marks: parts[0].marks.map((_, i) => ({
    timeSignature: parts.find(p => p.marks[i]?.timeSignature)?.marks[i].timeSignature,
    repeatStart: parts.some(p => p.marks[i]?.repeatStart),
  })),
  keyRoom: Math.max(...parts.map(p => p.keyRoom)),
  clefChanges: parts[0].clefChanges.map((_, i) => parts.some(p => p.clefChanges[i])),
});

/** A printed part: its name and its score cut into rows, each a standalone `<svg>`. */
export interface PrintedPart {
  name: string;
  rows: string[];
}

/** What only the editor shows: the cursor, the selection, playback, warnings, collaborators, click targets and inputs. */
const EDITOR_ONLY = [
  '.selection-ring', '.selection-range', '.cursor-ring', '.playback-line', '.measure-wash',
  '.measure-warning-text', '.peer-cursor', '.peer-label', '.svg-interactive-bg', '.mark-hit', 'foreignObject',
].join(', ');

/**
 * The score as it is drawn now, cut at `data-row-ends` into one `<svg>` per row, so a
 * page break never runs through a row. Editor-only marks are stripped from each copy.
 */
export const scoreRows = (svg: SVGSVGElement): string[] => {
  const [x, , width] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  const ends = (svg.dataset.rowEnds ?? '').split(' ').map(Number).filter(n => n > 0);
  const clean = svg.cloneNode(true) as SVGSVGElement;
  clean.querySelectorAll(EDITOR_ONLY).forEach(el => el.remove());
  clean.querySelectorAll('.is-selected, .active-note').forEach(el => el.classList.remove('is-selected', 'active-note'));
  clean.removeAttribute('data-row-ends');
  clean.removeAttribute('data-layout');
  // ponytail: every row carries the whole score and shows its band through the viewBox, so the print
  // DOM grows with rows²; prune each copy to its band if long scores print slowly.
  return ends.map((end, i) => {
    const top = i === 0 ? 0 : ends[i - 1];
    clean.setAttribute('viewBox', `${x} ${top} ${width} ${end - top}`);
    return clean.outerHTML;
  });
};
