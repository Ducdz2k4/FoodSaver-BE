import { prisma } from '../../config/database.js';

export const AdminStatsService = {
  /**
   * Tính toán KPI tổng thể cho Dashboard Quản trị
   */
  async getDashboardMetrics() {
    const [
      completedOrders,
      totalUsers,
      verifiedPartners,
      pendingPartners,
      activeListings,
      recentOrders
    ] = await Promise.all([
      prisma.order.findMany({
        where: { status: 'COMPLETED' },
        select: {
          quantity: true,
          totalPrice: true,
          unitPrice: true,
          listing: {
            select: { originalPrice: true, discountPrice: true, category: true }
          }
        }
      }),
      prisma.user.count(),
      prisma.partnerProfile.count({ where: { verificationStatus: 'VERIFIED' } }),
      prisma.partnerProfile.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.listing.count({ where: { status: 'AVAILABLE' } }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { fullName: true, email: true, avatar: true } },
          listing: { select: { title: true, imageUrls: true } }
        }
      })
    ]);

    const totalRevenue = completedOrders.reduce((acc, o) => acc + Number(o.totalPrice), 0);
    const totalMealsRescued = completedOrders.reduce((acc, o) => acc + o.quantity, 0);
    const totalSavedByUsers = completedOrders.reduce((acc, o) => {
      const orig = Number(o.listing.originalPrice || o.unitPrice);
      const disc = Number(o.listing.discountPrice || o.unitPrice);
      return acc + Math.max(0, (orig - disc) * o.quantity);
    }, 0);

    return {
      kpi: {
        totalRevenue,
        totalMealsRescued,
        totalSavedByUsers,
        activeListingsCount: activeListings,
        verifiedPartnersCount: verifiedPartners,
        pendingPartnersCount: pendingPartners,
        totalUsersCount: totalUsers
      },
      recentActivity: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customer?.fullName || 'Khách hàng',
        customerEmail: o.customer?.email || '',
        listingTitle: o.listing?.title || 'Suất ăn giải cứu',
        amount: Number(o.totalPrice),
        status: o.status,
        createdAt: o.createdAt.toISOString()
      }))
    };
  },

  /**
   * Tính toán Báo cáo Môi trường & Xã hội (ESG Impact Reports)
   */
  async getESGReports() {
    const completedOrders = await prisma.order.findMany({
      where: { status: 'COMPLETED' },
      include: {
        listing: { select: { originalPrice: true, discountPrice: true, category: true } }
      }
    });

    const totalPortions = completedOrders.reduce((acc, o) => acc + o.quantity, 0);
    const totalKg = Math.round(totalPortions * 0.85); // Trung bình ~0.85kg/phần ăn
    const totalCo2 = Math.round(totalKg * 2.5); // 1kg thức ăn tránh lãng phí = ~2.5kg CO2e
    const totalSaved = completedOrders.reduce((acc, o) => {
      const orig = Number(o.listing.originalPrice || 0);
      const disc = Number(o.listing.discountPrice || 0);
      return acc + Math.max(0, (orig - disc) * o.quantity);
    }, 0);

    const monthlyTotals = new Map();
    for (const order of completedOrders) {
      const monthKey = `${order.createdAt.getUTCFullYear()}-${String(order.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
      const quantity = order.quantity;
      const kg = quantity * 0.85;
      const co2 = kg * 2.5;
      const saved = Math.max(
        0,
        (Number(order.listing.originalPrice || 0) - Number(order.listing.discountPrice || 0)) * quantity
      );
      const current = monthlyTotals.get(monthKey) || { kg: 0, co2: 0, saved: 0 };
      monthlyTotals.set(monthKey, {
        kg: current.kg + kg,
        co2: current.co2 + co2,
        saved: current.saved + saved
      });
    }

    const monthlyBreakdown = [...monthlyTotals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, values]) => ({
        month,
        kg: Math.round(values.kg),
        co2: Math.round(values.co2),
        saved: Math.round(values.saved)
      }));

    return {
      summary: {
        totalKgRescued: totalKg,
        totalCo2Avoided: totalCo2,
        totalSavedMoney: totalSaved,
        treesEquivalent: Math.round(totalCo2 / 10)
      },
      monthlyBreakdown
    };
  }
};
