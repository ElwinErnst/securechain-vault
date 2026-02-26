import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { Readable, PassThrough } from 'stream';

type StorageSaveBufferOpts = {
  tenantId: string;
  vaultId: string;
  filename: string; // sanitizado
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
    const port = Number(this.config.get<string>('MINIO_PORT') ?? '9000');
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

  buildStorageKey(tenantId: string, vaultId: string, filename: string): string {
    return `${tenantId}/${vaultId}/${filename}`;
  }

  async saveBuffer(
    opts: StorageSaveBufferOpts,
  ): Promise<{ storageKey: string }> {
    const storageKey = this.buildStorageKey(
      opts.tenantId,
      opts.vaultId,
      opts.filename,
    );

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: opts.buffer, // Buffer extiende Uint8Array en Node
        ContentType: opts.mime,
      }),
    );

    return { storageKey };
  }

  /**
   * Para streaming uploads (encryption pipeline).
   * Devuelve:
   * - writable: donde escribís bytes
   * - done: promise que resuelve cuando MinIO termina el upload
   */
  createWritableStream(
    storageKey: string,
    mime: string,
    contentLength?: number,
  ): { writable: PassThrough; done: Promise<unknown> } {
    const pass = new PassThrough();

    // sdkStreamMixin mutates the stream in-place so that the AWS SDK
    // can correctly detect and manage it during uploads. We *must*
    // pass the same object back to the caller so that writing to it
    // actually feeds the request body that the SDK sees.
    sdkStreamMixin(pass);

    const commandParams = {
      Bucket: this.bucket,
      Key: storageKey,
      Body: pass,
      ContentType: mime,
      ...(typeof contentLength === 'number' && {
        ContentLength: contentLength,
      }),
      ChecksumAlgorithm: undefined,
    };

    const done = this.s3.send(new PutObjectCommand(commandParams));

    return { writable: pass, done };
  }

  async getStream(storageKey: string): Promise<Readable> {
    const out: GetObjectCommandOutput = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    const body = out.Body;
    if (!body) throw new Error('Object body is empty');

    if (body instanceof Readable) return body;

    if (body instanceof Uint8Array) return Readable.from([body]);

    const maybe = body as unknown as {
      transformToByteArray?: () => Promise<Uint8Array>;
    };

    if (typeof maybe.transformToByteArray === 'function') {
      const bytes = await maybe.transformToByteArray();
      return Readable.from([bytes]);
    }

    throw new Error('Unsupported body type returned by S3 client');
  }

  async getBuffer(storageKey: string): Promise<Buffer> {
    const stream = await this.getStream(storageKey);
    return this.streamToBuffer(stream);
  }

  async delete(storageKey: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];

    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(String(chunk)));
      }
    }

    return Buffer.concat(chunks);
  }
}
