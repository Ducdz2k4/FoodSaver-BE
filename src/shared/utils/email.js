import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { ApiError } from './apiError.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!env.smtp.user || !env.smtp.pass) {
    throw ApiError.serviceUnavailable('Hệ thống email OTP chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
  }

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass
    }
  });

  return transporter;
}

function buildOtpHtml(otpCode) {
  return [
    '<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e5e5;border-radius:16px;">',
    '<h2 style="color:#00615f;margin:0 0 8px;">FoodSaver</h2>',
    '<p style="color:#555;font-size:14px;">Mã xác thực OTP của bạn là:</p>',
    '<div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#00615f;text-align:center;padding:20px 0;">',
    otpCode,
    '</div>',
    '<p style="color:#999;font-size:12px;text-align:center;">Mã có hiệu lực trong 5 phút. Không chia sẻ mã này với bất kỳ ai.</p>',
    '</div>'
  ].join('\n');
}

export async function sendOtpEmail(toEmail, otpCode) {
  const mail = getTransporter();
  await mail.sendMail({
    from: `"FoodSaver" <${env.smtp.user}>`,
    to: toEmail,
    subject: `[FoodSaver] Mã xác thực OTP: ${otpCode}`,
    html: buildOtpHtml(otpCode)
  });
}
