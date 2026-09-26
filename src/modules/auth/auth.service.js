import bcrypt from 'bcryptjs';
import { UserModel, formatUserWithCapability } from '../users/user.model.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { env } from '../../config/env.js';

export const AuthService = {
  async register(data) {
    const existing = await UserModel.findByEmail(data.email);
    if (existing) {
      throw ApiError.conflict('Email này đã được đăng ký trong hệ thống');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const createdUser = await UserModel.create({
      ...data,
      password: hashedPassword
    });

    const tokenPayload = {
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await UserModel.update(createdUser.id, { refreshToken });

    return {
      user: createdUser,
      accessToken,
      refreshToken,
      expiresIn: env.jwt.expiresIn
    };
  },

  async login({ email, password }) {
    const user = await UserModel.findByEmailWithPassword(email);
    if (!user) {
      throw ApiError.unauthorized('Email hoặc mật khẩu không chính xác');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Email hoặc mật khẩu không chính xác');
    }

    if (user.status === 'BANNED') {
      throw ApiError.forbidden('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên');
    }

    if (user.status === 'INACTIVE') {
      throw ApiError.forbidden('Tài khoản của bạn chưa được kích hoạt');
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await UserModel.update(user.id, {
      refreshToken,
      lastLoginAt: new Date()
    });

    const { password: _, refreshToken: __, ...safeUser } = user;
    const userWithCapability = formatUserWithCapability(safeUser);

    return {
      user: userWithCapability,
      accessToken,
      refreshToken,
      expiresIn: env.jwt.expiresIn
    };
  },

  async refreshToken(token) {
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw ApiError.unauthorized('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const user = await UserModel.findByIdWithPassword(decoded.id);
    if (!user || user.refreshToken !== token) {
      throw ApiError.unauthorized('Phiên làm việc không hợp lệ hoặc đã được đăng xuất');
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    await UserModel.update(user.id, { refreshToken: newRefreshToken });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: env.jwt.expiresIn
    };
  },

  async logout(userId) {
    await UserModel.update(userId, { refreshToken: null });
    return { message: 'Đăng xuất thành công khỏi hệ thống' };
  },

  async getMe(userId) {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw ApiError.notFound('Không tìm thấy thông tin tài khoản');
    }
    return user;
  },

  async updateProfile(userId, updateData) {
    const updated = await UserModel.update(userId, updateData);
    if (!updated) {
      throw ApiError.notFound('Không tìm thấy tài khoản để cập nhật');
    }
    return updated;
  },

  async changePassword(userId, { oldPassword, newPassword }) {
    const user = await UserModel.findByIdWithPassword(userId);
    if (!user) {
      throw ApiError.notFound('Không tìm thấy thông tin tài khoản');
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw ApiError.badRequest('Mật khẩu cũ không chính xác');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await UserModel.update(userId, {
      password: hashedPassword,
      refreshToken: null
    });

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại' };
  }
};
