import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Seeding database with 6 comprehensive test accounts...');
  const defaultPassword = await bcrypt.hash('Admin@123456', 10);

  // 1. Quản trị viên (Admin)
  await prisma.user.upsert({
    where: { email: 'admin@foodsaver.vn' },
    update: { role: 'ADMIN', status: 'ACTIVE', password: defaultPassword },
    create: {
      id: 'admin-seed-uuid-0001',
      email: 'admin@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Quản Trị Viên (Admin)',
      phone: '0901234567',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  // 2. Quản trị hệ thống (Sys Admin)
  await prisma.user.upsert({
    where: { email: 'sysadmin@foodsaver.vn' },
    update: { role: 'SYS_ADMIN', status: 'ACTIVE', password: defaultPassword },
    create: {
      id: 'sysadmin-seed-uuid-0005',
      email: 'sysadmin@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Quản Trị Hệ Thống (Sys Admin)',
      phone: '0909998888',
      role: 'SYS_ADMIN',
      status: 'ACTIVE',
    },
  });

  // 3. Khách hàng thông thường (Customer / User)
  await prisma.user.upsert({
    where: { email: 'user@foodsaver.vn' },
    update: { role: 'USER', status: 'ACTIVE', password: defaultPassword },
    create: {
      id: 'user-seed-uuid-0002',
      email: 'user@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Nguyễn Văn Khách',
      phone: '0912345678',
      role: 'USER',
      status: 'ACTIVE',
    },
  });

  // 4. Đối tác đã xác thực (Verified Partner)
  const partnerUser = await prisma.user.upsert({
    where: { email: 'partner@foodsaver.vn' },
    update: { role: 'USER', status: 'ACTIVE', password: defaultPassword },
    create: {
      id: 'partner-seed-uuid-0003',
      email: 'partner@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Phạm Minh Bánh Mì Artisan',
      phone: '0987654321',
      role: 'USER',
      status: 'ACTIVE',
    },
  });

  const partnerProfile = await prisma.partnerProfile.upsert({
    where: { userId: partnerUser.id },
    update: { verificationStatus: 'VERIFIED' },
    create: {
      id: 'part-prof-0001',
      userId: partnerUser.id,
      businessName: 'Tiệm Bánh Mì Artisan Bakery',
      businessLicenseNo: '0314892019',
      businessLicenseUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800',
      foodSafetyCertUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800',
      businessType: 'BAKERY',
      verificationStatus: 'VERIFIED',
      address: '128 Nguyễn Trãi, Phường Bến Thành, Quận 1, TP.HCM',
      lat: 10.7712,
      lng: 106.6908,
      geohash: 'w4rwt2',
      phone: '02838383838',
    },
  });

  // 5. Đối tác đang chờ duyệt (Pending Partner)
  const pendingUser = await prisma.user.upsert({
    where: { email: 'pending@foodsaver.vn' },
    update: { role: 'USER', status: 'ACTIVE', password: defaultPassword },
    create: {
      id: 'pending-seed-uuid-0004',
      email: 'pending@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Trần Thị Tiệm Bánh',
      phone: '0912345678',
      role: 'USER',
      status: 'ACTIVE',
    },
  });

  await prisma.partnerProfile.upsert({
    where: { userId: pendingUser.id },
    update: { verificationStatus: 'PENDING', rejectionReason: null },
    create: {
      id: 'part-prof-0002',
      userId: pendingUser.id,
      businessName: 'Cửa Hàng Tiện Lợi GreenMart',
      businessLicenseNo: '0315998877',
      businessLicenseUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800',
      foodSafetyCertUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800',
      businessType: 'CONVENIENCE_STORE',
      verificationStatus: 'PENDING',
      address: '45 Lê Duẩn, Bến Nghé, Quận 1, TP.HCM',
      lat: 10.7795,
      lng: 106.6998,
      geohash: 'w4rwt5',
      phone: '02839393939',
    },
  });

  // 6. Đối tác bị từ chối (Rejected Partner)
  const rejectedUser = await prisma.user.upsert({
    where: { email: 'rejected@foodsaver.vn' },
    update: { role: 'USER', status: 'ACTIVE', password: defaultPassword },
    create: {
      id: 'rejected-seed-uuid-0006',
      email: 'rejected@foodsaver.vn',
      password: defaultPassword,
      fullName: 'Lê Văn Quán Cơm',
      phone: '0922334455',
      role: 'USER',
      status: 'ACTIVE',
    },
  });

  await prisma.partnerProfile.upsert({
    where: { userId: rejectedUser.id },
    update: {
      verificationStatus: 'REJECTED',
      rejectionReason: 'Ảnh Giấy chứng nhận ATTP đã hết hạn hiệu lực, vui lòng chụp và tải lại bản mới nhất.',
    },
    create: {
      id: 'part-prof-0003',
      userId: rejectedUser.id,
      businessName: 'Cơm Niêu Sài Gòn Gourmet',
      businessLicenseNo: '0318223344',
      businessLicenseUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800',
      foodSafetyCertUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800',
      businessType: 'RESTAURANT',
      verificationStatus: 'REJECTED',
      rejectionReason: 'Ảnh Giấy chứng nhận ATTP đã hết hạn hiệu lực, vui lòng chụp và tải lại bản mới nhất.',
      address: '27 Tú Xương, Phường Võ Thị Sáu, Quận 3, TP.HCM',
      lat: 10.7815,
      lng: 106.6852,
      geohash: 'w4rwt1',
      phone: '02839391122',
    },
  });

  // Initial Sample Listing
  await prisma.listing.upsert({
    where: { id: 'list-seed-0001' },
    update: { quantity: 5, status: 'AVAILABLE' },
    create: {
      id: 'list-seed-0001',
      partnerId: partnerProfile.id,
      title: 'Túi Thần Kỳ Bánh Mì Pháp & Croissant Dư Trong Ngày',
      description: 'Gồm 3 bánh sừng trâu bơ Pháp và 1 baguette nướng giòn hôm nay, còn hạn sử dụng đến đêm.',
      category: 'BAKERY',
      originalPrice: 120000,
      discountPrice: 39000,
      quantity: 5,
      unit: 'túi',
      expiryAt: new Date(Date.now() + 2.5 * 3600 * 1000),
      pickupStartTime: new Date(Date.now() + 1 * 3600 * 1000),
      pickupEndTime: new Date(Date.now() + 3 * 3600 * 1000),
      pickupAddress: '128 Nguyễn Trãi, Phường Bến Thành, Quận 1',
      lat: 10.7712,
      lng: 106.6908,
      geohash: 'w4rwt2',
      imageUrls: [
        'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600',
      ],
      safetyNotes: 'Bảo quản nhiệt độ phòng, dùng ngon nhất trong ngày hoặc hâm nóng 3 phút.',
      status: 'AVAILABLE',
      urgencyScore: 0.85,
      wasteRisk: 'HIGH',
    },
  });

  console.log('✅ Seed completed successfully! 6 test accounts created with password: Admin@123456');
}

main()
  .catch((error) => {
    console.error('[Seed] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
