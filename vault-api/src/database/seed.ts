import 'dotenv/config';
import { AppDataSource } from './data-source';
import { RoleEntity, RoleName } from './entities/role.entity';

async function main() {
  await AppDataSource.initialize();

  const repo = AppDataSource.getRepository(RoleEntity);
  const roles = [RoleName.ADMIN, RoleName.USER, RoleName.AUDITOR];

  for (const name of roles) {
    const exists = await repo.findOne({ where: { name } });
    if (!exists) await repo.save(repo.create({ name }));
  }

  console.log('✅ Seed complete: roles created/verified');
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('❌ Seed failed', err);
  process.exit(1);
});
