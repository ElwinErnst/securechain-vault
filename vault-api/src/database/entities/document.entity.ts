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
}
