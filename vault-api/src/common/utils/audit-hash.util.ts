import { createHash } from 'crypto';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function stableStringify(input: unknown): string {
  if (Array.isArray(input)) {
    return `[${input.map(stableStringify).join(',')}]`;
  }
  if (isPlainObject(input)) {
    const keys = Object.keys(input).sort();
    const props = keys.map(
      (key) => `${JSON.stringify(key)}:${stableStringify(input[key])}`,
    );
    return `{${props.join(',')}}`;
  }
  return JSON.stringify(input);
}

/**
 * Normalize a value to the exact domain PostgreSQL jsonb can return to the
 * application. This deliberately uses the platform JSON algorithm: Date and
 * custom toJSON values are resolved, undefined object properties are omitted,
 * undefined array entries and non-finite numbers become null, and -0 becomes
 * 0. Cycles and bigint are rejected before a hash or row can be created.
 */
export function normalizeJsonForStorage<T>(input: T): T {
  let normalized: T;
  try {
    const encoded = JSON.stringify(input);
    if (encoded === undefined) {
      throw new TypeError('top-level value has no JSON representation');
    }
    normalized = JSON.parse(encoded) as T;
  } catch (cause) {
    throw new TypeError('audit metadata must be JSON-serializable', { cause });
  }
  assertJsonbCompatible(normalized);
  return normalized;
}

function assertJsonbCompatible(value: unknown): void {
  if (typeof value === 'string') {
    assertJsonbCompatibleString(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertJsonbCompatible);
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      assertJsonbCompatibleString(key);
      assertJsonbCompatible(nested);
    }
  }
}

function assertJsonbCompatibleString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) {
      throw new TypeError('audit metadata must be jsonb-compatible: NUL');
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError(
          'audit metadata must be jsonb-compatible: unpaired UTF-16 surrogate',
        );
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(
        'audit metadata must be jsonb-compatible: unpaired UTF-16 surrogate',
      );
    }
  }
}

/**
 * Historical serializer used by audit schema v1 and v2.
 *
 * It did not JSON-escape object keys. Keep it frozen solely to verify already
 * persisted hashes; new rows MUST use normalized stableStringify through v4.
 */
export function legacyStableStringify(input: unknown): string {
  if (Array.isArray(input)) {
    return `[${input.map(legacyStableStringify).join(',')}]`;
  }
  if (isPlainObject(input)) {
    const keys = Object.keys(input).sort();
    const props = keys.map(
      (key) => `"${key}":${legacyStableStringify(input[key])}`,
    );
    return `{${props.join(',')}}`;
  }
  return JSON.stringify(input);
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
