import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateVaultDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  // opcional: si no viene, lo generamos desde name
  @IsOptional()
  @IsString()
  @Length(2, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase and dash-separated (e.g. personal-vault)',
  })
  slug?: string;
}
