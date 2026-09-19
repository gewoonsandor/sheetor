/// Whether the browser holds a usable server session.
///
/// This is deliberately *not* part of `userStore`: that one is the profile,
/// persisted in `localStorage` and validated field by field. This is transient
/// server state, it starts unknown on every load, and nothing about it may
/// survive a reload — a stored "signed in" flag would be a lie the moment the
/// cookie expires.
export type SessionStatus = 'checking' | 'in' | 'out';

const listeners = new Set<() => void>();

let status: SessionStatus = 'checking';

export const getSessionStatus = (): SessionStatus => status;

export const setSessionStatus = (next: SessionStatus): void => {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener());
};

export const subscribeSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
