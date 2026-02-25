import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { Readable } from 'stream';

type StorageSaveBufferOpts = {
  tenantId: string;
  vaultId: string;
  filename: string; // ya sanitizado
  buffer: Buffer;
  mime: string;
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const endpointHost =
      this.config.get<string>('MINIO_ENDPOINT') ?? 'localhost';

    const portRaw = this.config.get<string>('MINIO_PORT') ?? '9000';
    const port = Number(portRaw);

    const accessKeyId =
      this.config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin';

    const secretAccessKey =
      this.config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin';

    const useSsl =
      (this.config.get<string>('MINIO_USE_SSL') ?? 'false').toLowerCase() ===
      'true';

    this.bucket = this.config.get<string>('MINIO_BUCKET') ?? 'vault';

    const endpoint = `${useSsl ? 'https' : 'http'}://${endpointHost}:${port}`;

    this.s3 = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket: ${this.bucket}`);
    }
  }

  async saveBuffer(
    opts: StorageSaveBufferOpts,
  ): Promise<{ storageKey: string }> {
    const storageKey = this.buildStorageKey(
      opts.tenantId,
      opts.vaultId,
      opts.filename,
    );

    // Buffer es Uint8Array en Node, no hace falta castearlo
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: opts.buffer,
        ContentType: opts.mime,
      }),
    );

    return { storageKey };
  }

  async getBuffer(storageKey: string): Promise<Buffer> {
    const out = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    const body = out.Body;
    if (!body) throw new Error('Object body is empty');

    // En Node, Body suele ser Readable.
    // sdkStreamMixin lo “enriquece” con transformToByteArray() tipado.
    if (body instanceof Readable) {
      const mixed = sdkStreamMixin(body);
      const bytes = await mixed.transformToByteArray();
      return Buffer.from(bytes);
    }

    // Por si algún runtime te devuelve bytes directos:
    if (body instanceof Uint8Array) {
      return Buffer.from(body);
    }

    // Si cae acá, mejor fallar explícito (evita unsafe casts)
    throw new Error('Unsupported body type returned by S3 client');
  }

  async delete(storageKey: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }

  private buildStorageKey(tenantId: string, vaultId: string, filename: string) {
    return `${tenantId}/${vaultId}/${filename}`;
  }
}
