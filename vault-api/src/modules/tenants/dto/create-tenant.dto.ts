import { IsEnum, IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { TenantType } from '../../../database/entities/tenant.entity';

export class CreateTenantDto {
  @IsEnum(TenantType)
  type!: TenantType; // ORG | PERSONAL (por ahora creamos ORG desde endpoint)

  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase, alphanumeric, hyphen-separated',
  })
  slug!: string;
}
