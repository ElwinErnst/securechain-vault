import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditReaderService } from './audit-reader.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RoleName } from 'src/database/entities/role.entity';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditGlobalController {
  constructor(private readonly reader: AuditReaderService) {}

  @Get()
  @Roles(RoleName.AUDITOR, RoleName.ADMIN)
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query() q: AuditQueryDto,
  ) {
    q.page = page;
    q.limit = limit;
    return this.reader.search({ tenantId: null, q });
  }
}
