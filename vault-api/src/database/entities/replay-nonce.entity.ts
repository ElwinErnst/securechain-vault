import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Persisted anti-replay record for Zero Trust internal requests.
 * The key is `${userId}:${nonce}`; a row lives only for the replay window
 * (zt.maxClockSkewMs) and is pruned afterwards. Backed by the table created in
 * infra/postgres/init/058_replay_nonces.sql (schema is owned by the init
 * scripts in this service, not by TypeORM synchronize).
 */
@Entity('replay_nonces')
export class ReplayNonce {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 255 })
  key!: string;

  @Index('idx_replay_nonces_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
