import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditReaderService } from './audit-reader.service';
import { AuditTenantController } from './audit-tenant.controller';
import { AuditGlobalController } from './audit-global.controller';

import { AuditLogEntity } from 'src/database/entities/audit-log.entity';
import { TenantMemberEntity } from 'src/database/entities/tenant-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, TenantMemberEntity])],
  controllers: [AuditTenantController, AuditGlobalController],
  providers: [AuditService, AuditReaderService],
  exports: [AuditService],
})
export class AuditModule {}
