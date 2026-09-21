import { z } from 'zod';

export const listUsersSchema = {
  query: z.object({
    search: z.string().optional(),
    role: z.enum(['user', 'partner', 'admin']).optional()
  })
};

export const userIdParamSchema = {
  params: z.object({
    id: z.string().min(1, 'ID người dùng là bắt buộc')
  })
};

export const updateUserSchema = {
  params: z.object({
    id: z.string().min(1, 'ID người dùng là bắt buộc')
  }),
  body: z.object({
    fullName: z.string().min(2).max(100).optional(),
    phone: z.string().optional(),
    role: z.enum(['user', 'partner', 'admin']).optional()
  })
};
