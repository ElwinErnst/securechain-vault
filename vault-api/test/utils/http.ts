import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';

export function http(app: INestApplication) {
  const server = app.getHttpServer() as unknown as Server;
  return request(server);
}
