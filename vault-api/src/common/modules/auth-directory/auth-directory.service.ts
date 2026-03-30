import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantMemberRole } from '../../../database/entities/tenant-member.entity';

type AuthDirectoryConfig = {
  baseUrl: string;
  serviceSecret: string;
  timeoutMs: number;
};

export type RemoteMembership = {
  userId: string;
  tenantId: string;
  role: TenantMemberRole;
  isActive: boolean;
};

export type RemoteUserTenant = {
  id: string;
  name: string;
  slug: string;
  planCode: string | null;
  isActive: boolean;
  role: TenantMemberRole;
  membershipActive: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AuthDirectoryService {
  private readonly cfg: AuthDirectoryConfig;

  constructor(private readonly config: ConfigService) {
    this.cfg = this.config.get<AuthDirectoryConfig>('authDirectory')!;
  }

  async getMembership(
    userId: string,
    tenantId: string,
  ): Promise<RemoteMembership | null> {
    const url = this.buildUrl('internal/memberships/resolve');
    url.searchParams.set('userId', userId);
    url.searchParams.set('tenantId', tenantId);

    const res = await this.fetchJson<RemoteMembership>(url.toString(), {
      allow404: true,
    });

    return res;
  }

  async listUserTenants(userId: string): Promise<RemoteUserTenant[]> {
    const url = this.buildUrl(`internal/users/${userId}/tenants`);
    return (await this.fetchJson<RemoteUserTenant[]>(url.toString())) ?? [];
  }

  private buildUrl(path: string): URL {
    const base = this.cfg.baseUrl.endsWith('/')
      ? this.cfg.baseUrl
      : `${this.cfg.baseUrl}/`;

    return new URL(path, base);
  }

  private async fetchJson<T>(
    url: string,
    options?: { allow404?: boolean },
  ): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-internal-service-secret': this.cfg.serviceSecret,
        },
        signal: controller.signal,
      });

      if (options?.allow404 && res.status === 404) {
        return null;
      }

      if (res.status === 404) {
        throw new NotFoundException('Auth directory resource not found');
      }

      if (res.status === 403) {
        throw new ForbiddenException('Auth directory rejected service request');
      }

      if (!res.ok) {
        throw new InternalServerErrorException(
          `Auth directory request failed with status ${res.status}`,
        );
      }

      return (await res.json()) as T;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Auth directory request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
