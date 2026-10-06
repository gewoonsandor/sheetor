import type { StaffDisplay } from './components/types';

/** One part as a PDF prints it: its track (the upper hand of a grand staff) and the staves it shows. */
export interface PrintPart {
  track: number;
  display: StaffDisplay;
}

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
  clean.removeAttribute('aria-hidden');
  // ponytail: every row carries the whole score and shows its band through the viewBox, so the print
  // DOM grows with rows²; prune each copy to its band if long scores print slowly.
  return ends.map((end, i) => {
    const top = i === 0 ? 0 : ends[i - 1];
    clean.setAttribute('viewBox', `${x} ${top} ${width} ${end - top}`);
    return clean.outerHTML;
  });
};
