import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

@Index(['scope', 'seq'], { unique: true })
@Index(['tenantId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['resourceType', 'resourceId', 'createdAt'])
@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // null para acciones globales
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  @Index()
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  /**
   * scope = tenantId (string) o 'GLOBAL'
   * Te permite encadenar por tenant y también una cadena global.
   */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  /**
   * Secuencia monotonica dentro del scope (BIGINT).
   * Se asigna en el AuditService dentro de una tx con lock para evitar carreras.
   */
  @Column({ type: 'bigint' })
  seq!: string; // TypeORM bigints como string

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'varchar', length: 60, name: 'resource_type' })
  resourceType!: string;

  @Column({ type: 'varchar', length: 120, name: 'resource_id', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'varchar', length: 10 })
  outcome!: AuditOutcome;

  @Column({ type: 'int', name: 'http_status' })
  httpStatus!: number;

  @Column({ type: 'varchar', length: 10, name: 'http_method' })
  httpMethod!: string;

  @Column({ type: 'varchar', length: 255, name: 'http_path' })
  httpPath!: string;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  /**
   * Hashes (hex sha256)
   */
  @Column({ type: 'char', length: 64, name: 'event_hash' })
  eventHash!: string;

  @Column({ type: 'char', length: 64, name: 'prev_hash', nullable: true })
  prevHash!: string | null;

  @Column({ type: 'char', length: 64, name: 'chain_hash' })
  chainHash!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
