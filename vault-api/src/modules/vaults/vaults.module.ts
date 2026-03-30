import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VaultEntity } from '../../database/entities/vault.entity';
import { DocumentEntity } from '../../database/entities/document.entity';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';
import { AuditModule } from '../audit/audit.module';
import { AccessControlModule } from 'src/common/modules/access-control/access-control.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VaultEntity, DocumentEntity]),
    AuditModule,
    AccessControlModule,
  ],
  controllers: [VaultsController],
  providers: [VaultsService],
  exports: [VaultsService],
})
export class VaultsModule {}
