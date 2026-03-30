import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantMemberEntity } from './tenant-member.entity';

export enum TenantType {
  ORG = 'ORG',
  PERSONAL = 'PERSONAL',
}

@Entity({ name: 'tenants' })
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug!: string;

  @Column({ type: 'varchar', length: 20, default: TenantType.ORG })
  type!: TenantType;

  // owner user id (nullable)
  @Column({ type: 'uuid', nullable: true, name: 'owner_user_id' })
  ownerUserId!: string | null;

  @OneToMany(() => TenantMemberEntity, (m) => m.tenant)
  members!: TenantMemberEntity[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
