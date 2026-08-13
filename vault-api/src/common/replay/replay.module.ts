import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReplayNonce } from '../../database/entities/replay-nonce.entity';
import { ReplayNonceService } from './replay-nonce.service';

/**
 * Global so the widely-used JwtAuthGuard can inject ReplayNonceService without
 * every feature module having to import this.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ReplayNonce])],
  providers: [ReplayNonceService],
  exports: [ReplayNonceService],
})
export class ReplayModule {}
