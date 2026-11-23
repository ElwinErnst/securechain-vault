import 'dotenv/config';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  // Schema is owned by the SQL init scripts in infra/postgres/init (and applied
  // via apply-upgrades.sh), never by TypeORM. This CLI data source is used by
  // the seed script, which must read/write existing tables without mutating the
  // schema. Keep it false to match the runtime config (synchronize only in test).
  synchronize: false,
  migrations: [],
  logging: true,
});
