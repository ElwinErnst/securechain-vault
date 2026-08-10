import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from 'src/database/entities/document.entity';
import { AnchorBatchEntity } from 'src/database/entities/anchor-batch.entity';
import { StorageModule } from 'src/common/modules/storage/storage.module';
import { TimestampModule } from 'src/common/modules/timestamp/timestamp.module';

import { AnchorService } from './anchor.service';
import { DocumentAnchorCron } from './document-anchor.cron';
import { PublicVerifyController } from './public-verify.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, AnchorBatchEntity]),
    StorageModule,
    TimestampModule,
  ],
  controllers: [PublicVerifyController],
  providers: [AnchorService, DocumentAnchorCron],
  exports: [AnchorService],
})
export class AnchorModule {}
