import { z } from 'zod';

export const TenantSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1).optional(), // por si no lo devolvés todavía
});

export const TenantsListSchema = z.array(TenantSchema);

export type TenantDto = z.infer<typeof TenantSchema>;
