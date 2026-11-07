import ngeohash from 'ngeohash';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';

export const PartnerService = {
  /**
   * Nộp hoặc cập nhật lại hồ sơ đối tác F&B (B2C thuần túy)
   */
  async applyPartner(userId, data) {
    const applicant = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true }
    });

    if (!applicant?.emailVerified) {
      throw ApiError.forbidden('Vui lòng xác thực email trước khi gửi hồ sơ đối tác');
    }

    const geohash = ngeohash.encode(data.lat, data.lng, 7);

    const existingProfile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });

    if (existingProfile) {
      if (existingProfile.verificationStatus === 'VERIFIED') {
        throw ApiError.badRequest('Tài khoản của bạn đã là đối tác kinh doanh được xác thực');
      }

      if (existingProfile.verificationStatus === 'PENDING') {
        throw ApiError.badRequest('Hồ sơ của bạn đang trong tiến trình thẩm định, vui lòng chờ kết quả');
      }

      // Nếu bị REJECTED trước đó -> cho phép cập nhật lại và nộp lại
      return prisma.partnerProfile.update({
        where: { userId },
        data: {
          businessName: data.businessName,
          businessLicenseNo: data.businessLicenseNo,
          businessLicenseUrl: data.businessLicenseUrl,
          foodSafetyCertUrl: data.foodSafetyCertUrl,
          businessType: data.businessType,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          geohash,
          phone: data.phone,
          verificationStatus: 'PENDING',
          rejectionReason: null,
          verifiedBy: null,
          verifiedAt: null
        }
      });
    }

    return prisma.partnerProfile.create({
      data: {
        userId,
        businessName: data.businessName,
        businessLicenseNo: data.businessLicenseNo,
        businessLicenseUrl: data.businessLicenseUrl,
        foodSafetyCertUrl: data.foodSafetyCertUrl,
        businessType: data.businessType,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        geohash,
        phone: data.phone,
        verificationStatus: 'PENDING'
      }
    });
  },

  /**
   * Lấy thông tin hồ sơ đối tác của user hiện tại
   */
  async getMyPartnerProfile(userId) {
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return {
        verificationStatus: 'NONE'
      };
    }

    return profile;
  },

  /**
   * Admin: Lấy danh sách hồ sơ đối tác (hỗ trợ filter status)
   */
  async getPartners({ status } = {}) {
    const where = {};
    if (status && ['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
      where.verificationStatus = status;
    }

    return prisma.partnerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            avatar: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  },

  /**
   * Admin: Lấy danh sách hồ sơ đối tác đang chờ thẩm định
   */
  async getPendingPartners() {
    return this.getPartners({ status: 'PENDING' });
  },

  /**
   * Admin: Phê duyệt hoặc từ chối hồ sơ đối tác F&B
   */
  async verifyPartner(partnerId, adminId, { status, rejectionReason }) {
    let existing = await prisma.partnerProfile.findUnique({
      where: { id: partnerId }
    });

    if (!existing) {
      existing = await prisma.partnerProfile.findUnique({
        where: { userId: partnerId }
      });
    }

    if (!existing) {
      throw ApiError.notFound('Không tìm thấy hồ sơ đối tác yêu cầu');
    }

    if (status === 'REJECTED' && (!rejectionReason || !rejectionReason.trim())) {
      throw ApiError.badRequest('Vui lòng nêu rõ lý do từ chối hồ sơ đối tác');
    }

    const updatedProfile = await prisma.partnerProfile.update({
      where: { id: existing.id },
      data: {
        verificationStatus: status,
        rejectionReason: status === 'REJECTED' ? rejectionReason.trim() : null,
        verifiedBy: adminId,
        verifiedAt: new Date()
      }
    });

    // Tạo thông báo in-app tự động gửi cho đối tác
    await prisma.notification.create({
      data: {
        userId: updatedProfile.userId,
        type: status === 'VERIFIED' ? 'PARTNER_VERIFIED' : 'PARTNER_REJECTED',
        title:
          status === 'VERIFIED'
            ? 'Hồ sơ đối tác đã được phê duyệt!'
            : 'Hồ sơ đối tác bị từ chối xét duyệt',
        message:
          status === 'VERIFIED'
            ? 'Chúc mừng! Cơ sở của bạn đã được xác thực an toàn vệ sinh thực phẩm. Bạn có thể bắt đầu đăng bán thực phẩm cứu trợ ngay.'
            : `Hồ sơ bị từ chối với lý do: "${rejectionReason}". Bạn có thể chỉnh sửa lại tài liệu và nộp lại bất kỳ lúc nào.`
      }
    });

    return updatedProfile;
  },

  /**
   * Theo dõi hoặc bỏ theo dõi quán yêu thích (Partner Follow)
   */
  async toggleFollowPartner(userId, partnerId) {
    const partner = await prisma.partnerProfile.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw ApiError.notFound('Không tìm thấy đối tác này');
    }

    if (partner.userId === userId) {
      throw ApiError.badRequest('Bạn không thể tự theo dõi cửa hàng của chính mình');
    }

    const existing = await prisma.partnerFollow.findUnique({
      where: {
        userId_partnerId: {
          userId,
          partnerId,
        },
      },
    });

    if (existing) {
      await prisma.partnerFollow.delete({
        where: { id: existing.id },
      });
      const followerCount = await prisma.partnerFollow.count({
        where: { partnerId },
      });
      return { isFollowing: false, followerCount };
    } else {
      await prisma.partnerFollow.create({
        data: {
          userId,
          partnerId,
          notifyNewListing: true,
        },
      });
      const followerCount = await prisma.partnerFollow.count({
        where: { partnerId },
      });
      return { isFollowing: true, followerCount };
    }
  },

  /**
   * Kiểm tra trạng thái theo dõi quán
   */
  async getFollowStatus(userId, partnerId) {
    const followerCount = await prisma.partnerFollow.count({
      where: { partnerId },
    });

    if (!userId) {
      return { isFollowing: false, followerCount };
    }

    const existing = await prisma.partnerFollow.findUnique({
      where: {
        userId_partnerId: {
          userId,
          partnerId,
        },
      },
    });

    return { isFollowing: !!existing, followerCount };
  },

  /**
   * Danh sách quán đang theo dõi của người dùng
   */
  async getFollowedPartners(userId) {
    const follows = await prisma.partnerFollow.findMany({
      where: { userId },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            address: true,
            phone: true,
            lat: true,
            lng: true,
            verificationStatus: true,
            user: { select: { avatar: true } },
            listings: {
              where: {
                status: 'AVAILABLE',
                expiryAt: { gt: new Date() },
              },
              select: { id: true, title: true, discountPrice: true, expiryAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return follows.map((f) => ({
      followId: f.id,
      partnerId: f.partner.id,
      businessName: f.partner.businessName,
      businessType: f.partner.businessType,
      address: f.partner.address,
      phone: f.partner.phone,
      avatar: f.partner.user?.avatar || null,
      activeListingCount: f.partner.listings?.length || 0,
      activeListings: f.partner.listings || [],
      followedAt: f.createdAt,
    }));
  },

  /**
   * Cập nhật thông tin cài đặt cửa hàng của đối tác
   */
  async updateMyPartnerProfile(userId, data) {
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      throw ApiError.notFound('Chưa tìm thấy hồ sơ đối tác của bạn');
    }

    const updateData = {};
    if (data.businessName !== undefined) updateData.businessName = data.businessName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.lat !== undefined && data.lng !== undefined) {
      updateData.lat = data.lat;
      updateData.lng = data.lng;
      updateData.geohash = ngeohash.encode(data.lat, data.lng, 7);
    }

    // Gộp metadata (giờ lấy đồ, hướng dẫn nhận món, trạng thái mở quán)
    const currentMeta = (profile.metadata && typeof profile.metadata === 'object') ? profile.metadata : {};
    const newMeta = {
      ...currentMeta,
      defaultPickupStart: data.defaultPickupStart || currentMeta.defaultPickupStart || '18:00',
      defaultPickupEnd: data.defaultPickupEnd || currentMeta.defaultPickupEnd || '21:30',
      pickupInstructions: data.pickupInstructions !== undefined ? data.pickupInstructions : currentMeta.pickupInstructions,
      isOpen: data.isOpen !== undefined ? Boolean(data.isOpen) : (currentMeta.isOpen ?? true)
    };
    updateData.metadata = newMeta;

    return prisma.partnerProfile.update({
      where: { id: profile.id },
      data: updateData
    });
  },

  /**
   * Lấy danh sách đánh giá của quán đối tác hiện tại
   */
  async getMyPartnerReviews(userId, { page = 1, limit = 20 } = {}) {
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      throw ApiError.notFound('Chưa tìm thấy hồ sơ đối tác');
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
      prisma.orderReview.findMany({
        where: { partnerId: profile.id },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { fullName: true, avatar: true } },
          order: {
            select: {
              orderNumber: true,
              listing: { select: { title: true, imageUrls: true } }
            }
          }
        }
      }),
      prisma.orderReview.count({ where: { partnerId: profile.id } })
    ]);

    const aggregate = await prisma.orderReview.aggregate({
      where: { partnerId: profile.id },
      _avg: { rating: true },
      _count: true
    });

    return {
      reviews,
      total,
      avgRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : 5.0,
      totalReviews: aggregate._count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  },

};
