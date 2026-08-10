import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AuditCheckpointService } from './audit-checkpoint.service';

/**
 * Periodically anchors every audit scope's chain head. Hourly is enough: the
 * checkpoint's value is bounding how far the chain can be truncated, and the
 * service skips scopes whose head has not advanced (no redundant TSA calls).
 */
@Injectable()
export class AuditCheckpointCron {
  private readonly logger = new Logger(AuditCheckpointCron.name);

  constructor(private readonly checkpoints: AuditCheckpointService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    try {
      const { scopes, created, skipped } =
        await this.checkpoints.checkpointAllScopes();
      if (created > 0) {
        this.logger.log(
          `audit checkpoint cron: scopes=${scopes}, created=${created}, skipped=${skipped}`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `audit checkpoint cron failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
