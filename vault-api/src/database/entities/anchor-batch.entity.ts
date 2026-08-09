import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * PENDING     — root computed, not yet timestamped (awaiting the TSA call).
 * TIMESTAMPED — a real RFC 3161 token was obtained over the root.
 * SIMULATED   — dev/test backend produced no real token (honest, not proof).
 * FAILED      — timestamping failed permanently after retries.
 */
export type AnchorBatchStatus =
  | 'PENDING'
  | 'TIMESTAMPED'
  | 'SIMULATED'
  | 'FAILED';

/**
 * One anchoring batch: a Merkle root over many document leaves, plus the
 * external timestamp obtained for that root. Documents reference their batch
 * and carry an inclusion proof, so a single anchor covers the whole batch.
 */
@Entity('anchor_batches')
@Index(['status', 'createdAt'])
export class AnchorBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Merkle root (hex) this batch anchors.
  @Column({ type: 'char', length: 64, name: 'root_hex' })
  rootHex!: string;

  @Column({ type: 'int', name: 'leaf_count' })
  leafCount!: number;

  @Column({ type: 'varchar', length: 20, name: 'status', default: 'PENDING' })
  status!: AnchorBatchStatus;

  // RFC 3161 timestamp token (base64 DER). Null until timestamped / when simulated.
  @Column({ type: 'text', name: 'timestamp_token_b64', nullable: true })
  timestampTokenB64!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'tsa_url', nullable: true })
  tsaUrl!: string | null;

  // Serial number reported by the TSA inside the token (for cross-reference).
  @Column({ type: 'varchar', length: 120, name: 'tsa_serial', nullable: true })
  tsaSerial!: string | null;

  @Column({ type: 'timestamptz', name: 'timestamped_at', nullable: true })
  timestampedAt!: Date | null;

  @Column({ type: 'int', name: 'retries', default: 0 })
  retries!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
