import ngeohash from 'ngeohash';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const danangPartners = [
  {
    userId: 'user-partner-dn-001',
    email: 'dn_banhmique@foodsaver.vn',
    fullName: 'Tiệm Bánh Mì Que Pa-Tê Cột Đèn',
    businessName: 'Bánh Mì Que Cột Đèn Hải Phòng',
    address: '74 Bình Hòa 1, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0225,
    lng: 108.2155,
    phone: '0905111222',
    businessType: 'BAKERY',
    listings: [
      {
        id: 'list-dn-001',
        title: 'Combo 5 Bánh Mì Que Pa-Tê Hải Phòng Giòn Rụm Nóng Hổi',
        description: 'Bánh mì que giòn tan nóng giòn, pa-tê gan béo ngậy tiêu thơm nức mũi, tương ớt cay nồng chuẩn vị.',
        category: 'BAKERY',
        originalPrice: 50000,
        discountPrice: 25000,
        quantity: 8,
        unit: 'combo',
        imageUrls: ['https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600'],
      },
    ],
  },
  {
    userId: 'user-partner-dn-002',
    email: 'dn_artisan_bakery@foodsaver.vn',
    fullName: 'Tiệm Bánh Mì & Cà Phê Phố Cẩm Lệ',
    businessName: 'Tiệm Bánh Phố Cẩm Lệ',
    address: '35 Lê Đại Hành, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0238,
    lng: 108.2128,
    phone: '0905222333',
    businessType: 'BAKERY',
    listings: [
      {
        id: 'list-dn-002',
        title: 'Túi Thần Kỳ Bánh Mì Bơ Tỏi & Croissant Bơ Pháp Nướng Trưa',
        description: 'Gồm 3 croissant thơm bơ và 2 bánh mì nướng bơ tỏi giòn thơm ra lò lúc trưa, còn thơm phức dùng ngon trước 22h.',
        category: 'BAKERY',
        originalPrice: 85000,
        discountPrice: 35000,
        quantity: 6,
        unit: 'túi',
        imageUrls: ['https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600'],
      },
      {
        id: 'list-dn-003',
        title: 'Hộp 6 Bánh Su Kem Vanilla & Phô Mai Tươi Cuối Ngày',
        description: 'Bánh su kem vỏ mỏng nhân custard béo ngậy, bảo quản mát thơm lừng.',
        category: 'BAKERY',
        originalPrice: 60000,
        discountPrice: 28000,
        quantity: 10,
        unit: 'hộp',
        imageUrls: ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600'],
      },
    ],
  },
  {
    userId: 'user-partner-dn-003',
    email: 'dn_comga_bamua@foodsaver.vn',
    fullName: 'Quán Cơm Gà Xối Mỡ & Mì Quảng',
    businessName: 'Cơm Gà & Mì Quảng Bà Mua Cẩm Lệ',
    address: '120 Cách Mạng Tháng 8, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0205,
    lng: 108.2165,
    phone: '0905333444',
    businessType: 'RESTAURANT',
    listings: [
      {
        id: 'list-dn-004',
        title: 'Suất Cơm Gà Xối Mỡ Giòn Rụm Kèm Canh Soup Giờ Vàng',
        description: 'Đùi gà chiên xối mỡ da giòn rụm, cơm nghệ dẻo bùi hạt vàng ươm, kèm canh cải ngọt thanh mát.',
        category: 'COOKED_MEAL',
        originalPrice: 55000,
        discountPrice: 29000,
        quantity: 7,
        unit: 'suất',
        imageUrls: ['https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600'],
      },
      {
        id: 'list-dn-005',
        title: 'Tô Mì Quảng Gà Ta Trứng Cút Nóng Hổi Đậm Vị',
        description: 'Mì Quảng sợi mềm dai, thịt gà ta dai ngọt rim đậm vị, bánh tráng giòn và rau sống tươi sạch.',
        category: 'COOKED_MEAL',
        originalPrice: 45000,
        discountPrice: 22000,
        quantity: 5,
        unit: 'tô',
        imageUrls: ['https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600'],
      },
    ],
  },
  {
    userId: 'user-partner-dn-004',
    email: 'dn_bonbon_tea@foodsaver.vn',
    fullName: 'Trà Sữa & Nước Ép BonBon Đà Nẵng',
    businessName: 'BonBon Tea & Juice Cẩm Lệ',
    address: '56 Ông Ích Đường, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0192,
    lng: 108.2112,
    phone: '0905444555',
    businessType: 'OTHER',
    listings: [
      {
        id: 'list-dn-006',
        title: 'Combo 2 Ly Trà Sữa Oolong Nướng Trân Châu Hoàng Kim',
        description: 'Trà ô long nướng thơm khói đậm vị sữa tươi, trân châu hoàng kim dẻo dai ngọt thanh.',
        category: 'DRINKS',
        originalPrice: 70000,
        discountPrice: 32000,
        quantity: 8,
        unit: 'combo',
        imageUrls: ['https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600'],
      },
      {
        id: 'list-dn-007',
        title: 'Chai Nước Ép Cam Cà Rốt Tươi Nguyên Chất 500ml',
        description: 'Cam sành và cà rốt tươi ép nguyên chất không thêm đường, giàu vitamin C tăng cường miễn dịch.',
        category: 'DRINKS',
        originalPrice: 42000,
        discountPrice: 19000,
        quantity: 6,
        unit: 'chai',
        imageUrls: ['https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600'],
      },
    ],
  },
  {
    userId: 'user-partner-dn-005',
    email: 'dn_comnieu_dathanh@foodsaver.vn',
    fullName: 'Bếp Cơm Niêu Gia Đình Đà Thành',
    businessName: 'Cơm Niêu Gia Đình Đà Thành',
    address: '88 Nguyễn Hữu Thọ, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0272,
    lng: 108.2095,
    phone: '0905555666',
    businessType: 'RESTAURANT',
    listings: [
      {
        id: 'list-dn-008',
        title: 'Set Cơm Niêu Sườn Kho Tộ & Canh Cua Mồng Tơi Nấu Mướp',
        description: 'Cơm niêu cháy giòn 2 mặt, sườn non kho tộ mặn ngọt óng ánh, canh cua mồng tơi rau đay mát rượi.',
        category: 'COOKED_MEAL',
        originalPrice: 95000,
        discountPrice: 45000,
        quantity: 4,
        unit: 'set',
        imageUrls: ['https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600'],
      },
    ],
  },
  {
    userId: 'user-partner-dn-006',
    email: 'dn_greenmart@foodsaver.vn',
    fullName: 'Cửa Hàng Tiện Lợi GreenMart Cẩm Lệ',
    businessName: 'GreenMart Tiện Lợi Cẩm Lệ',
    address: '210 Cách Mạng Tháng 8, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0175,
    lng: 108.2185,
    phone: '0905666777',
    businessType: 'CONVENIENCE_STORE',
    listings: [
      {
        id: 'list-dn-009',
        title: 'Hộp Cơm Bento Nhật Gà Teriyaki Cận Date Đêm',
        description: 'Bento tiêu chuẩn an toàn thực phẩm, cơm Nhật dẻo thơm, gà sốt teriyaki đậm vị, bảo quản mát trong ngày.',
        category: 'COOKED_MEAL',
        originalPrice: 65000,
        discountPrice: 28000,
        quantity: 5,
        unit: 'hộp',
        imageUrls: ['https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600'],
      },
      {
        id: 'list-dn-010',
        title: 'Khay Trái Cây Thập Cẩm Cắt Sẵn Tươi Mát 400g',
        description: 'Gồm dưa hấu, xoài cát, ổi giòn cắt sẵn kèm muối ớt Tây Ninh hảo hạng.',
        category: 'COOKED_MEAL',
        originalPrice: 50000,
        discountPrice: 20000,
        quantity: 9,
        unit: 'khay',
        imageUrls: ['https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=600'],
      },
    ],
  },
  {
    userId: 'user-partner-dn-007',
    email: 'dn_pho_xoviet@foodsaver.vn',
    fullName: 'Phở Bò Gia Truyền Xô Viết Nghệ Tĩnh',
    businessName: 'Phở Gia Truyền Xô Viết',
    address: '15 Xô Viết Nghệ Tĩnh, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0315,
    lng: 108.2182,
    phone: '0905777888',
    businessType: 'RESTAURANT',
    listings: [
      {
        id: 'list-dn-011',
        title: 'Tô Phở Bò Tái Nạm Hầm Xương 12 Tiếng Nước Dùng Đậm Vị',
        description: 'Phở bò tái nạm chuẩn vị Bắc, nước dùng hầm xương bò thảo quả trong vắt ngọt thanh tự nhiên.',
        category: 'COOKED_MEAL',
        originalPrice: 60000,
        discountPrice: 30000,
        quantity: 5,
        unit: 'tô',
        imageUrls: ['https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=600'],
      },
    ],
  },
  {
    userId: 'user-partner-dn-008',
    email: 'dn_banhcanh_ruong@foodsaver.vn',
    fullName: 'Bánh Canh Ruộng Cầu Cẩm Lệ',
    businessName: 'Bánh Canh Ruộng Cẩm Lệ',
    address: '02 Thăng Long, Phường Khuê Trung, Quận Cẩm Lệ, Đà Nẵng',
    lat: 16.0150,
    lng: 108.2090,
    phone: '0905888999',
    businessType: 'RESTAURANT',
    listings: [
      {
        id: 'list-dn-012',
        title: 'Tô Bánh Canh Chả Cá Nóng Giờ Vàng Chiều',
        description: 'Sợi bánh canh gạo dẻo mềm, chả cá chiên vàng giòn dai, nước súp cay cay thơm mùi hành phi giòn rụm.',
        category: 'COOKED_MEAL',
        originalPrice: 38000,
        discountPrice: 18000,
        quantity: 7,
        unit: 'tô',
        imageUrls: ['https://images.unsplash.com/photo-1559847844-5315695dadae?w=600'],
      },
    ],
  },
];

export async function seedDanang() {
  console.log('📍 Seeding realistic Đà Nẵng stores and listings around Khuê Trung, Cẩm Lệ...');
  const defaultPassword = await bcrypt.hash('Partner@123456', 10);

  let totalListings = 0;

  for (const p of danangPartners) {
    // 1. Create Partner User
    await prisma.user.upsert({
      where: { email: p.email },
      update: {
        fullName: p.fullName,
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
      },
      create: {
        id: p.userId,
        email: p.email,
        password: defaultPassword,
        fullName: p.fullName,
        phone: p.phone,
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    // 2. Create Partner Profile
    const profile = await prisma.partnerProfile.upsert({
      where: { userId: p.userId },
      update: {
        businessName: p.businessName,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        geohash: ngeohash.encode(p.lat, p.lng, 7),
        phone: p.phone,
        verificationStatus: 'VERIFIED',
      },
      create: {
        userId: p.userId,
        businessName: p.businessName,
        businessLicenseNo: `040${Math.floor(100000 + Math.random() * 900000)}`,
        businessLicenseUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800',
        foodSafetyCertUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800',
        businessType: p.businessType,
        verificationStatus: 'VERIFIED',
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        geohash: ngeohash.encode(p.lat, p.lng, 7),
        phone: p.phone,
      },
    });

    // 3. Create Listings
    for (const item of p.listings) {
      await prisma.listing.upsert({
        where: { id: item.id },
        update: {
          title: item.title,
          description: item.description,
          category: item.category,
          originalPrice: item.originalPrice,
          discountPrice: item.discountPrice,
          quantity: item.quantity,
          unit: item.unit,
          pickupAddress: p.address,
          lat: p.lat,
          lng: p.lng,
          geohash: ngeohash.encode(p.lat, p.lng, 7),
          imageUrls: item.imageUrls,
          status: 'AVAILABLE',
          expiryAt: new Date(Date.now() + 24 * 3600 * 1000), // Active for 24h
          pickupStartTime: new Date(Date.now() + 1 * 3600 * 1000),
          pickupEndTime: new Date(Date.now() + 20 * 3600 * 1000),
        },
        create: {
          id: item.id,
          partnerId: profile.id,
          title: item.title,
          description: item.description,
          category: item.category,
          originalPrice: item.originalPrice,
          discountPrice: item.discountPrice,
          quantity: item.quantity,
          unit: item.unit,
          pickupAddress: p.address,
          lat: p.lat,
          lng: p.lng,
          geohash: ngeohash.encode(p.lat, p.lng, 7),
          imageUrls: item.imageUrls,
          status: 'AVAILABLE',
          safetyNotes: 'Bảo quản nhiệt độ tiêu chuẩn ATTP, dùng ngon nhất trong ngày hoặc bảo quản mát.',
          expiryAt: new Date(Date.now() + 24 * 3600 * 1000),
          pickupStartTime: new Date(Date.now() + 1 * 3600 * 1000),
          pickupEndTime: new Date(Date.now() + 20 * 3600 * 1000),
          metadata: {
            pickupStartTimeStr: '11:30',
            pickupEndTimeStr: '22:00',
          },
        },
      });
      totalListings++;
    }
  }

  console.log(`✅ Successfully seeded ${danangPartners.length} partners and ${totalListings} listings in Khuê Trung, Cẩm Lệ, Đà Nẵng!`);
}

if (process.argv[1]?.endsWith('seed_danang.js')) {
  seedDanang()
    .catch((err) => {
      console.error('❌ Failed seeding Da Nang data:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
