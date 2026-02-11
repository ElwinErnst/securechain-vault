import { createHash } from 'crypto';

export function hashToken(token: string): string {
  // sha256 es suficiente acá (token es aleatorio/firmado).
  // guardamos hash para que si la DB se filtra, no se puedan usar tokens.
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
