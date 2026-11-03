import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { HttpStatus } from '../../shared/constants/httpStatus.js';
import { emitToUser } from '../../config/socket.js';

export const VALID_ISSUE_TYPES = [
  'EXPIRED_FOOD',
  'STRANGE_ODOR_MOLD',
  'DAMAGED_PACKAGING',
  'FOREIGN_OBJECT',
  'HEALTH_SYMPTOM',
  'OTHER',
];

export const VALID_SAFETY_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED'];

export const SafetyReportService = {
  /**
   * Khách hàng: Gửi báo cáo sự cố an toàn thực phẩm
   */
  async createReport(userId, orderId, { issueType, description, evidenceUrls } = {}) {
    if (!description || !description.trim()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'Vui lòng cung cấp mô tả chi tiết sự cố gặp phải');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
      },
    });

    if (!order) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy đơn hàng yêu cầu');
    }

    if (order.customerId !== userId) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'Chỉ khách hàng sở hữu đơn mới có quyền gửi báo cáo sự cố');
    }

    const allowedStatuses = ['HANDED_OVER', 'COMPLETED', 'DISPUTED'];
    if (!allowedStatuses.includes(order.status)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'Chỉ có thể báo cáo sự cố sau khi đã nhận món ăn từ cửa hàng'
      );
    }

    // Chống báo cáo trùng lặp khi đang xử lý
    const existingActive = await prisma.foodSafetyReport.findFirst({
      where: {
        orderId,
        status: { in: ['OPEN', 'REVIEWING'] },
      },
    });

    if (existingActive) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Đơn hàng này đang có báo cáo sự cố #${existingActive.reportNumber} đang được tiếp nhận và xử lý`
      );
    }

    const reportNumber = `FSR-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
    const validEvidence = Array.isArray(evidenceUrls)
      ? evidenceUrls.filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 5)
      : [];

    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.foodSafetyReport.create({
        data: {
          reportNumber,
          orderId,
          customerId: userId,
          partnerId: order.listing.partnerId,
          listingId: order.listingId,
          issueType: VALID_ISSUE_TYPES.includes(issueType) ? issueType : 'OTHER',
          description: description.trim(),
          evidenceUrls: validEvidence,
          status: 'OPEN',
        },
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          listing: { select: { id: true, title: true } },
          partner: { select: { id: true, businessName: true } },
        },
      });

      // Chuyển đơn sang trạng thái DISPUTED nếu chưa phải
      if (order.status !== 'DISPUTED') {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'DISPUTED',
            disputedAt: new Date(),
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            oldStatus: order.status,
            newStatus: 'DISPUTED',
            changedBy: userId,
            note: `Khách hàng gửi báo cáo sự cố ATTP #${reportNumber}`,
          },
        });
      }

      return created;
    });

    return report;
  },

  /**
   * Lấy báo cáo sự cố của đơn hàng (bảo vệ quyền riêng tư)
   */
  async getReportByOrder(userId, role, orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
      },
    });

    if (!order) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy đơn hàng');
    }

    const isCustomer = order.customerId === userId;
    const isPartner = order.listing?.partner?.userId === userId;
    const isAdmin = role === 'ADMIN' || role === 'SYS_ADMIN';

    if (!isCustomer && !isPartner && !isAdmin) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'Bạn không có quyền truy cập thông tin sự cố của đơn hàng này');
    }

    const report = await prisma.foodSafetyReport.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true } },
        partner: { select: { id: true, businessName: true } },
        // Partner chỉ xem nội dung phân loại, không được xem PII khách hàng
        customer: isPartner
          ? false
          : { select: { id: true, fullName: true, phone: true } },
      },
    });

    return report;
  },

  /**
   * Admin: Danh sách hàng đợi xử lý sự cố ATTP
   */
  async getAdminReports({ status, issueType, page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (issueType && issueType !== 'ALL') {
      where.issueType = issueType;
    }

    const [total, reports] = await Promise.all([
      prisma.foodSafetyReport.count({ where }),
      prisma.foodSafetyReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          customer: { select: { id: true, fullName: true, phone: true, email: true } },
          partner: { select: { id: true, businessName: true, phone: true, address: true } },
          listing: { select: { id: true, title: true, status: true, expiryAt: true } },
          order: { select: { id: true, orderNumber: true, totalPrice: true, createdAt: true } },
        },
      }),
    ]);

    return {
      reports,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  },

  /**
   * Admin: Chi tiết một báo cáo sự cố
   */
  async getAdminReportById(id) {
    const report = await prisma.foodSafetyReport.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, email: true } },
        partner: { select: { id: true, businessName: true, phone: true, address: true, foodSafetyCertUrl: true } },
        listing: { select: { id: true, title: true, status: true, expiryAt: true, imageUrls: true } },
        order: {
          include: {
            history: { orderBy: { createdAt: 'desc' } },
            payments: true,
          },
        },
      },
    });

    if (!report) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy báo cáo sự cố này');
    }

    return report;
  },

  /**
   * Admin: Cập nhật kết quả giải quyết sự cố ATTP & gửi thông báo
   */
  async updateAdminReport(adminId, id, { status, resolution, adminNotes, actionOnListing } = {}) {
    const report = await prisma.foodSafetyReport.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!report) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy báo cáo sự cố này');
    }

    const safeStatus = VALID_SAFETY_STATUSES.includes(status) ? status : report.status;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.foodSafetyReport.update({
        where: { id },
        data: {
          status: safeStatus,
          resolution: resolution ? resolution.trim() : report.resolution,
          adminNotes: adminNotes ? adminNotes.trim() : report.adminNotes,
          resolvedBy: adminId,
          resolvedAt: new Date(),
        },
      });

      // Tạm ẩn listing nếu phát hiện nguy cơ vệ sinh nghiêm trọng
      if (actionOnListing === 'HIDE_LISTING' && report.listingId) {
        await tx.listing.update({
          where: { id: report.listingId },
          data: { status: 'UNAVAILABLE' },
        });
      }

      // Gửi thông báo kết quả cho khách hàng
      const statusLabel =
        status === 'RESOLVED'
          ? 'Đã xử lý & giải quyết xong'
          : status === 'REJECTED'
          ? 'Đã bác bỏ khiếu nại'
          : 'Đang trong tiến trình thẩm định';

      const notif = await tx.notification.create({
        data: {
          userId: report.customerId,
          type: 'FOOD_SAFETY_UPDATE',
          title: '🛡️ Kết quả xử lý sự cố An Toàn Thực Phẩm',
          message: `Báo cáo sự cố #${report.reportNumber} của bạn đã được Ban Quản Trị cập nhật: [${statusLabel}]. Kết luận: "${resolution || 'Đã ghi nhận và xử lý theo quy định FoodSaver.'}"`,
          payload: {
            reportId: report.id,
            reportNumber: report.reportNumber,
            orderId: report.orderId,
            status,
            actionUrl: `/orders/${report.orderId}`,
          },
        },
      });

      emitToUser(report.customerId, 'NEW_NOTIFICATION', notif);

      return res;
    });

    return updated;
  },
};
