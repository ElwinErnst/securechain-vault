import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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
  anchorStatus!: 'PENDING' | 'ANCHORED' | 'FAILED';

  @Column({
    type: 'varchar',
    length: 120,
    name: 'anchor_tx_hash',
    nullable: true,
  })
  anchorTxHash!: string | null;

  @Column({ type: 'timestamptz', name: 'anchored_at', nullable: true })
  anchoredAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  anchorChainId!: number | null;
}
