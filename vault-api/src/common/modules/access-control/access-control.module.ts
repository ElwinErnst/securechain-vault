import { Module } from '@nestjs/common';
import { TenantRbacGuard } from 'src/common/guards/tenant-rbac.guard';
import { AuditModule } from 'src/modules/audit/audit.module';
import { AuthDirectoryModule } from '../auth-directory/auth-directory.module';

@Module({
  imports: [AuditModule, AuthDirectoryModule],
  providers: [TenantRbacGuard],
  exports: [TenantRbacGuard],
})
export class AccessControlModule {}
