import { readFileSync } from 'fs';

import { Module } from '@nestjs/common';

import { Rfc3161TimestampClient } from './rfc3161-timestamp.client';
import { Rfc3161TimestampVerifier } from './rfc3161-verify';
import { FREETSA_CA_PEM } from './freetsa-ca';
import {
  TIMESTAMP_CLIENT,
  type TimestampClientPort,
  type TimestampResult,
} from './timestamp-client.port';
import {
  TIMESTAMP_VERIFIER,
  type TimestampVerifierPort,
} from './timestamp-verifier.port';

// Honest fallback when no TSA is configured: performs NO external attestation,
// so it returns no token. Callers must treat the result as unproven and never
// present it as an external timestamp.
class SimulatedTimestampClient implements TimestampClientPort {
  timestampRoot(): Promise<TimestampResult> {
    return Promise.resolve({
      simulated: true,
      tokenB64: null,
      tsaUrl: null,
      serial: null,
      timestampedAt: new Date(),
    });
  }
}

// Real RFC 3161 TSA when ANCHOR_TSA_URL is set; otherwise the honest simulated
// client (dev/test).
function createTimestampClient(): TimestampClientPort {
  const url = process.env.ANCHOR_TSA_URL?.trim();
  if (url) {
    const timeoutMs = Number(process.env.ANCHOR_TSA_TIMEOUT_MS) || 10_000;
    return new Rfc3161TimestampClient(url, timeoutMs);
  }
  return new SimulatedTimestampClient();
}

// Trust anchor(s) for RFC 3161 chain validation. ANCHOR_TSA_CA_PEM may hold an
// inline PEM or a path to a PEM file; otherwise the bundled FreeTSA CA is used.
function createTimestampVerifier(): TimestampVerifierPort {
  const configured = process.env.ANCHOR_TSA_CA_PEM?.trim();
  const pem =
    configured && configured.includes('BEGIN CERTIFICATE')
      ? configured
      : configured
        ? readFileSync(configured, 'utf8')
        : FREETSA_CA_PEM;
  return new Rfc3161TimestampVerifier([pem]);
}

/**
 * Shared external-timestamping capability (RFC 3161). Used by document anchoring
 * and audit-chain checkpointing alike, so the TSA client + verifier + trust
 * anchors live in one place with a single configuration surface.
 */
@Module({
  providers: [
    { provide: TIMESTAMP_CLIENT, useFactory: createTimestampClient },
    { provide: TIMESTAMP_VERIFIER, useFactory: createTimestampVerifier },
  ],
  exports: [TIMESTAMP_CLIENT, TIMESTAMP_VERIFIER],
})
export class TimestampModule {}
