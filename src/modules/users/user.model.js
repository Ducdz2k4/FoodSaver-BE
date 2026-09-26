import { prisma } from '../../config/database.js';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  avatar: true,
  role: true,
  status: true,
  address: true,
  bio: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  partnerProfile: {
    select: {
      id: true,
      businessName: true,
      verificationStatus: true,
      businessType: true
    }
  }
};

export function formatUserWithCapability(user) {
  if (!user) return null;
  const { partnerProfile, ...rest } = user;
  return {
    ...rest,
    partnerCapability: partnerProfile?.verificationStatus || 'NONE',
    partnerProfileId: partnerProfile?.id || null,
    partnerProfile: partnerProfile || null
  };
}

export const UserModel = {
  /**
   * Prisma ORM: Find all users with pagination, filters and search
   */
  async findAll({ page = 1, limit = 10, search, role, status } = {}) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;
    const where = {};

    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: SAFE_USER_SELECT
      }),
      prisma.user.count({ where })
    ]);

    return {
      users: users.map(formatUserWithCapability),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  },

  /**
   * Prisma ORM: Find single user by ID (excludes password)
   */
  async findById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT
    });
    return formatUserWithCapability(user);
  },

  /**
   * Prisma ORM: Find single user with password (internal use for authentication)
   */
  async findByIdWithPassword(id) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        partnerProfile: {
          select: {
            id: true,
            businessName: true,
            verificationStatus: true,
            businessType: true
          }
        }
      }
    });
  },

  /**
   * Prisma ORM: Find user by email (excludes password)
   */
  async findByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: SAFE_USER_SELECT
    });
    return formatUserWithCapability(user);
  },

  /**
   * Prisma ORM: Find user by email including password
   */
  async findByEmailWithPassword(email) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        partnerProfile: {
          select: {
            id: true,
            businessName: true,
            verificationStatus: true,
            businessType: true
          }
        }
      }
    });
  },

  /**
   * Prisma ORM: Create new user
   */
  async create(data) {
    const user = await prisma.user.create({
      data,
      select: SAFE_USER_SELECT
    });
    return formatUserWithCapability(user);
  },

  /**
   * Prisma ORM: Update existing user by ID
   */
  async update(id, data) {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT
    });
    return formatUserWithCapability(user);
  },

  /**
   * Prisma ORM: Delete user by ID
   */
  async delete(id) {
    return prisma.user.delete({
      where: { id },
      select: { id: true, email: true }
    });
  }
};
