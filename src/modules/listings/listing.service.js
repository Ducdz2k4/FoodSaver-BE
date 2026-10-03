import ngeohash from 'ngeohash';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { evaluateListingWithJev } from '../../shared/utils/jev.js';
import { broadcastEvent } from '../../config/socket.js';

// Haversine distance calculator between 2 points (lat, lng) in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export const ListingService = {
  /**
   * Tạo món ăn giải cứu mới bởi đối tác đã verified
   */
  async createListing(userId, data) {
    const partnerProfile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });

    if (!partnerProfile || partnerProfile.verificationStatus !== 'VERIFIED') {
      throw ApiError.forbidden('Chỉ đối tác đã được xác thực (VERIFIED) mới có quyền đăng món ăn');
    }

    const lat = data.lat !== undefined ? data.lat : Number(partnerProfile.lat);
    const lng = data.lng !== undefined ? data.lng : Number(partnerProfile.lng);
    const geohash = ngeohash.encode(lat, lng, 7);
    const pickupAddress = data.pickupAddress || partnerProfile.address;

    // Chấm điểm và phân loại rủi ro thông minh bằng AI Jev
    const jevEvaluation = await evaluateListingWithJev({
      ...data,
      lat,
      lng
    });

    const listing = await prisma.listing.create({
      data: {
        partnerId: partnerProfile.id,
        title: data.title,
        description: data.description || null,
        category: data.category,
        originalPrice: data.originalPrice,
        discountPrice: data.discountPrice,
        quantity: data.quantity,
        unit: data.unit || 'phần',
        expiryAt: new Date(data.expiryAt),
        pickupStartTime: new Date(), // Storing datetime or keeping default
        pickupEndTime: new Date(data.expiryAt),
        pickupAddress,
        lat,
        lng,
        geohash,
        imageUrls: data.imageUrls,
        safetyNotes: data.safetyNotes || null,
        status: 'AVAILABLE',
        urgencyScore: jevEvaluation.urgencyScore,
        wasteRisk: jevEvaluation.wasteRisk,
        metadata: {
          pickupStartTimeStr: data.pickupStartTime,
          pickupEndTimeStr: data.pickupEndTime,
          shouldDeepDiscount: jevEvaluation.shouldDeepDiscount,
          confidence: jevEvaluation.confidence,
          aiModel: jevEvaluation.modelUsed || 'jev-1.13.0'
        }
      },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            address: true,
            foodSafetyCertUrl: true,
            phone: true
          }
        }
      }
    });

    // Bắn realtime event
    broadcastEvent('LISTING_UPDATED', { id: listing.id, action: 'CREATED' });

    return listing;
  },

  /**
   * Lấy danh sách món ăn của đối tác đăng nhập
   */
  async getPartnerListings(userId, { status, page = 1, limit = 20 } = {}) {
    const partnerProfile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });

    if (!partnerProfile) {
      throw ApiError.forbidden('Chưa tìm thấy hồ sơ đối tác của bạn');
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      partnerId: partnerProfile.id
    };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          partner: {
            select: {
              businessName: true,
              address: true,
              foodSafetyCertUrl: true
            }
          }
        }
      }),
      prisma.listing.count({ where })
    ]);

    return {
      listings: listings.map((l) => ({
        ...l,
        pickupStartTime: l.metadata?.pickupStartTimeStr || '18:00',
        pickupEndTime: l.metadata?.pickupEndTimeStr || '21:30'
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  },

  /**
   * Cập nhật món ăn
   */
  async updateListing(userId, id, data) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { partner: true }
    });

    if (!listing) {
      throw ApiError.notFound('Không tìm thấy món ăn');
    }

    if (listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền chỉnh sửa món ăn này');
    }

    const updateData = { ...data };

    if (data.expiryAt) {
      updateData.expiryAt = new Date(data.expiryAt);
    }
    if (data.lat && data.lng) {
      updateData.geohash = ngeohash.encode(data.lat, data.lng, 7);
    }

    if (data.pickupStartTime || data.pickupEndTime) {
      updateData.metadata = {
        ...(listing.metadata || {}),
        pickupStartTimeStr: data.pickupStartTime || listing.metadata?.pickupStartTimeStr,
        pickupEndTimeStr: data.pickupEndTime || listing.metadata?.pickupEndTimeStr
      };
    }

    // Nếu thay đổi hạn dùng, giá hoặc số lượng -> gọi Jev đánh giá lại
    if (data.expiryAt || data.discountPrice || data.quantity) {
      try {
        const jevEvaluation = await evaluateListingWithJev({
          title: data.title || listing.title,
          category: data.category || listing.category,
          originalPrice: data.originalPrice || listing.originalPrice,
          discountPrice: data.discountPrice || listing.discountPrice,
          quantity: data.quantity !== undefined ? data.quantity : listing.quantity,
          expiryAt: data.expiryAt || listing.expiryAt,
          pickupStartTime: data.pickupStartTime || listing.metadata?.pickupStartTimeStr || '18:00',
          pickupEndTime: data.pickupEndTime || listing.metadata?.pickupEndTimeStr || '21:30'
        });
        updateData.urgencyScore = jevEvaluation.urgencyScore;
        updateData.wasteRisk = jevEvaluation.wasteRisk;
      } catch {
        // Continue with update
      }
    }

    delete updateData.pickupStartTime;
    delete updateData.pickupEndTime;

    const updated = await prisma.listing.update({
      where: { id },
      data: updateData,
      include: {
        partner: {
          select: {
            businessName: true,
            address: true,
            foodSafetyCertUrl: true
          }
        }
      }
    });

    broadcastEvent('LISTING_UPDATED', { id: updated.id, action: 'UPDATED' });
    return updated;
  },

  /**
   * Bật/Tắt trạng thái hiển thị
   */
  async toggleStatus(userId, id, status, isAdmin = false) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { partner: true }
    });

    if (!listing) {
      throw ApiError.notFound('Không tìm thấy món ăn');
    }

    if (!isAdmin && listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền thay đổi trạng thái món ăn này');
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: { status }
    });

    broadcastEvent('LISTING_UPDATED', { id: updated.id, action: 'STATUS_CHANGED', status });
    return updated;
  },

  /**
   * Xóa món ăn nếu chưa có đơn hàng liên quan
   */
  async deleteListing(userId, id) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { partner: true, orders: true }
    });

    if (!listing) {
      throw ApiError.notFound('Không tìm thấy món ăn');
    }

    if (listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền xóa món ăn này');
    }

    if (listing.orders && listing.orders.length > 0) {
      // Đã có đơn hàng liên quan, chuyển sang UNAVAILABLE thay vì xóa cứng
      return prisma.listing.update({
        where: { id },
        data: { status: 'UNAVAILABLE' }
      });
    }

    return prisma.listing.delete({ where: { id } });
  },

  /**
   * Khách hàng: Tìm kiếm và khám phá món ăn lân cận tối ưu Geohash
   */
  async getPublicListings({
    search,
    category,
    lat,
    lng,
    radiusKm = 5,
    urgentOnly,
    sortBy = 'EXPIRY',
    page = 1,
    limit = 12
  } = {}) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      status: urgentOnly ? 'EXPIRING_SOON' : 'AVAILABLE',
      expiryAt: { gt: new Date() }
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { partner: { businessName: { contains: search } } }
      ];
    }

    // Geohash filtering: If coordinates provided, filter by geohash prefix
    if (lat !== undefined && lng !== undefined) {
      const precision = radiusKm <= 2 ? 6 : radiusKm <= 6 ? 5 : 4;
      const geohashPrefix = ngeohash.encode(lat, lng, precision);
      where.geohash = { startsWith: geohashPrefix };
    }

    let orderBy = [{ expiryAt: 'asc' }];
    if (sortBy === 'PRICE_ASC') orderBy = [{ discountPrice: 'asc' }];
    if (sortBy === 'PRICE_DESC') orderBy = [{ discountPrice: 'desc' }];
    if (sortBy === 'URGENCY') orderBy = [{ urgencyScore: 'desc' }, { expiryAt: 'asc' }];
    if (sortBy === 'NEWEST') orderBy = [{ createdAt: 'desc' }];

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        include: {
          partner: {
            select: {
              id: true,
              businessName: true,
              address: true,
              foodSafetyCertUrl: true,
              phone: true,
              lat: true,
              lng: true
            }
          }
        }
      }),
      prisma.listing.count({ where })
    ]);

    const formattedListings = listings.map((l) => {
      let distanceKm = undefined;
      if (lat !== undefined && lng !== undefined) {
        distanceKm = calculateDistance(lat, lng, Number(l.lat), Number(l.lng));
      }
      return {
        id: l.id,
        partnerId: l.partnerId,
        partnerName: l.partner.businessName,
        partnerAddress: l.pickupAddress || l.partner.address,
        foodSafetyCertUrl: l.partner.foodSafetyCertUrl,
        title: l.title,
        description: l.description || '',
        category: l.category,
        originalPrice: Number(l.originalPrice),
        discountPrice: Number(l.discountPrice),
        quantity: l.quantity,
        unit: l.unit,
        expiryAt: l.expiryAt.toISOString(),
        pickupStartTime: l.metadata?.pickupStartTimeStr || '18:00',
        pickupEndTime: l.metadata?.pickupEndTimeStr || '21:30',
        pickupAddress: l.pickupAddress,
        lat: Number(l.lat),
        lng: Number(l.lng),
        distanceKm,
        imageUrls: l.imageUrls,
        safetyNotes: l.safetyNotes || '',
        status: l.status,
        urgencyScore: l.urgencyScore,
        wasteRisk: l.wasteRisk,
        createdAt: l.createdAt.toISOString()
      };
    });

    return {
      listings: formattedListings,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  },

  /**
   * Xem chi tiết món ăn công khai
   */
  async getListingById(id, userLat, userLng) {
    const l = await prisma.listing.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            businessLicenseNo: true,
            address: true,
            foodSafetyCertUrl: true,
            phone: true,
            lat: true,
            lng: true
          }
        }
      }
    });

    if (!l) {
      throw ApiError.notFound('Không tìm thấy thông tin món ăn');
    }

    let distanceKm = undefined;
    if (userLat !== undefined && userLng !== undefined) {
      distanceKm = calculateDistance(userLat, userLng, Number(l.lat), Number(l.lng));
    }

    return {
      id: l.id,
      partnerId: l.partnerId,
      partnerName: l.partner.businessName,
      partnerLicenseNo: l.partner.businessLicenseNo,
      partnerAddress: l.pickupAddress || l.partner.address,
      foodSafetyCertUrl: l.partner.foodSafetyCertUrl,
      title: l.title,
      description: l.description || '',
      category: l.category,
      originalPrice: Number(l.originalPrice),
      discountPrice: Number(l.discountPrice),
      quantity: l.quantity,
      unit: l.unit,
      expiryAt: l.expiryAt.toISOString(),
      pickupStartTime: l.metadata?.pickupStartTimeStr || '18:00',
      pickupEndTime: l.metadata?.pickupEndTimeStr || '21:30',
      pickupAddress: l.pickupAddress,
      lat: Number(l.lat),
      lng: Number(l.lng),
      distanceKm,
      imageUrls: l.imageUrls,
      safetyNotes: l.safetyNotes || '',
      status: l.status,
      urgencyScore: l.urgencyScore,
      wasteRisk: l.wasteRisk,
      createdAt: l.createdAt.toISOString()
    };
  },

  /**
   * Admin: Quản lý danh sách tất cả món ăn
   */
  async getAdminListings({ search, status, page = 1, limit = 20 } = {}) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { partner: { businessName: { contains: search } } }
      ];
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          partner: {
            select: {
              businessName: true,
              address: true,
              phone: true
            }
          }
        }
      }),
      prisma.listing.count({ where })
    ]);

    return {
      listings,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  }
};
