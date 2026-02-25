import { z } from 'zod';

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const TenantResponseSchema = z.object({
  id: z.string().uuid().or(z.string()), // por si no es uuid estricto en tests
  name: z.string(),
  slug: z.string(),
  type: z.string(),
  ownerUserId: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()).optional(),
  updatedAt: z.string().or(z.date()).optional(),
});

export const TenantsListSchema = z.array(TenantResponseSchema);
