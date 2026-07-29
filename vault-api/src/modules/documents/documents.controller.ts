import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { tmpdir } from 'os';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { TenantRbacGuard } from '../../common/guards/tenant-rbac.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';
import { TenantMemberRole } from '../../database/entities/tenant-member.entity';
import { ApiClientAllowed } from '../../common/decorators/api-client-allowed.decorator';

import { DocumentsService } from './documents.service';
import { Audit } from '../../common/decorators/audit.decorator';

const UPLOAD_TMP_DIR = join(tmpdir(), 'vault-api-uploads');

const UploadQuerySchema = z.object({
  vaultId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
});

const ListQuerySchema = z.object({
  vaultId: z.string().uuid(),
});

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

// Defaults MVP (si no hay config)
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_ALLOWED_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

type AllowedMime = (typeof DEFAULT_ALLOWED_MIMES)[number];

function isAllowedMime(
  mime: string,
  allowed: readonly string[],
): mime is AllowedMime {
  return allowed.includes(mime);
}

function ensureUploadTempDir(): string {
  mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
  return UPLOAD_TMP_DIR;
}

function buildTempFilename(file: Express.Multer.File): string {
  const extension = extname(file.originalname ?? '').slice(0, 16);
  return `${randomUUID()}${extension}`;
}

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard, TenantRbacGuard)
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('/documents')
  @ApiClientAllowed()
  @TenantRoles(TenantMemberRole.ADMIN)
  @Audit({
    action: 'DOCUMENT_UPLOAD',
    resourceType: 'document',
    auditOnError: true,
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureUploadTempDir()),
        filename: (_req, file, cb) => cb(null, buildTempFilename(file)),
      }),
      limits: { fileSize: DEFAULT_MAX_BYTES },
      fileFilter: (
        _req: unknown,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!isAllowedMime(file.mimetype, DEFAULT_ALLOWED_MIMES)) {
          cb(
            new BadRequestException(
              `Invalid file type: ${file.mimetype}. Allowed: ${DEFAULT_ALLOWED_MIMES.join(', ')}`,
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @TenantId() tenantId: string,
    @CurrentUser() user: { id: string },
    @Query() query: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const parsedQuery = UploadQuerySchema.safeParse(query);
    if (!parsedQuery.success)
      throw new BadRequestException('Invalid query (vaultId/name)');

    if (!file) throw new BadRequestException('Missing file');

    const maxBytes =
      this.config.get<number>('documents.maxFileSizeBytes') ??
      DEFAULT_MAX_BYTES;

    const allowed = this.config.get<string[]>('documents.allowedMimeTypes') ?? [
      ...DEFAULT_ALLOWED_MIMES,
    ];

    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Allowed: ${allowed.join(', ')}`,
      );
    }

    if (typeof file.size === 'number' && file.size > maxBytes) {
      throw new BadRequestException(
        `File too large. Max ${(maxBytes / (1024 * 1024)).toFixed(0)}MB`,
      );
    }

    try {
      const doc = await this.docs.upload({
        tenantId,
        userId: user.id,
        vaultId: parsedQuery.data.vaultId,
        name: parsedQuery.data.name,
        file: {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path,
        },
      });

      return {
        id: doc.id,
        tenantId: doc.tenantId,
        vaultId: doc.vaultId,
        originalName: doc.originalName,
        storedName: doc.storedName,
        mime: doc.mime,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt.toISOString(),
      };
    } finally {
      if (file.path) {
        await unlink(file.path).catch(() => undefined);
      }
    }
  }

  @Get('/documents')
  @ApiClientAllowed()
  @TenantRoles(TenantMemberRole.MEMBER)
  @Audit({ action: 'DOCUMENT_LIST', resourceType: 'document' })
  async list(@TenantId() tenantId: string, @Query() query: unknown) {
    const parsed = ListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid vaultId');

    const items = await this.docs.list(tenantId, parsed.data.vaultId);

    return items.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      vaultId: d.vaultId,
      originalName: d.originalName,
      storedName: d.storedName,
      mime: d.mime,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString(),
      anchorStatus: d.anchorStatus,
      encAlg: d.encAlg,
    }));
  }

  @Get('/documents/:id/download')
  @ApiClientAllowed()
  @TenantRoles(TenantMemberRole.MEMBER)
  @Audit({
    action: 'DOCUMENT_DOWNLOAD',
    resourceType: 'document',
    resourceIdParam: 'id',
  })
  async download(
    @TenantId() tenantId: string,
    @Param() params: unknown,
    @Res() res: Response,
  ) {
    const parsed = IdParamSchema.safeParse(params);
    if (!parsed.success) throw new BadRequestException('Invalid document id');

    const { doc, stream } = await this.docs.getForDownloadStream(
      tenantId,
      parsed.data.id,
    );

    res.setHeader('Content-Type', doc.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
    );

    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });

    stream.pipe(res);
  }

  @Delete('/documents/:id')
  @TenantRoles(TenantMemberRole.ADMIN)
  @Audit({
    action: 'DOCUMENT_DELETE',
    resourceType: 'document',
    resourceIdParam: 'id',
  })
  async remove(@TenantId() tenantId: string, @Param() params: unknown) {
    const parsed = IdParamSchema.safeParse(params);
    if (!parsed.success) throw new BadRequestException('Invalid document id');

    await this.docs.remove(tenantId, parsed.data.id);
    return { ok: true };
  }
}
