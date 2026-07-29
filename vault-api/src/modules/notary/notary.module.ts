import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from '../../database/entities/document.entity';
import { AccessControlModule } from '../../common/modules/access-control/access-control.module';
import { AnchorModule } from '../anchor/anchor.module';
import { AuditModule } from '../audit/audit.module';
import { NotaryController } from './notary.controller';
import { NotaryService } from './notary.service';
import { PublicNotaryController } from './public-notary.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity]),
    AuditModule,
    AccessControlModule,
    AnchorModule,
  ],
  controllers: [NotaryController, PublicNotaryController],
  providers: [NotaryService],
  exports: [NotaryService],
})
export class NotaryModule {}
