import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { sendOtpEmail } from '../../shared/utils/email.js';
import { ApiError } from '../../shared/utils/apiError.js';

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

export const OtpService = {
  async sendOtp(userId, email) {
    await prisma.otpCode.updateMany({
      where: { userId, used: false },
      data: { used: true }
    });

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otpRecord = await prisma.otpCode.create({
      data: { userId, code, expiresAt }
    });

    try {
      await sendOtpEmail(email, code);
    } catch (error) {
      await prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } }).catch(() => {});
      throw error;
    }

    return { message: 'Mã OTP đã được gửi đến email của bạn' };
  },

  async verifyOtp(userId, code) {
    const otp = await prisma.otpCode.findFirst({
      where: {
        userId,
        code,
        used: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otp) {
      throw ApiError.badRequest('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true }
    });

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: 'ACTIVE' }
    });

    return { message: 'Xác thực email thành công' };
  }
};
