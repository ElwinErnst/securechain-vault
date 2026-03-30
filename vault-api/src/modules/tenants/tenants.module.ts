import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { AuthDirectoryModule } from '../../common/modules/auth-directory/auth-directory.module';

@Module({
  imports: [AuthDirectoryModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
