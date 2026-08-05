import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditReaderService } from './audit-reader.service';
import { AuditVerifierService } from './audit-verifier.service';
import { AuditTenantController } from './audit-tenant.controller';
import { AuditGlobalController } from './audit-global.controller';

import { AuditLogEntity } from 'src/database/entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  controllers: [AuditTenantController, AuditGlobalController],
  providers: [AuditService, AuditReaderService, AuditVerifierService],
  exports: [AuditService],
})
export class AuditModule {}
