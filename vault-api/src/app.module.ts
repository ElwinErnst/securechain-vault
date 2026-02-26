import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import databaseConfig from './config/database.config';
import storageConfig from './config/storage.config';
import { documentsConfig } from './config/documents.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { VaultsModule } from './modules/vaults/vaults.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AccessControlModule } from './common/modules/access-control/access-control.module';
import { AnchorModule } from './modules/anchor/anchor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, storageConfig, documentsConfig], // carga también la config de storage
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return configService.get('database')!;
      },
    }),

    ScheduleModule.forRoot(),

    UsersModule,
    AuthModule,
    TenantsModule,
    VaultsModule,
    AuditModule,
    DocumentsModule,
    AccessControlModule,
    AnchorModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
