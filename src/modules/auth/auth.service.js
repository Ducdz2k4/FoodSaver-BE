import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { UserModel, formatUserWithCapability } from '../users/user.model.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { OtpService } from './otp.service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';

const googleClient = new OAuth2Client(env.google.clientId);

export const AuthService = {
  async register(data) {
    const existing = await UserModel.findByEmail(data.email);
    if (existing) {
      throw ApiError.conflict('Email này đã được đăng ký trong hệ thống');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const createdUser = await UserModel.create({
      ...data,
      password: hashedPassword,
      status: 'INACTIVE',
      emailVerified: false
    });

    try {
      await OtpService.sendOtp(createdUser.id, createdUser.email);
    } catch (error) {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {});
      throw error;
    }

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
      expiresIn: env.jwt.expiresIn,
      requireOtp: true
    };
  },

  async verifyRegisterOtp(userId, code) {
    const result = await OtpService.verifyOtp(userId, code);
    const user = await UserModel.findById(userId);
    return { ...result, user };
  },

  async resendOtp(userId) {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw ApiError.notFound('Không tìm thấy tài khoản');
    }
    if (user.emailVerified) {
      throw ApiError.badRequest('Email đã được xác thực');
    }
    return OtpService.sendOtp(userId, user.email);
  },

  async googleLogin(idToken) {
    if (!env.google.clientId) {
      throw ApiError.serviceUnavailable('Google OAuth chưa được cấu hình trên máy chủ');
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.google.clientId
      });
      payload = ticket.getPayload();
    } catch {
      throw ApiError.unauthorized('Token Google không hợp lệ');
    }

    if (!payload || !payload.email || !payload.email_verified || !payload.sub) {
      throw ApiError.unauthorized('Không thể lấy thông tin từ tài khoản Google');
    }

    const { sub: googleId, email, name, picture } = payload;

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      },
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

    if (user) {
      if (user.status === 'BANNED') {
        throw ApiError.forbidden('Tài khoản của bạn đã bị khóa');
      }

      if (user.googleId && user.googleId !== googleId) {
        throw ApiError.conflict('Email này đã được liên kết với một tài khoản Google khác');
      }

      const isFirstGoogleLogin = !user.googleId;
      if (isFirstGoogleLogin) {
        await prisma.user.update({
          where: { id: user.id },
          data: { googleId, emailVerified: true, status: 'ACTIVE', passwordSetupRequired: true }
        });
        user.googleId = googleId;
        user.emailVerified = true;
        user.status = 'ACTIVE';
      }

      if (isFirstGoogleLogin) user.passwordSetupRequired = true;

      if (isFirstGoogleLogin || user.passwordSetupRequired || !user.password || user.password === '') {
        const tokenPayload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);
        await UserModel.update(user.id, { refreshToken, lastLoginAt: new Date() });

        const { password: _, refreshToken: __, ...safeUser } = user;
        return {
          user: formatUserWithCapability(safeUser),
          accessToken,
          refreshToken,
          expiresIn: env.jwt.expiresIn,
          requirePassword: true
        };
      }

      const tokenPayload = { id: user.id, email: user.email, role: user.role };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);
      await UserModel.update(user.id, { refreshToken, lastLoginAt: new Date(), emailVerified: true });

      const { password: _, refreshToken: __, ...safeUser } = user;
      return {
        user: formatUserWithCapability(safeUser),
        accessToken,
        refreshToken,
        expiresIn: env.jwt.expiresIn,
        requirePassword: false
      };
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        googleId,
        fullName: name || email.split('@')[0],
        avatar: picture || null,
        password: '',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        passwordSetupRequired: true
      },
      select: {
        id: true, email: true, fullName: true, phone: true, avatar: true,
        role: true, status: true, address: true, bio: true, lastLoginAt: true, passwordSetupRequired: true,
        createdAt: true, updatedAt: true,
        partnerProfile: {
          select: { id: true, businessName: true, verificationStatus: true, businessType: true }
        }
      }
    });

    const tokenPayload = { id: newUser.id, email: newUser.email, role: newUser.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    await UserModel.update(newUser.id, { refreshToken, lastLoginAt: new Date() });

    return {
      user: formatUserWithCapability(newUser),
      accessToken,
      refreshToken,
      expiresIn: env.jwt.expiresIn,
      requirePassword: true
    };
  },

  async setPassword(userId, password) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ApiError.notFound('Không tìm thấy tài khoản');
    }

    if (!user.googleId || !user.passwordSetupRequired) {
      throw ApiError.badRequest('Tài khoản này không cần thiết lập mật khẩu Google');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, passwordSetupRequired: false }
    });

    return { message: 'Đã thiết lập mật khẩu thành công' };
  },

  async login({ email, password }) {
    const user = await UserModel.findByEmailWithPassword(email);
    if (!user) {
      throw ApiError.unauthorized('Email hoặc mật khẩu không chính xác');
    }

    if (!user.password || user.password === '') {
      throw ApiError.badRequest('Tài khoản này sử dụng đăng nhập Google. Vui lòng đăng nhập bằng Google.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Email hoặc mật khẩu không chính xác');
    }

    if (user.status === 'BANNED') {
      throw ApiError.forbidden('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên');
    }

    if (user.status === 'INACTIVE') {
      if (!user.emailVerified) {
        await OtpService.sendOtp(user.id, user.email);
        const tokenPayload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);
        await UserModel.update(user.id, { refreshToken });

        const { password: _, refreshToken: __, ...safeUser } = user;
        return {
          user: formatUserWithCapability(safeUser),
          accessToken,
          refreshToken,
          expiresIn: env.jwt.expiresIn,
          requireOtp: true
        };
      }
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

    if (user.password && user.password !== '') {
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        throw ApiError.badRequest('Mật khẩu cũ không chính xác');
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await UserModel.update(userId, {
      password: hashedPassword,
      refreshToken: null
    });

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại' };
  }
};
