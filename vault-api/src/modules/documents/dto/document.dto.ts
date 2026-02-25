export class DocumentDto {
  id!: string;
  tenantId!: string;
  vaultId!: string;

  originalName!: string;
  storedName!: string;
  mime!: string;
  sizeBytes!: string;

  createdAt!: string;
}
