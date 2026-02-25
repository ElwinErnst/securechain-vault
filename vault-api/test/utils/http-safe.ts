import type { Response } from 'supertest';

export function bodyAs<T>(res: Response, guard: (x: unknown) => x is T): T {
  const body: unknown = res.body;

  if (!guard(body)) {
    throw new Error('Invalid response body shape');
  }

  return body;
}
