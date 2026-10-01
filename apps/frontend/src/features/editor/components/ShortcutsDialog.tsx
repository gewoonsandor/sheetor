import { Dialog } from '../../../app/Dialog';
import { SHORTCUTS } from '../shortcuts';
import type { Shortcut } from '../shortcuts';

const GROUPS: Shortcut['group'][] = ['Move', 'Write', 'Edit', 'Techniques'];

/** A reference card: key caps then the action, one hairline per row. */
export const ShortcutsDialog = ({ onClose }: { onClose: () => void }) => (
  <Dialog title="Keyboard shortcuts" onClose={onClose}>
    <div className="shortcut-button-grid">
      {GROUPS.map(group => [
        <h3 key={group} className="eyebrow shortcut-divider">{group}</h3>,
        ...SHORTCUTS.filter(s => s.group === group).map(s => (
          <span key={`${group}-${s.keys.join('+')}-${s.action}`}>
            {s.keys.map(k => (k === '–' ? '–' : <kbd key={k}>{k}</kbd>))}
            {' '}{s.action}
          </span>
        )),
      ])}
    </div>
  </Dialog>
);
