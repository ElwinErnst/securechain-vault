import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RoleName } from 'src/database/entities/role.entity';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthUser } from './types/auth-user.type';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { RefreshDto } from './dto/refresh.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.authService.validateUser(dto.email, dto.password);
    return this.authService.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @Get('admin-only')
  adminOnly(): { ok: true } {
    return { ok: true };
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Headers('user-agent') userAgent?: string,
    // IP real detrás de proxy lo vemos después; por ahora lo dejamos opcional
  ): Promise<RefreshResponseDto> {
    return this.authService.refresh(dto.refreshToken, { userAgent });
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<LogoutResponseDto> {
    return this.authService.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthUser) {
    return this.authService.revokeAll(user.id);
  }
}
