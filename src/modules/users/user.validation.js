import { z } from 'zod';

export const listUsersSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().optional(),
    role: z.enum(['USER', 'PARTNER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'BANNED']).optional()
  })
};

export const userIdParamSchema = {
  params: z.object({
    id: z.string().min(1, 'ID người dùng là bắt buộc')
  })
};

export const createUserSchema = {
  body: z.object({
    fullName: z.string().trim().min(2, 'Họ và tên ít nhất 2 ký tự').max(100),
    email: z.string().trim().email('Email không đúng định dạng'),
    password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự'),
    phone: z.string().trim().optional(),
    role: z.enum(['USER', 'PARTNER', 'ADMIN']).default('USER'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'BANNED']).default('ACTIVE'),
    address: z.string().optional()
  })
};

export const updateUserSchema = {
  params: z.object({
    id: z.string().min(1, 'ID người dùng là bắt buộc')
  }),
  body: z.object({
    fullName: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().optional(),
    address: z.string().optional(),
    bio: z.string().max(500).optional(),
    avatar: z.string().url().optional(),
    role: z.enum(['USER', 'PARTNER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'BANNED']).optional()
  })
};

export const updateStatusSchema = {
  params: z.object({
    id: z.string().min(1, 'ID người dùng là bắt buộc')
  }),
  body: z.object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'BANNED'], {
      required_error: 'Trạng thái là bắt buộc (ACTIVE, INACTIVE, BANNED)'
    })
  })
};

export const updateRoleSchema = {
  params: z.object({
    id: z.string().min(1, 'ID người dùng là bắt buộc')
  }),
  body: z.object({
    role: z.enum(['USER', 'PARTNER', 'ADMIN'], {
      required_error: 'Vai trò là bắt buộc (USER, PARTNER, ADMIN)'
    })
  })
};
