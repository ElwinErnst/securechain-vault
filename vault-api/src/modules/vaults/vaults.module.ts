import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VaultEntity } from '../../database/entities/vault.entity';
import { TenantMemberEntity } from '../../database/entities/tenant-member.entity';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';
import { AuditModule } from '../audit/audit.module';
import { TenantRbacGuard } from 'src/common/guards/tenant-rbac.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([VaultEntity, TenantMemberEntity]),
    AuditModule,
  ],
  controllers: [VaultsController],
  providers: [VaultsService, TenantRbacGuard],
  exports: [VaultsService],
})
export class VaultsModule {}
