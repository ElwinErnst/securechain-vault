import { registerAs } from '@nestjs/config';

export type StorageDriver = 'local' | 'minio'; // luego: 's3'

export default registerAs('storage', () => ({
  driver: (process.env.STORAGE_DRIVER as StorageDriver) || 'local',
  local: {
    rootDir: process.env.STORAGE_LOCAL_ROOT_DIR || './storage',
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'vault',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  },
}));
