import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { FALLBACK_MESSAGE } from '../../../app/http';
import { deriveInitials } from '../../user/userStore';
import { fetchShares, shareFolder, unshareFolder } from '../libraryApi';
import type { LibraryFolder, Share } from '../libraryStore';

type ShareRole = 'editor' | 'viewer';

const asShareRole = (value: string): ShareRole => (value === 'viewer' ? 'viewer' : 'editor');

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : FALLBACK_MESSAGE);

const RoleSelect = ({
  value,
  label,
  disabled,
  onChange,
}: {
  value: ShareRole;
  label: string;
  disabled: boolean;
  onChange: (role: ShareRole) => void;
}) => (
  <select
    className="control-select"
    aria-label={label}
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(asShareRole(event.target.value))}
  >
    <option value="editor">Can edit</option>
    <option value="viewer">Can view</option>
  </select>
);

/// Who a folder is shared with, and the form to change that. Only its owner opens it.
export const ShareDialog = ({ folder, onClose }: { folder: LibraryFolder; onClose: () => void }) => {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    fetchShares(folder.id).then(setShares, (err: unknown) => setError(messageOf(err)));
  }, [folder.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await action();
      setShares(await fetchShares(folder.id));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const invite = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run(async () => {
      await shareFolder(folder.id, email.trim(), role);
      setEmail('');
    });
  };

  return (
    <div className="sheetor-modal-backdrop" onClick={onClose}>
      <div
        className="sheetor-modal share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="sheetor-modal-header" id="share-title">
          <span>Share “{folder.name}”</span>
          <button className="sheetor-modal-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </h3>
        <p className="sheetor-modal-desc">
          Everyone you add can open everything inside this folder. Editors change songs with you
          live; viewers watch.
        </p>

        <form className="share-form" onSubmit={invite}>
          <input
            className="control-input"
            type="email"
            required
            placeholder="Email address"
            aria-label="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <RoleSelect value={role} label="Role" disabled={busy} onChange={setRole} />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Share
          </button>
        </form>

        {error !== null && (
          <p className="share-error" role="alert">
            {error}
          </p>
        )}

        {shares !== null && shares.length === 0 && (
          <p className="share-empty">Only you can see this folder.</p>
        )}
        {shares !== null && shares.length > 0 && (
          <ul className="share-list">
            {shares.map((share) => (
              <li key={share.userId} className="share-row">
                <span className="app-user-avatar" aria-hidden="true">
                  {deriveInitials(share.username)}
                </span>
                <span className="share-who">
                  <span className="share-name">{share.username}</span>
                  <span className="share-email">{share.email}</span>
                </span>
                <RoleSelect
                  value={asShareRole(share.role)}
                  label={`Role for ${share.username}`}
                  disabled={busy}
                  onChange={(next) => void run(() => shareFolder(folder.id, share.email, next))}
                />
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => unshareFolder(folder.id, share.userId))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
