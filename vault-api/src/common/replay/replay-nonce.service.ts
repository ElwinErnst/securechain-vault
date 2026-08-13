import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { ReplayNonce } from '../../database/entities/replay-nonce.entity';

/**
 * Persistent anti-replay store. Backed by a unique-keyed table so the
 * check-and-record is atomic (INSERT ... ON CONFLICT DO NOTHING) — no
 * check-then-set race, and shared across instances, unlike an in-process Map.
 */
@Injectable()
export class ReplayNonceService {
  private readonly logger = new Logger(ReplayNonceService.name);

  constructor(
    @InjectRepository(ReplayNonce)
    private readonly repo: Repository<ReplayNonce>,
  ) {}

  /**
   * Atomically record a nonce. Returns true if it was newly recorded (the
   * request is fresh), false if the key already existed (a replay).
   */
  async checkAndRecord(key: string, expiresAt: Date): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(ReplayNonce)
      .values({ key, expiresAt })
      .orIgnore() // ON CONFLICT DO NOTHING
      .returning('key')
      .execute();
    const inserted = result.raw as unknown[];
    return Array.isArray(inserted) && inserted.length > 0;
  }

  /** Drop expired rows so the table only holds the active replay window. */
  @Cron(CronExpression.EVERY_MINUTE)
  async pruneExpired(): Promise<void> {
    const result = await this.repo.delete({ expiresAt: LessThan(new Date()) });
    if (result.affected) {
      this.logger.debug(`Pruned ${result.affected} expired replay nonce(s)`);
    }
  }
}
