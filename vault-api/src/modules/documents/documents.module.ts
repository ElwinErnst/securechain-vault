import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from '../../database/entities/document.entity';
import { VaultEntity } from '../../database/entities/vault.entity';
import { StorageModule } from '../../common/modules/storage/storage.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuditModule } from '../audit/audit.module';
import { TenantMemberEntity } from 'src/database/entities/tenant-member.entity';
import { TenantRbacGuard } from 'src/common/guards/tenant-rbac.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantMemberEntity, DocumentEntity, VaultEntity]), // 👈 clave
    AuditModule,
    StorageModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, TenantRbacGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
