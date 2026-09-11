import { describe, it, expect, beforeEach, vi } from 'vitest';

import { applyTheme, resolveTheme, watchSystemTheme } from './theme';

interface FakeQuery {
  matches: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

let prefersLight: boolean;
let listeners: Array<() => void>;
let root: { dataset: Record<string, string> };

const makeQuery = (): FakeQuery => ({
  get matches() {
    return prefersLight;
  },
  addEventListener: (_type: string, listener: () => void) => {
    listeners.push(listener);
  },
  removeEventListener: (_type: string, listener: () => void) => {
    listeners = listeners.filter((entry) => entry !== listener);
  },
});

beforeEach(() => {
  prefersLight = false;
  listeners = [];
  root = { dataset: {} };
  vi.stubGlobal('window', { matchMedia: () => makeQuery() });
  vi.stubGlobal('document', { documentElement: root });
});

describe('resolveTheme', () => {
  it('passes an explicit preference straight through', () => {
    prefersLight = true;
    expect(resolveTheme('dark')).toBe('dark');
    prefersLight = false;
    expect(resolveTheme('light')).toBe('light');
  });

  it('follows the operating system when the preference is system', () => {
    prefersLight = true;
    expect(resolveTheme('system')).toBe('light');
    prefersLight = false;
    expect(resolveTheme('system')).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('writes both attributes on the document element', () => {
    applyTheme({ theme: 'light', accent: 'teal' });
    expect(root.dataset).toEqual({ theme: 'light', accent: 'teal' });
  });

  it('resolves system to a concrete theme before writing', () => {
    prefersLight = true;
    applyTheme({ theme: 'system', accent: 'amber' });
    expect(root.dataset.theme).toBe('light');
  });
});

describe('watchSystemTheme', () => {
  it('registers a change listener and removes it on dispose', () => {
    const onChange = vi.fn();
    const dispose = watchSystemTheme(onChange);
    expect(listeners).toHaveLength(1);

    listeners[0]();
    expect(onChange).toHaveBeenCalledTimes(1);

    dispose();
    expect(listeners).toHaveLength(0);
  });
});
