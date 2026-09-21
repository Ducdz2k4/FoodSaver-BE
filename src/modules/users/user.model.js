import crypto from 'crypto';

// In-memory data store for initial setup (Ready to replace with Mongoose / Prisma)
const usersTable = [
  {
    id: 'usr_1',
    fullName: 'Nguyen Van A',
    email: 'user@foodsaver.vn',
    password: 'password123',
    role: 'user',
    phone: '0912345678',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'usr_2',
    fullName: 'Nha Hang Xanh',
    email: 'partner@foodsaver.vn',
    password: 'password123',
    role: 'partner',
    phone: '0987654321',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const UserModel = {
  async findAll({ search, role } = {}) {
    let result = [...usersTable];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    if (role) {
      result = result.filter(u => u.role === role);
    }

    return result.map(({ password: _, ...safeUser }) => safeUser);
  },

  async findById(id) {
    const user = usersTable.find(u => u.id === id);
    if (!user) return null;
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  async findByEmail(email) {
    return usersTable.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async create(userData) {
    const newUser = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      ...userData,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    usersTable.push(newUser);
    const { password: _, ...safeUser } = newUser;
    return safeUser;
  },

  async update(id, updateData) {
    const index = usersTable.findIndex(u => u.id === id);
    if (index === -1) return null;

    usersTable[index] = {
      ...usersTable[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    const { password: _, ...safeUser } = usersTable[index];
    return safeUser;
  },

  async delete(id) {
    const index = usersTable.findIndex(u => u.id === id);
    if (index === -1) return false;
    usersTable.splice(index, 1);
    return true;
  }
};
