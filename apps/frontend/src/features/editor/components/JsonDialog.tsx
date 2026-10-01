import { Dialog } from '../../../app/Dialog';

interface JsonDialogProps {
  modalOpen: 'import' | 'export';
  jsonText: string;
  setJsonText: (text: string) => void;
  modalStatus: string;
  copyToClipboard: () => void;
  downloadJsonFile: () => void;
  executeImport: () => void;
  onClose: () => void;
}

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/** The song as JSON: copy or download it, or paste one in to replace the open song. */
export const JsonDialog = ({
  modalOpen, jsonText, setJsonText, modalStatus, copyToClipboard, downloadJsonFile, executeImport, onClose,
}: JsonDialogProps) => (
  <Dialog title={modalOpen === 'export' ? 'Export song' : 'Import song'} onClose={onClose}>
    <p className="dialog-desc">
      {modalOpen === 'export'
        ? 'Copy this JSON to share your song, or download it as a file.'
        : 'Paste song JSON here, then import it. This replaces the song you have open.'}
    </p>

    <textarea
      className="control-input sheetor-modal-textarea"
      aria-label="Song JSON"
      value={jsonText}
      onChange={(e) => setJsonText(e.target.value)}
      readOnly={modalOpen === 'export'}
      placeholder='{ "title": "My Song", ... }'
    />

    {modalStatus && <p className="sheetor-modal-status" role="status">{modalStatus}</p>}

    <div className="dialog-footer">
      {modalOpen === 'export' ? (
        <>
          <button type="button" className="btn" onClick={copyToClipboard}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy JSON
          </button>
          <button type="button" className="btn btn-primary" onClick={downloadJsonFile}>
            <DownloadIcon />
            Download file
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-primary" onClick={executeImport}>
          <UploadIcon />
          Import song
        </button>
      )}
      <button type="button" className="btn" onClick={onClose}>Close</button>
    </div>
  </Dialog>
);
