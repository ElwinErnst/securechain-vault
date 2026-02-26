import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnchorService } from './anchor.service';

type AnchorCronResult = {
  processed: number;
  failed: number;
};

@Injectable()
export class DocumentAnchorCron {
  private readonly logger = new Logger(DocumentAnchorCron.name);

  constructor(private readonly anchorService: AnchorService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    const result: AnchorCronResult = await this.anchorService.processPending();

    if (result.processed > 0 || result.failed > 0) {
      this.logger.log(
        `anchor cron: processed=${result.processed}, failed=${result.failed}`,
      );
    }
  }
}
