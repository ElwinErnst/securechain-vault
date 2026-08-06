import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { TenantRbacGuard } from '../../common/guards/tenant-rbac.guard';
import { TenantRoles } from '../../common/decorators/tenant-roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { AuditReaderService } from './audit-reader.service';
import { AuditVerifierService } from './audit-verifier.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { TenantMemberRole } from 'src/database/entities/tenant-member.entity';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, TenantContextGuard, TenantRbacGuard)
export class AuditTenantController {
  constructor(
    private readonly reader: AuditReaderService,
    private readonly verifier: AuditVerifierService,
  ) {}

  @Get()
  @TenantRoles(TenantMemberRole.OWNER, TenantMemberRole.ADMIN)
  async list(
    @TenantId() tenantId: string,
    @Query(new ValidationPipe({ transform: true })) q: AuditQueryDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.reader.search({ tenantId, q: { ...q, page, limit } });
  }

  /**
   * Verify the integrity of this tenant's audit chain. The tenant's scope is
   * its own id (see AuditService.createChained).
   */
  @Get('verify')
  @TenantRoles(TenantMemberRole.OWNER, TenantMemberRole.ADMIN)
  async verify(@TenantId() tenantId: string) {
    return this.verifier.verifyScope(tenantId);
  }
}
