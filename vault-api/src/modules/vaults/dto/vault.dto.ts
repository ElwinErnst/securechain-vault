export type VaultDto = Readonly<{
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}>;
