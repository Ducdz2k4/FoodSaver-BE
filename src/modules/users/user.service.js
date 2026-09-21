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

  async updateUser(id, updateData) {
    await this.getUserById(id);
    const updated = await UserModel.update(id, updateData);
    return updated;
  },

  async deleteUser(id) {
    await this.getUserById(id);
    await UserModel.delete(id);
    return { id, message: 'Đã xóa người dùng thành công' };
  }
};
