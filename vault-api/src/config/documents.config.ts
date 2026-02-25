// src/config/documents.config.ts
import { registerAs } from '@nestjs/config';

export const documentsConfig = registerAs('documents', () => {
  const maxFileSizeMb = Number(process.env.DOCS_MAX_FILE_SIZE_MB ?? 20);

  return {
    maxFileSizeBytes: Math.max(1, maxFileSizeMb) * 1024 * 1024,

    // whitelist simple y segura para MVP
    allowedMimeTypes: (
      process.env.DOCS_ALLOWED_MIME_TYPES ??
      'application/pdf,image/png,image/jpeg'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
});

export type DocumentsConfig = ReturnType<typeof documentsConfig>;
