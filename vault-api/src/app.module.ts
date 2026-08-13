import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import databaseConfig from './config/database.config';
import storageConfig from './config/storage.config';
import { documentsConfig } from './config/documents.config';
import ztConfig from './config/zt.config';
import authDirectoryConfig from './config/auth-directory.config';
import { TenantsModule } from './modules/tenants/tenants.module';
import { VaultsModule } from './modules/vaults/vaults.module';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AccessControlModule } from './common/modules/access-control/access-control.module';
import { AnchorModule } from './modules/anchor/anchor.module';
import { AuthDirectoryModule } from './common/modules/auth-directory/auth-directory.module';
import { NotaryModule } from './modules/notary/notary.module';
import { ReplayModule } from './common/replay/replay.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        storageConfig,
        documentsConfig,
        ztConfig,
        authDirectoryConfig,
      ],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return configService.get('database')!;
      },
    }),

    ScheduleModule.forRoot(),
    ReplayModule,

    // Per-IP rate limiting. Generous defaults (300 req/min) — enough for normal
    // use, low enough to blunt brute-force/scraping. Tunable via env.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 300),
      },
    ]),

    TenantsModule,
    VaultsModule,
    AuditModule,
    DocumentsModule,
    AccessControlModule,
    AnchorModule,
    NotaryModule,
    AuthDirectoryModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
