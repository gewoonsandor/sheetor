import type { NoteTechniques } from './components/types';

/** A technique with a key of its own; the release rides on the bend's key with Shift. */
export type TechniqueId = Exclude<keyof NoteTechniques, 'bendRelease'>;

export interface Shortcut {
  keys: string[];
  action: string;
  group: 'Move' | 'Write' | 'Edit' | 'Techniques';
}

/** The key that toggles each technique on the note under the cursor. */
export const TECHNIQUE_SHORTCUTS: Record<TechniqueId, string> = {
  slur: 'H',
  legatoSlide: 'S',
  vibrato: 'V',
  bend: 'B',
  palmMute: 'M',
  letRing: 'L',
  harmonic: 'O',
  ghostNote: 'G',
};

export const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  slur: 'Slur',
  legatoSlide: 'Legato slide',
  vibrato: 'Vibrato',
  bend: 'Bend: ½, full, off',
  palmMute: 'Palm mute',
  letRing: 'Let ring',
  harmonic: 'Harmonic',
  ghostNote: 'Ghost note',
};

/** Every key the editor answers, as the shortcuts dialog lists them. */
export const SHORTCUTS: Shortcut[] = [
  { keys: ['←', '→'], action: 'Beat', group: 'Move' },
  { keys: ['↑', '↓'], action: 'String', group: 'Move' },
  { keys: ['Shift', '←', '→'], action: 'Select beats', group: 'Move' },
  { keys: ['Esc'], action: 'Clear selection', group: 'Move' },
  { keys: ['Space'], action: 'Play or stop', group: 'Move' },
  { keys: ['?'], action: 'Shortcuts', group: 'Move' },
  { keys: ['0', '–', '9'], action: 'Fret (two digits within a moment: 10–24)', group: 'Write' },
  { keys: ['Shift', '↑', '↓'], action: 'Pitch ± semitone', group: 'Write' },
  { keys: ['Shift', 'Ctrl', '↑', '↓'], action: 'Pitch ± octave', group: 'Write' },
  { keys: ['R'], action: 'Rest', group: 'Write' },
  { keys: ['.'], action: 'Dot', group: 'Write' },
  { keys: ['+', '−'], action: 'Duration', group: 'Write' },
  { keys: ['Delete'], action: 'Remove', group: 'Write' },
  { keys: ['Ctrl', 'Delete'], action: 'Delete bar', group: 'Write' },
  { keys: ['Ctrl', 'C', 'X', 'V'], action: 'Copy, cut, paste', group: 'Edit' },
  { keys: ['Ctrl', 'Z'], action: 'Undo', group: 'Edit' },
  { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo', group: 'Edit' },
  { keys: ['Ctrl', 'Y'], action: 'Redo', group: 'Edit' },
  ...Object.entries(TECHNIQUE_SHORTCUTS).map(([id, key]): Shortcut => ({
    keys: [key],
    action: TECHNIQUE_LABELS[id as TechniqueId],
    group: 'Techniques',
  })),
  { keys: ['Shift', 'B'], action: 'Release the bend', group: 'Techniques' },
];
