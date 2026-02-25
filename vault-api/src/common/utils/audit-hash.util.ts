import { createHash } from 'crypto';

function isPlainObject(v: any): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function stableStringify(input: any): string {
  if (Array.isArray(input)) {
    return `[${input.map(stableStringify).join(',')}]`;
  }
  if (isPlainObject(input)) {
    const keys = Object.keys(input).sort();
    const props = keys.map((k) => `"${k}":${stableStringify(input[k])}`);
    return `{${props.join(',')}}`;
  }
  return JSON.stringify(input);
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
