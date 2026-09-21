import { z } from 'zod';

export const registerSchema = {
  body: z.object({
    fullName: z.string().trim().min(2, 'Họ và tên phải có ít nhất 2 ký tự').max(100),
    email: z.string().trim().email('Email không đúng định dạng'),
    password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
    phone: z.string().trim().optional(),
    role: z.enum(['USER', 'PARTNER']).default('USER'),
    address: z.string().optional()
  })
};

export const loginSchema = {
  body: z.object({
    email: z.string().trim().email('Email không đúng định dạng'),
    password: z.string().min(1, 'Mật khẩu không được để trống')
  })
};

export const refreshTokenSchema = {
  body: z.object({
    refreshToken: z.string().min(1, 'Mã Refresh Token là bắt buộc')
  })
};

export const changePasswordSchema = {
  body: z.object({
    oldPassword: z.string().min(1, 'Mật khẩu cũ là bắt buộc'),
    newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự')
  })
};

export const updateProfileSchema = {
  body: z.object({
    fullName: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().optional(),
    avatar: z.string().url('Avatar phải là URL hợp lệ').optional(),
    address: z.string().optional(),
    bio: z.string().max(500).optional()
  })
};
