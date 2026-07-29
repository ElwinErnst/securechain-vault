import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { TenantRbacGuard } from '../../common/guards/tenant-rbac.guard';
import { TenantMemberRole } from '../../database/entities/tenant-member.entity';
import { Audit } from '../../common/decorators/audit.decorator';
import { NotaryService } from './notary.service';

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

@Controller('notary')
@UseGuards(JwtAuthGuard, TenantContextGuard, TenantRbacGuard)
export class NotaryController {
  constructor(private readonly notaryService: NotaryService) {}

  @Post('documents/:id/issue')
  @TenantRoles(TenantMemberRole.ADMIN)
  @Audit({
    action: 'NOTARY_ISSUE',
    resourceType: 'document',
    resourceIdParam: 'id',
    auditOnError: true,
  })
  async issue(@TenantId() tenantId: string, @Param() params: unknown) {
    const parsed = IdParamSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException('Invalid document id');
    }

    return this.notaryService.issueDocument({
      tenantId,
      documentId: parsed.data.id,
    });
  }

  @Get('documents/:id/status')
  @TenantRoles(TenantMemberRole.MEMBER)
  @Audit({
    action: 'NOTARY_STATUS',
    resourceType: 'document',
    resourceIdParam: 'id',
  })
  async status(@TenantId() tenantId: string, @Param() params: unknown) {
    const parsed = IdParamSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException('Invalid document id');
    }

    return this.notaryService.getDocumentStatus(tenantId, parsed.data.id);
  }

  @Get('documents/:id/records')
  @TenantRoles(TenantMemberRole.MEMBER)
  @Audit({
    action: 'NOTARY_LIST_RECORDS',
    resourceType: 'document',
    resourceIdParam: 'id',
  })
  async records(@TenantId() tenantId: string, @Param() params: unknown) {
    const parsed = IdParamSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException('Invalid document id');
    }

    return this.notaryService.listDocumentRecords(tenantId, parsed.data.id);
  }
}
