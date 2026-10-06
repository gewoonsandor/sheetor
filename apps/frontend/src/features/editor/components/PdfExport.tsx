import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Dialog } from '../../../app/Dialog';
import { STAFF_DISPLAYS, STAFF_LABELS } from './songUtils';
import type { StaffDisplay } from './types';
import type { PrintedPart, PrintPart } from '../printScore';

/** A part the dialog offers: its track, its name, and whether it is fretted (and so has a staff choice). */
export interface PdfPartOption {
  track: number;
  name: string;
  fretted: boolean;
  display: StaffDisplay;
}

/** Picks the parts to print, each on or off, and a fretted part's staves; every part starts checked. */
export const PdfExportDialog = ({ parts, onExport, onClose }: {
  parts: PdfPartOption[];
  onExport: (picked: PrintPart[]) => void;
  onClose: () => void;
}) => {
  const [picks, setPicks] = useState(() => parts.map(p => ({ track: p.track, on: true, display: p.display })));
  const picked = picks.filter(p => p.on).map(({ track, display }) => ({ track, display }));

  return (
    <Dialog title="Export PDF" onClose={onClose}>
      <p className="dialog-desc">
        Pick the parts to print; each starts on a new page. Choose Save as PDF in the print dialog that opens.
      </p>
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
        <button type="button" className="btn btn-primary" disabled={picked.length === 0} onClick={() => onExport(picked)}>
          Export PDF
        </button>
      </div>
    </Dialog>
  );
};

/**
 * The printed pages, straight under <body> so print CSS can hide everything else. Only
 * print media shows it, on light paper whatever the theme.
 */
export const PrintSheet = ({ title, artist, parts }: { title: string; artist: string; parts: PrintedPart[] }) =>
  createPortal(
    <div className="print-sheet" data-theme="light">
      {parts.map((part, i) => (
        <section key={i} className="print-part">
          <header className="print-header">
            <h1>{title}</h1>
            <p>{artist}</p>
            <h2>{part.name}</h2>
          </header>
          {part.rows.map((row, r) => (
            // Our own score, serialised by the browser, so its text is already escaped.
            <div key={r} className="print-row" dangerouslySetInnerHTML={{ __html: row }} />
          ))}
        </section>
      ))}
    </div>,
    document.body,
  );
