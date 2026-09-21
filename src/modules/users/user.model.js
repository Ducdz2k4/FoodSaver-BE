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
  updatedAt: true
};

export const UserModel = {
  /**
   * Prisma ORM: Find all users with pagination, filters and search
   */
  async findAll({ page = 1, limit = 10, search, role, status } = {}) {
    const skip = (page - 1) * limit;
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
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: SAFE_USER_SELECT
      }),
      prisma.user.count({ where })
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  /**
   * Prisma ORM: Find single user by ID (excludes password)
   */
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT
    });
  },

  /**
   * Prisma ORM: Find single user with password (internal use for authentication)
   */
  async findByIdWithPassword(id) {
    return prisma.user.findUnique({
      where: { id }
    });
  },

  /**
   * Prisma ORM: Find single user by unique email
   */
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });
  },

  /**
   * Prisma ORM: Create a new user record
   */
  async create(userData) {
    return prisma.user.create({
      data: {
        ...userData,
        email: userData.email.toLowerCase().trim()
      },
      select: SAFE_USER_SELECT
    });
  },

  /**
   * Prisma ORM: Update user by ID
   */
  async update(id, updateData) {
    return prisma.user.update({
      where: { id },
      data: updateData,
      select: SAFE_USER_SELECT
    });
  },

  /**
   * Prisma ORM: Delete user by ID
   */
  async delete(id) {
    return prisma.user.delete({
      where: { id }
    });
  }
};
