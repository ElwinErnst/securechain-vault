import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantEntity } from '../../database/entities/tenant.entity';
import { TenantMemberEntity } from '../../database/entities/tenant-member.entity';
import { VaultEntity } from '../../database/entities/vault.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantEntity, TenantMemberEntity, VaultEntity]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
