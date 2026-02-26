import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantRbacGuard } from 'src/common/guards/tenant-rbac.guard';
import { TenantMemberEntity } from 'src/database/entities/tenant-member.entity';
import { AuditModule } from 'src/modules/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantMemberEntity]),
    forwardRef(() => AuditModule),
  ],
  providers: [TenantRbacGuard],
  exports: [TenantRbacGuard, TypeOrmModule],
})
export class AccessControlModule {}
