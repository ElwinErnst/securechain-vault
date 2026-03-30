import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

import { StorageModule } from 'src/common/modules/storage/storage.module';
import { CryptoModule } from 'src/common/modules/crypto/crypto.module';
import { AccessControlModule } from 'src/common/modules/access-control/access-control.module';

import { DocumentEntity } from 'src/database/entities/document.entity';
import { VaultEntity } from 'src/database/entities/vault.entity';
import { TenantRbacGuard } from 'src/common/guards/tenant-rbac.guard';
import { TenantKeyEntity } from 'src/database/entities/tenant-key.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, VaultEntity, TenantKeyEntity]),
    AuditModule,
    StorageModule,
    CryptoModule,
    AccessControlModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, TenantRbacGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
