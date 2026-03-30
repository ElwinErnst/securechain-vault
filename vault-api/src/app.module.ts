import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import databaseConfig from './config/database.config';
import storageConfig from './config/storage.config';
import { documentsConfig } from './config/documents.config';
import ztConfig from './config/zt.config';
import authDirectoryConfig from './config/auth-directory.config';
import { TenantsModule } from './modules/tenants/tenants.module';
import { VaultsModule } from './modules/vaults/vaults.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AccessControlModule } from './common/modules/access-control/access-control.module';
import { AnchorModule } from './modules/anchor/anchor.module';
import { AuthDirectoryModule } from './common/modules/auth-directory/auth-directory.module';

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

    TenantsModule,
    VaultsModule,
    AuditModule,
    DocumentsModule,
    AccessControlModule,
    AnchorModule,
    AuthDirectoryModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
