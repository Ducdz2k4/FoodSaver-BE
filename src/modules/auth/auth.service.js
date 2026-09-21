import { AuthModel } from './auth.model.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { env } from '../../config/env.js';

export const AuthService = {
  async register(data) {
    const existing = await AuthModel.findByEmail(data.email);
    if (existing) {
      throw ApiError.conflict('Email này đã được sử dụng');
    }

    const newUser = await AuthModel.createUser(data);

    // Dummy token for initial setup (or use jsonwebtoken)
    const token = `jwt_mock_${newUser.id}_${Date.now()}`;

    return {
      user: newUser,
      token,
      expiresIn: env.jwt.expiresIn
    };
  },

  async login({ email, password }) {
    const user = await AuthModel.findByEmail(email);
    if (!user || user.password !== password) {
      throw ApiError.unauthorized('Email hoặc mật khẩu không chính xác');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Tài khoản của bạn đã bị khóa');
    }

    const { password: _, ...safeUser } = user;
    const token = `jwt_mock_${user.id}_${Date.now()}`;

    return {
      user: safeUser,
      token,
      expiresIn: env.jwt.expiresIn
    };
  },

  async getMe(userId) {
    const user = await AuthModel.findById(userId);
    if (!user) {
      throw ApiError.notFound('Không tìm thấy thông tin người dùng');
    }
    return user;
  }
};
