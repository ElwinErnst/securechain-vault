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
import type { Response } from 'express';
import type { Express } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { TenantRbacGuard } from '../../common/guards/tenant-rbac.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';
import { TenantMemberRole } from '../../database/entities/tenant-member.entity';

import { DocumentsService } from './documents.service';
import { Audit } from '../../common/decorators/audit.decorator';

type UploadQuery = {
  vaultId?: string;
  name?: string;
};

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard, TenantRbacGuard)
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('/documents')
  @TenantRoles(TenantMemberRole.ADMIN)
  @Audit({
    action: 'DOCUMENT_UPLOAD',
    resourceType: 'document',
    auditOnError: true,
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (
        _req: unknown,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
        if (!allowed.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              `Invalid file type: ${file.mimetype}. Allowed: ${allowed.join(', ')}`,
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
    @Query() query: UploadQuery,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const maxBytes =
      this.config.get<number>('documents.maxFileSizeBytes') ?? 20 * 1024 * 1024;

    const allowed = this.config.get<string[]>('documents.allowedMimeTypes') ?? [
      'application/pdf',
      'image/png',
      'image/jpeg',
    ];

    if (!query.vaultId) throw new BadRequestException('Missing vaultId');
    if (!file) throw new BadRequestException('Missing file');

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

    const doc = await this.docs.upload({
      tenantId,
      userId: user.id,
      vaultId: query.vaultId,
      name: query.name,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
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
  }

  @Get('/documents')
  @TenantRoles(TenantMemberRole.MEMBER)
  @Audit({ action: 'DOCUMENT_LIST', resourceType: 'document' })
  async list(@TenantId() tenantId: string, @Query('vaultId') vaultId: string) {
    if (!vaultId) throw new BadRequestException('Missing vaultId');

    const items = await this.docs.list(tenantId, vaultId);
    return items.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      vaultId: d.vaultId,
      originalName: d.originalName,
      storedName: d.storedName,
      mime: d.mime,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  @Get('/documents/:id/download')
  @TenantRoles(TenantMemberRole.MEMBER)
  @Audit({
    action: 'DOCUMENT_DOWNLOAD',
    resourceType: 'document',
    resourceIdParam: 'id',
  })
  async download(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { doc, buffer } = await this.docs.getDownload(tenantId, id);

    res.setHeader('Content-Type', doc.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${doc.originalName}"`,
    );
    res.setHeader('Content-Length', String(buffer.byteLength));
    return res.send(buffer);
  }

  @Delete('/documents/:id')
  @TenantRoles(TenantMemberRole.ADMIN)
  @Audit({
    action: 'DOCUMENT_DELETE',
    resourceType: 'document',
    resourceIdParam: 'id',
  })
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.docs.remove(tenantId, id);
    return { ok: true };
  }
}