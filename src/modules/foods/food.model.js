import crypto from 'crypto';

// In-memory data store for initial setup (Ready to replace with Mongoose / Prisma)
const foodsTable = [
  {
    id: 'food_1',
    title: 'Combo Bánh Mì Bơ Tỏi Nướng',
    description: 'Bánh mới ra lò trong ngày, giòn thơm, hạn dùng trong 24h',
    category: 'bakery',
    originalPrice: 50000,
    discountedPrice: 20000,
    quantity: 5,
    unit: 'túi',
    expiryTime: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    pickupAddress: '123 Đường Cầu Giấy, Hà Nội',
    status: 'available',
    donorId: 'usr_2',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'food_2',
    title: 'Cơm Trưa Văn Phòng Thập Cẩm',
    description: 'Suất cơm trưa sạch sẽ còn dư sau giờ bán ca trưa',
    category: 'cooked_meal',
    originalPrice: 45000,
    discountedPrice: 15000,
    quantity: 3,
    unit: 'hộp',
    expiryTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    pickupAddress: '45 Lê Duẩn, Quận 1, TP.HCM',
    status: 'available',
    donorId: 'usr_2',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const FoodModel = {
  async findAll({ search, category, status, maxPrice } = {}) {
    let result = [...foodsTable];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.title.toLowerCase().includes(q) || (f.description && f.description.toLowerCase().includes(q))
      );
    }

    if (category) {
      result = result.filter(f => f.category === category);
    }

    if (status) {
      result = result.filter(f => f.status === status);
    }

    if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
      result = result.filter(f => f.discountedPrice <= maxPrice);
    }

    return result;
  },

  async findById(id) {
    return foodsTable.find(f => f.id === id) || null;
  },

  async create(foodData) {
    const newFood = {
      id: `food_${crypto.randomUUID().slice(0, 8)}`,
      status: 'available',
      ...foodData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    foodsTable.push(newFood);
    return newFood;
  },

  async update(id, updateData) {
    const index = foodsTable.findIndex(f => f.id === id);
    if (index === -1) return null;

    foodsTable[index] = {
      ...foodsTable[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    return foodsTable[index];
  },

  async delete(id) {
    const index = foodsTable.findIndex(f => f.id === id);
    if (index === -1) return false;
    foodsTable.splice(index, 1);
    return true;
  }
};
