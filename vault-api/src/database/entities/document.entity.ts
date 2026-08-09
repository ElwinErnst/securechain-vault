import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { ProofStep } from '../../modules/anchor/merkle.util';

@Entity('documents')
@Index(['tenantId', 'vaultId', 'createdAt'])
@Index(['tenantId', 'id'], { unique: true })
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'vault_id', type: 'uuid' })
  vaultId!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 255 })
  storedName!: string;

  @Column({ name: 'mime', type: 'varchar', length: 150 })
  mime!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string; // bigint -> string

  // Para storage local: path relativo (ej: tenant/vault/docid_filename)
  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'enc_alg',
    default: 'AES-256-GCM',
  })
  encAlg!: string;

  @Column({ type: 'text', name: 'enc_iv_b64', nullable: true })
  encIvB64!: string | null;

  @Column({ type: 'text', name: 'enc_tag_b64', nullable: true })
  encTagB64!: string | null;

  @Column({ type: 'int', name: 'enc_key_version', default: 1 })
  encKeyVersion!: number;

  // hash del archivo original (en claro)
  @Column({ type: 'char', length: 64, name: 'sha256_plain_hex' })
  sha256PlainHex!: string;

  // opcional (recomendado): hash del ciphertext guardado en MinIO
  @Column({
    type: 'char',
    length: 64,
    name: 'sha256_cipher_hex',
    nullable: true,
  })
  sha256CipherHex!: string | null;

  // estado de anclaje en blockchain
  @Column({
    type: 'varchar',
    length: 20,
    name: 'anchor_status',
    default: 'PENDING',
  })
  anchorStatus!: 'PENDING' | 'ANCHORED' | 'SIMULATED' | 'FAILED';

  @Column({
    type: 'varchar',
    length: 120,
    name: 'anchor_tx_hash',
    nullable: true,
  })
  anchorTxHash!: string | null;

  @Column({ type: 'timestamptz', name: 'anchored_at', nullable: true })
  anchoredAt!: Date | null;

  @Column({ type: 'int', name: 'anchor_chain_id', nullable: true })
  anchorChainId!: number | null;

  @Column({
    type: 'int',
    name: 'anchor_retries',
    default: 0,
  })
  anchorRetries!: number;

  // Merkle anchoring: the batch this document was included in, its leaf position
  // within that batch, and the inclusion proof from its leaf up to the batch
  // root. Together with the batch's timestamp token these prove the document was
  // committed to at the anchored time.
  @Column({ type: 'uuid', name: 'anchor_batch_id', nullable: true })
  anchorBatchId!: string | null;

  @Column({ type: 'int', name: 'anchor_leaf_index', nullable: true })
  anchorLeafIndex!: number | null;

  @Column({ type: 'jsonb', name: 'anchor_proof', nullable: true })
  anchorProof!: ProofStep[] | null;
}
