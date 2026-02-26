import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../../database/entities/document.entity';
import { VaultEntity } from '../../database/entities/vault.entity';
import { TenantKeyEntity } from '../../database/entities/tenant-key.entity';
import { StorageService } from '../../common/modules/storage/storage.service';
import { CryptoService } from '../../common/modules/crypto/crypto.service';
import { Readable } from 'stream';
import { createHash } from 'crypto';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly docsRepo: Repository<DocumentEntity>,
    @InjectRepository(VaultEntity)
    private readonly vaultsRepo: Repository<VaultEntity>,
    @InjectRepository(TenantKeyEntity)
    private readonly tenantKeysRepo: Repository<TenantKeyEntity>,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
  ) {}

  private async getOrCreateTenantDek(tenantId: string): Promise<Buffer> {
    const existing = await this.tenantKeysRepo.findOne({
      where: { tenantId, version: 1 },
    });

    if (existing) {
      return this.crypto.decryptDek({
        encryptedDekB64: existing.encryptedDekB64,
        ivB64: existing.dekIvB64,
        tagB64: existing.dekTagB64,
      });
    }

    const dek = this.crypto.generateDek();
    const enc = this.crypto.encryptDek(dek);

    const entity = this.tenantKeysRepo.create({
      tenantId,
      version: 1,
      encryptedDekB64: enc.encryptedDekB64,
      dekIvB64: enc.ivB64,
      dekTagB64: enc.tagB64,
    });

    await this.tenantKeysRepo.save(entity);
    return dek;
  }

  async list(tenantId: string, vaultId: string): Promise<DocumentEntity[]> {
    const vault = await this.vaultsRepo.findOne({
      where: { id: vaultId, tenantId },
      select: { id: true },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    return this.docsRepo.find({
      where: { tenantId, vaultId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

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
      select: { id: true },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found');
    }

    const baseName = sanitizeFilename(
      opts.name || opts.file.originalname || 'file',
    );

    const storedName = `${Date.now()}_${baseName}`;

    const storageKey = this.storage.buildStorageKey(
      opts.tenantId,
      opts.vaultId,
      storedName,
    );

    const dek = await this.getOrCreateTenantDek(opts.tenantId);

    const { cipher, ivB64, getTagB64 } = this.crypto.encryptStream(dek);

    const inputStream: Readable = Readable.from(opts.file.buffer);

    // Buffer the encrypted stream to get its full size before uploading
    const encryptedChunks: Uint8Array[] = [];
    const encryptAndBuffer = new Promise<void>((resolve, reject) => {
      inputStream
        .pipe(cipher)
        .on('data', (chunk: Uint8Array) => encryptedChunks.push(chunk))
        .on('end', () => resolve())
        .on('error', reject);
    });

    await encryptAndBuffer;

    const encryptedBuffer = Buffer.concat(encryptedChunks);
    const tagB64 = getTagB64();

    // Upload using storage service
    await this.storage.saveBuffer({
      tenantId: opts.tenantId,
      vaultId: opts.vaultId,
      filename: storedName,
      buffer: encryptedBuffer,
      mime: opts.file.mimetype,
    });

    const sha256PlainHex = createHash('sha256')
      .update(opts.file.buffer)
      .digest('hex');

    const row = this.docsRepo.create({
      tenantId: opts.tenantId,
      vaultId: opts.vaultId,
      originalName: opts.file.originalname,
      storedName,
      mime: opts.file.mimetype,
      sizeBytes: String(opts.file.size),
      storageKey,
      encIvB64: ivB64,
      encTagB64: tagB64,
      encKeyVersion: 1,
      sha256PlainHex,
      anchorStatus: 'PENDING',
    });

    return this.docsRepo.save(row);
  }

  async getForDownloadStream(
    tenantId: string,
    id: string,
  ): Promise<{ doc: DocumentEntity; stream: Readable }> {
    const doc = await this.docsRepo.findOne({
      where: { id, tenantId },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const key = await this.tenantKeysRepo.findOne({
      where: { tenantId, version: doc.encKeyVersion },
    });

    if (!key) {
      throw new NotFoundException('Tenant key not found');
    }

    const dek = this.crypto.decryptDek({
      encryptedDekB64: key.encryptedDekB64,
      ivB64: key.dekIvB64,
      tagB64: key.dekTagB64,
    });

    const s3Stream: Readable = await this.storage.getStream(doc.storageKey);

    const decipher = this.crypto.decryptStream({
      dek,
      ivB64: doc.encIvB64 ?? '',
      tagB64: doc.encTagB64 ?? '',
    });

    const decryptedStream: Readable = s3Stream.pipe(decipher);

    return { doc, stream: decryptedStream };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const doc = await this.docsRepo.findOne({
      where: { id, tenantId },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    await this.storage.delete(doc.storageKey);
    await this.docsRepo.delete({ id, tenantId });
  }
}
