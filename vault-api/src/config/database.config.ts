import { registerAs } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

export default registerAs(
  'database',
  (): DataSourceOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5433),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [__dirname + '/../database/entities/*.{ts,js}'],
    synchronize: process.env.NODE_ENV === 'test',
    logging: process.env.NODE_ENV !== 'production',
    migrations: [__dirname + '/../database/migrations/*.{ts,js}'],
    // opcional:
    // migrationsRun: process.env.NODE_ENV === 'test',
  }),
);
