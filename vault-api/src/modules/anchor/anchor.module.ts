import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from 'src/database/entities/document.entity';
import { AnchorBatchEntity } from 'src/database/entities/anchor-batch.entity';
import { StorageModule } from 'src/common/modules/storage/storage.module';

import { AnchorService } from './anchor.service';
import { PublicVerifyController } from './public-verify.controller';
import {
  TIMESTAMP_CLIENT,
  type TimestampClientPort,
  type TimestampResult,
} from './ports/timestamp-client.port';

// Simulated timestamp client for the MVP (until a real RFC 3161 Timestamp
// Authority client is wired in). It performs NO external attestation, so it
// returns no token: callers must treat the result as unproven and never present
// it as an external timestamp.
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

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, AnchorBatchEntity]),
    StorageModule,
  ],
  controllers: [PublicVerifyController],
  providers: [
    AnchorService,
    { provide: TIMESTAMP_CLIENT, useClass: SimulatedTimestampClient },
  ],
  exports: [AnchorService],
})
export class AnchorModule {}
