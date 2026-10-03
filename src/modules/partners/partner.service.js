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
  }
};
