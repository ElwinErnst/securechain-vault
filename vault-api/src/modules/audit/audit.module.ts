import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditReaderService } from './audit-reader.service';
import { AuditVerifierService } from './audit-verifier.service';
import { AuditCheckpointService } from './audit-checkpoint.service';
import { AuditCheckpointCron } from './audit-checkpoint.cron';
import { AuditTenantController } from './audit-tenant.controller';
import { AuditGlobalController } from './audit-global.controller';

import { AuditLogEntity } from 'src/database/entities/audit-log.entity';
import { AuditCheckpointEntity } from 'src/database/entities/audit-checkpoint.entity';
import { TimestampModule } from 'src/common/modules/timestamp/timestamp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLogEntity, AuditCheckpointEntity]),
    TimestampModule,
  ],
  controllers: [AuditTenantController, AuditGlobalController],
  providers: [
    AuditService,
    AuditReaderService,
    AuditVerifierService,
    AuditCheckpointService,
    AuditCheckpointCron,
  ],
  exports: [AuditService, AuditCheckpointService],
})
export class AuditModule {}
