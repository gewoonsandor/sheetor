import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Dialog } from '../../../app/Dialog';
import { STAFF_DISPLAYS, STAFF_LABELS } from './songUtils';
import type { StaffDisplay } from './types';
import type { PrintArrangement, PrintedPart, PrintPart } from '../printScore';

const ARRANGEMENTS: [PrintArrangement, string][] = [['separate', 'Separate'], ['merged', 'Merged']];

/** A part the dialog offers: its track, its name, and whether it is fretted (and so has a staff choice). */
export interface PdfPartOption {
  track: number;
  name: string;
  fretted: boolean;
  display: StaffDisplay;
}

/**
 * Picks the parts to print, each on or off, and a fretted part's staves, and whether they print one after
 * another or merged into lines of every part; every part starts checked, printed separately.
 */
export const PdfExportDialog = ({ parts, onExport, onClose }: {
  parts: PdfPartOption[];
  onExport: (picked: PrintPart[], arrangement: PrintArrangement) => void;
  onClose: () => void;
}) => {
  const [picks, setPicks] = useState(() => parts.map(p => ({ track: p.track, on: true, display: p.display })));
  const [arrangement, setArrangement] = useState<PrintArrangement>('separate');
  const picked = picks.filter(p => p.on).map(({ track, display }) => ({ track, display }));

  return (
    <Dialog title="Export PDF" onClose={onClose}>
      <p className="dialog-desc">
        Separate prints each part on its own pages; merged prints a line of every part, then the next, like a score.
        Choose Save as PDF in the print dialog that opens.
      </p>
      <div className="control-group" role="group" aria-label="Arrangement">
        {ARRANGEMENTS.map(([value, label]) => (
          <button key={value} type="button" className="btn" aria-pressed={arrangement === value} onClick={() => setArrangement(value)}>
            {label}
          </button>
        ))}
      </div>
      <ul className="pdf-parts">
        {parts.map((part, i) => (
          <li key={part.track} className="pdf-part">
            <label className="pdf-part-name">
              <input
                type="checkbox"
                checked={picks[i].on}
                onChange={(e) => setPicks(prev => prev.map((p, j) => (j === i ? { ...p, on: e.target.checked } : p)))}
              />
              {part.name}
            </label>
            {part.fretted && (
              <div className="control-group" role="group" aria-label={`${part.name} staves`}>
                {STAFF_DISPLAYS.fretted.map(mode => (
                  <button
                    key={mode}
                    type="button"
                    className="btn btn-sm"
                    aria-pressed={picks[i].display === mode}
                    disabled={!picks[i].on}
                    onClick={() => setPicks(prev => prev.map((p, j) => (j === i ? { ...p, display: mode } : p)))}
                  >
                    {STAFF_LABELS[mode]}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="dialog-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={picked.length === 0}
          onClick={() => onExport(picked, arrangement)}
        >
          Export PDF
        </button>
      </div>
    </Dialog>
  );
};

/**
 * The printed pages, straight under <body> so print CSS can hide everything else. Only print
 * media shows it, on light paper whatever the theme. Separate parts each start a page under the
 * title; merged ones are dealt out a row of each at a time, named on the first line only.
 */
export const PrintSheet = ({ title, artist, arrangement, parts }: {
  title: string;
  artist: string;
  arrangement: PrintArrangement;
  parts: PrintedPart[];
}) => {
  const header = (name?: string) => (
    <header className="print-header">
      <h1>{title}</h1>
      <p>{artist}</p>
      {name && <h2>{name}</h2>}
    </header>
  );
  // Our own score, serialised by the browser, so its text is already escaped.
  const row = (svg: string, key: number) => <div key={key} className="print-row" dangerouslySetInnerHTML={{ __html: svg }} />;
  const lines = Math.max(...parts.map(p => p.rows.length));
  return createPortal(
    <div className="print-sheet" data-theme="light">
      {arrangement === 'separate' ? parts.map((part, i) => (
        <section key={i} className="print-part">
          {header(part.name)}
          {part.rows.map(row)}
        </section>
      )) : (
        <section className="print-part">
          {header()}
          {Array.from({ length: lines }, (_, line) => (
            <div key={line} className="print-system">
              {parts.map((part, i) => (
                <div key={i}>
                  {line === 0 && <p className="print-staff-name">{part.name}</p>}
                  {part.rows[line] !== undefined && row(part.rows[line], line)}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>,
    document.body,
  );
};
