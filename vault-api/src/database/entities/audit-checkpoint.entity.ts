import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * TIMESTAMPED — a real RFC 3161 token was obtained over the checkpoint hash.
 * SIMULATED   — dev/test backend produced no real token (honest, not proof).
 * FAILED      — timestamping failed (recorded for observability; rare).
 */
export type AuditCheckpointStatus = 'TIMESTAMPED' | 'SIMULATED' | 'FAILED';

/**
 * An externally anchored checkpoint of an audit-chain head. Periodically we
 * record {scope, headSeq, headHash} and timestamp its hash via a TSA. This
 * closes the newest-suffix-truncation gap: the internal chain alone verifies a
 * shorter truncated chain as VALID, but it cannot be behind an anchored head.
 *
 * Append-only at the runtime role (see 060_runtime_role.sql): a checkpoint is a
 * proof record and must never be rewritten or deleted by the app.
 */
@Entity('audit_checkpoints')
@Index(['scope', 'createdAt'])
export class AuditCheckpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  // Chain head at checkpoint time (BIGINT as string, like audit_logs.seq).
  @Column({ type: 'bigint', name: 'head_seq' })
  headSeq!: string;

  // chainHash of the head row.
  @Column({ type: 'char', length: 64, name: 'head_hash' })
  headHash!: string;

  // sha256 over the canonical {scope, headSeq, headHash} — the value timestamped.
  @Column({ type: 'char', length: 64, name: 'checkpoint_hash' })
  checkpointHash!: string;

  @Column({ type: 'varchar', length: 20, name: 'status' })
  status!: AuditCheckpointStatus;

  // RFC 3161 timestamp token (base64 DER). Null when simulated / failed.
  @Column({ type: 'text', name: 'timestamp_token_b64', nullable: true })
  timestampTokenB64!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'tsa_url', nullable: true })
  tsaUrl!: string | null;

  @Column({ type: 'varchar', length: 120, name: 'tsa_serial', nullable: true })
  tsaSerial!: string | null;

  @Column({ type: 'timestamptz', name: 'timestamped_at', nullable: true })
  timestampedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
