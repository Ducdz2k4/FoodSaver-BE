import { UserModel } from '../users/user.model.js';

export const AuthModel = {
  async findByEmail(email) {
    return UserModel.findByEmail(email);
  },

  async createUser(userData) {
    return UserModel.create(userData);
  },

  async findById(id) {
    return UserModel.findById(id);
  }
};
