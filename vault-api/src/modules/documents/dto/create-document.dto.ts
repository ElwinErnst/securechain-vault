import { IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class CreateDocumentDto {
  @IsUUID()
  vaultId!: string;

  // opcional: nombre “amigable” (si no, usamos el original)
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;
}
