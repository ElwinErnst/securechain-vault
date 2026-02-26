import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
// import { Transform } from 'stream';

@Injectable()
export class CryptoService {
  private readonly masterKey: Buffer;

  constructor(private readonly config: ConfigService) {
    const b64 = this.config.get<string>('MASTER_KEY_B64');
    if (!b64) throw new Error('Missing MASTER_KEY_B64');

    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) {
      throw new Error('MASTER_KEY_B64 must be 32 bytes (base64)');
    }

    this.masterKey = key;
  }

  generateDek(): Buffer {
    return randomBytes(32);
  }

  encryptDek(dek: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      encryptedDekB64: encrypted.toString('base64'),
      ivB64: iv.toString('base64'),
      tagB64: tag.toString('base64'),
    };
  }

  decryptDek(opts: {
    encryptedDekB64: string;
    ivB64: string;
    tagB64: string;
  }): Buffer {
    const iv = Buffer.from(opts.ivB64, 'base64');
    const tag = Buffer.from(opts.tagB64, 'base64');
    const encrypted = Buffer.from(opts.encryptedDekB64, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  encryptStream(dek: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);

    return {
      cipher,
      ivB64: iv.toString('base64'),
      getTagB64: () => cipher.getAuthTag().toString('base64'),
    };
  }

  decryptStream(opts: { dek: Buffer; ivB64: string; tagB64: string }) {
    const iv = Buffer.from(opts.ivB64, 'base64');
    const tag = Buffer.from(opts.tagB64, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', opts.dek, iv);
    decipher.setAuthTag(tag);

    return decipher;
  }
}
