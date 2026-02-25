import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../../database/entities/document.entity';
import { VaultEntity } from '../../database/entities/vault.entity';
import { StorageService } from '../../common/modules/storage/storage.service';

function sanitizeFilename(name: string): string {
  // simple y suficiente para MVP
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly docsRepo: Repository<DocumentEntity>,
    @InjectRepository(VaultEntity)
    private readonly vaultsRepo: Repository<VaultEntity>,
    private readonly storage: StorageService,
  ) {}

  async upload(opts: {
    tenantId: string;
    userId: string;
    vaultId: string;
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    };
    name?: string;
  }): Promise<DocumentEntity> {
    const vault = await this.vaultsRepo.findOne({
      where: { id: opts.vaultId, tenantId: opts.tenantId },
      select: { id: true, tenantId: true },
    });

    if (!vault) throw new NotFoundException('Vault not found');

    const baseName = sanitizeFilename(
      opts.name || opts.file.originalname || 'file',
    );
    const storedName = `${Date.now()}_${baseName}`;

    const { storageKey } = await this.storage.saveBuffer({
      tenantId: opts.tenantId,
      vaultId: opts.vaultId,
      filename: storedName,
      buffer: opts.file.buffer,
      mime: opts.file.mimetype,
    });

    const row = this.docsRepo.create({
      tenantId: opts.tenantId,
      vaultId: opts.vaultId,
      originalName: opts.file.originalname,
      storedName,
      mime: opts.file.mimetype,
      sizeBytes: String(opts.file.size),
      storageKey,
    });

    return this.docsRepo.save(row);
  }

  async list(tenantId: string, vaultId: string): Promise<DocumentEntity[]> {
    // garantiza que el vault sea del tenant (evita leaks)
    const vault = await this.vaultsRepo.findOne({
      where: { id: vaultId, tenantId },
      select: { id: true },
    });
    if (!vault) throw new NotFoundException('Vault not found');

    return this.docsRepo.find({
      where: { tenantId, vaultId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async get(tenantId: string, id: string): Promise<DocumentEntity> {
    const doc = await this.docsRepo.findOne({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const doc = await this.get(tenantId, id);
    await this.storage.delete(doc.storageKey);
    await this.docsRepo.delete({ id, tenantId });
  }

  async getDownload(
    tenantId: string,
    id: string,
  ): Promise<{ doc: DocumentEntity; buffer: Buffer }> {
    const doc = await this.get(tenantId, id);
    const buffer = await this.storage.getBuffer(doc.storageKey);
    return { doc, buffer };
  }
}