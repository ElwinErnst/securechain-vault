import {
  ConflictException,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';

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
  async create(@CurrentUser() user: AuthUser) {
    if (!user?.id) throw new UnauthorizedException('missing user id');
    throw new ConflictException(
      'Tenant creation is owned by auth-api. Create tenants through auth-api and let vault consume them via auth directory.',
    );
  }
}
