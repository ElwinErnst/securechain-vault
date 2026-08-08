import { normalizeJsonForStorage, stableStringify } from './audit-hash.util';

describe('stableStringify', () => {
  it('escapes object keys so distinct objects cannot share canonical bytes', () => {
    const left = { 'a\":1,\"b': 2 };
    const right = { a: 1, b: 2 };

    expect(stableStringify(left)).not.toBe(stableStringify(right));
    expect(JSON.parse(stableStringify(left))).toEqual(left);
    expect(JSON.parse(stableStringify(right))).toEqual(right);
  });

  it('is independent of recursively nested object insertion order', () => {
    expect(stableStringify({ z: { b: 2, a: 1 }, a: 0 })).toBe(
      stableStringify({ a: 0, z: { a: 1, b: 2 } }),
    );
  });
});

describe('normalizeJsonForStorage', () => {
  it('matches the JSON/JSONB round-trip policy for nested non-JSON values', () => {
    const input = {
      date: new Date('2026-07-01T12:03:00.000Z'),
      omitted: undefined,
      numbers: [Number.NaN, Infinity, -Infinity, -0],
      array: [undefined, { nested: undefined, kept: 'yes' }],
      unicode: 'emoji 😀',
    };

    expect(normalizeJsonForStorage(input)).toEqual(
      JSON.parse(JSON.stringify(input)),
    );
    expect(normalizeJsonForStorage(input)).toEqual({
      date: '2026-07-01T12:03:00.000Z',
      numbers: [null, null, null, 0],
      array: [null, { kept: 'yes' }],
      unicode: 'emoji 😀',
    });
  });

  it('rejects values JSON cannot persist instead of hashing different bytes', () => {
    expect(() => normalizeJsonForStorage({ value: 1n })).toThrow(
      'audit metadata must be JSON-serializable',
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => normalizeJsonForStorage(cyclic)).toThrow(
      'audit metadata must be JSON-serializable',
    );
  });

  it.each([
    [{ value: 'contains\u0000nul' }, 'NUL'],
    [{ '\u0000key': 'value' }, 'NUL'],
    [{ value: 'unpaired high \ud800' }, 'unpaired UTF-16 surrogate'],
    [{ value: 'unpaired low \udc00' }, 'unpaired UTF-16 surrogate'],
    [{ nested: [{ '\ud800': 'bad key' }] }, 'unpaired UTF-16 surrogate'],
  ])('rejects jsonb-incompatible strings and keys: %p', (input, reason) => {
    expect(() => normalizeJsonForStorage(input)).toThrow(reason);
  });

  it('accepts valid Unicode including paired surrogates recursively', () => {
    expect(normalizeJsonForStorage({ 'emoji-😀': ['ok 𝄞', 'árbol'] })).toEqual({
      'emoji-😀': ['ok 𝄞', 'árbol'],
    });
  });
});
