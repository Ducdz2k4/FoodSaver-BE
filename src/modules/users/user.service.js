import bcrypt from 'bcryptjs';
import { UserModel } from './user.model.js';
import { ApiError } from '../../shared/utils/apiError.js';

export const UserService = {
  async getAllUsers(filters) {
    return UserModel.findAll(filters);
  },

  async getUserById(id) {
    const user = await UserModel.findById(id);
    if (!user) {
      throw ApiError.notFound(`Không tìm thấy người dùng với mã ID: ${id}`);
    }
    return user;
  },

  async createUser(userData) {
    const existing = await UserModel.findByEmail(userData.email);
    if (existing) {
      throw ApiError.conflict('Email này đã được sử dụng bởi một tài khoản khác');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    return UserModel.create({
      ...userData,
      password: hashedPassword
    });
  },

  async updateUser(id, updateData) {
    await this.getUserById(id);

    if (updateData.email) {
      const existing = await UserModel.findByEmail(updateData.email);
      if (existing && existing.id !== id) {
        throw ApiError.conflict('Email này đã thuộc về người dùng khác');
      }
    }

    return UserModel.update(id, updateData);
  },

  async updateStatus(id, status, actorId) {
    if (id === actorId && status !== 'ACTIVE') {
      throw ApiError.badRequest('Bạn không thể tự khóa hoặc vô hiệu hóa tài khoản của chính mình');
    }

    await this.getUserById(id);
    return UserModel.update(id, { status });
  },

  async updateRole(id, role, actorId) {
    if (id === actorId && role !== 'ADMIN') {
      throw ApiError.badRequest('Bạn không thể tự thay đổi vai trò quản trị viên của chính mình');
    }

    await this.getUserById(id);
    return UserModel.update(id, { role });
  },

  async deleteUser(id, actorId) {
    if (id === actorId) {
      throw ApiError.badRequest('Bạn không thể xóa tài khoản của chính mình đang đăng nhập');
    }

    await this.getUserById(id);
    await UserModel.delete(id);
    return { id, message: 'Đã xóa người dùng khỏi hệ thống thành công' };
  }
};
