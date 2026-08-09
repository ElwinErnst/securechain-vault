import { readFileSync } from 'fs';

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from 'src/database/entities/document.entity';
import { AnchorBatchEntity } from 'src/database/entities/anchor-batch.entity';
import { StorageModule } from 'src/common/modules/storage/storage.module';

import { AnchorService } from './anchor.service';
import { PublicVerifyController } from './public-verify.controller';
import { Rfc3161TimestampClient } from './rfc3161-timestamp.client';
import { Rfc3161TimestampVerifier } from './rfc3161-verify';
import { FREETSA_CA_PEM } from './freetsa-ca';
import {
  TIMESTAMP_CLIENT,
  type TimestampClientPort,
  type TimestampResult,
} from './ports/timestamp-client.port';
import {
  TIMESTAMP_VERIFIER,
  type TimestampVerifierPort,
} from './ports/timestamp-verifier.port';

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

// Use a real RFC 3161 TSA when ANCHOR_TSA_URL is set; otherwise fall back to the
// honest simulated client (dev/test).
function createTimestampClient(): TimestampClientPort {
  const url = process.env.ANCHOR_TSA_URL?.trim();
  if (url) {
    const timeoutMs = Number(process.env.ANCHOR_TSA_TIMEOUT_MS) || 10_000;
    return new Rfc3161TimestampClient(url, timeoutMs);
  }
  return new SimulatedTimestampClient();
}

// Trust anchor(s) for RFC 3161 chain validation. ANCHOR_TSA_CA_PEM may hold an
// inline PEM or a path to a PEM file; otherwise the bundled FreeTSA CA is used
// (FreeTSA being the default TSA).
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

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, AnchorBatchEntity]),
    StorageModule,
  ],
  controllers: [PublicVerifyController],
  providers: [
    AnchorService,
    { provide: TIMESTAMP_CLIENT, useFactory: createTimestampClient },
    { provide: TIMESTAMP_VERIFIER, useFactory: createTimestampVerifier },
  ],
  exports: [AnchorService],
})
export class AnchorModule {}
