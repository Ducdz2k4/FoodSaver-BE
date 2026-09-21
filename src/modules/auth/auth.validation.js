import { z } from 'zod';

export const registerSchema = {
  body: z.object({
    fullName: z.string().min(2, 'Họ và tên phải có ít nhất 2 ký tự').max(100),
    email: z.string().email('Email không đúng định dạng'),
    password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
    phone: z.string().optional(),
    role: z.enum(['user', 'partner', 'admin']).default('user')
  })
};

export const loginSchema = {
  body: z.object({
    email: z.string().email('Email không đúng định dạng'),
    password: z.string().min(1, 'Mật khẩu không được để trống')
  })
};
