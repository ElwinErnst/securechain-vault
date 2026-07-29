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
    const props = keys.map((key) => `"${key}":${stableStringify(input[key])}`);
    return `{${props.join(',')}}`;
  }
  return JSON.stringify(input);
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
