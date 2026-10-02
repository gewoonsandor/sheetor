import { describe, it, expect } from 'vitest';

import { typeFretDigit } from '../../../src/features/editor/shortcuts';

describe('typeFretDigit', () => {
  const one = typeFretDigit(null, '1', '0:0:0', 1000);

  it('joins a second digit typed soon after at the same spot into one fret', () => {
    expect(typeFretDigit(one, '2', '0:0:0', 1500).digits).toBe('12');
  });

  it('starts a new fret on another beat or string, however quickly it follows', () => {
    expect(typeFretDigit(one, '2', '0:1:0', 1100).digits).toBe('2');
    expect(typeFretDigit(one, '2', '0:0:1', 1100).digits).toBe('2');
  });

  it('starts a new fret after the moment has passed, or past the highest fret', () => {
    expect(typeFretDigit(one, '2', '0:0:0', 1800).digits).toBe('2');
    expect(typeFretDigit(typeFretDigit(null, '3', '0:0:0', 1000), '0', '0:0:0', 1100).digits).toBe('0');
  });
});
