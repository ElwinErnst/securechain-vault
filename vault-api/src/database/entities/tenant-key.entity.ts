import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tenant_keys' })
@Index(['tenantId', 'version'], { unique: true })
export class TenantKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'encrypted_dek_b64', type: 'text' })
  encryptedDekB64!: string;

  @Column({ name: 'dek_iv_b64', type: 'text' })
  dekIvB64!: string;

  @Column({ name: 'dek_tag_b64', type: 'text' })
  dekTagB64!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
