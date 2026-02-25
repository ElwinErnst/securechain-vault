import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../modules/auth/types/auth-user.type';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    if (!user?.id) throw new UnauthorizedException('missing user id');
    return this.tenantsService.listMyTenants(user.id);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    if (!user?.id) throw new UnauthorizedException('missing user id');
    return this.tenantsService.createOrgTenant(dto, user.id);
  }
}
