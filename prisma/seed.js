import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Seeding database with initial users...');
  const defaultPassword = await bcrypt.hash('Admin@123456', 10);

  const seedUsers = [
    {
      id: 'admin-seed-uuid-0001',
      email: 'admin@foodsaver.vn',
      password: defaultPassword,
      fullName: 'System Administrator',
      phone: '0901234567',
      role: 'ADMIN',
      status: 'ACTIVE'
    },
    {
      id: 'user-seed-uuid-0002',
      email: 'user@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Nguyen Van A',
      phone: '0912345678',
      role: 'USER',
      status: 'ACTIVE'
    },
    {
      id: 'partner-seed-uuid-0003',
      email: 'partner@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Nha Hang Xanh',
      phone: '0987654321',
      role: 'PARTNER',
      status: 'ACTIVE'
    }
  ];

  for (const user of seedUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user
    });
  }

  console.log('✅ Seed completed successfully! Accounts created with password: Admin@123456');
}

main()
  .catch((error) => {
    console.error('[Seed] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
