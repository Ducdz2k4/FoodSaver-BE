import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const communityPosts = [
  {
    id: 'post-recipe-001',
    authorName: 'Thu Hương',
    authorAvatar: '👩‍🍳',
    authorBadge: 'Bếp Trưởng Eat-clean',
    authorRole: 'Master Chef & Health Coach',
    title: 'Gà áp chảo sốt mật ong mù tạt - Món ăn nhanh 20 phút siêu tiết kiệm',
    content: 'Thịt ức gà mềm mọng nước kết hợp cùng sốt mù tạt mật ong chua ngọt sánh mịn, ăn kèm bông cải xanh luộc giòn ngọt. Đây là món tủ vừa ít calo, giàu protein lại có chi phí chỉ khoảng 45k cho 2 người ăn!',
    imageUrl: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&auto=format&fit=crop&q=80',
    category: 'recipe',
    likes: 342,
    comments: 28,
    bookmarks: 86,
    views: 1240,
    tags: ['cong-thuc', 'uc-ga', 'healthy', 'tiet-kiem', '20-phut'],
    recipeData: {
      cookTime: 20,
      servings: 2,
      calories: 420,
      cost: 45000,
      ingredients: [
        { name: 'Ức gà phi lê', amount: '300', unit: 'g' },
        { name: 'Mật ong rừng', amount: '2', unit: 'thìa canh' },
        { name: 'Mù tạt Dijon hoặc vàng', amount: '1', unit: 'thìa cafe' },
        { name: 'Tỏi băm nhuyễn', amount: '3', unit: 'tép' },
        { name: 'Dầu ô liu', amount: '1', unit: 'thìa canh' },
        { name: 'Bông cải xanh luộc kèm', amount: '150', unit: 'g' },
      ],
      steps: [
        'Ướp ức gà với chút muối tiêu và tỏi băm trong 10 phút cho ngấm gia vị.',
        'Pha hỗn hợp sốt: khuấy đều mật ong, mù tạt, 1 thìa nước tương và 1 thìa nước lọc.',
        'Làm nóng chảo với dầu ô liu, áp chảo ức gà lửa vừa mỗi mặt khoảng 4-5 phút cho vàng óng.',
        'Đổ hỗn hợp sốt vào chảo, đun nhỏ lửa trong 2 phút cho sốt sệt lại và bọc đều lên ức gà.',
        'Thái lát dày vừa ăn, xếp cùng bông cải xanh ra đĩa và thưởng thức khi còn nóng!'
      ],
    },
    mealPlan: null,
  },
  {
    id: 'post-recipe-002',
    authorName: 'Minh Tuấn',
    authorAvatar: '👨‍🍳',
    authorBadge: 'Đầu Bếp Gia Đình',
    authorRole: 'Ẩm thực gia & Blogger',
    title: 'Canh rong biển đậu non thịt băm thanh đạm giải nhiệt ngày oi ả',
    content: 'Chỉ mất chưa đầy 15 phút là bạn đã có một tô canh rong biển thơm ngát vị gừng, đậu hũ non béo ngậy và vị ngọt tự nhiên của thịt băm. Rất tốt cho hệ tiêu hóa và giải nhiệt hiệu quả!',
    imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&auto=format&fit=crop&q=80',
    category: 'recipe',
    likes: 278,
    comments: 19,
    bookmarks: 64,
    views: 980,
    tags: ['canh-rong-bien', 'thanh-dam', 'cong-thuc', 'de-lam', 'giai-nhiet'],
    recipeData: {
      cookTime: 15,
      servings: 3,
      calories: 210,
      cost: 32000,
      ingredients: [
        { name: 'Rong biển khô nấu canh', amount: '20', unit: 'g' },
        { name: 'Thịt nạc heo băm', amount: '150', unit: 'g' },
        { name: 'Đậu hũ non mềm', amount: '1', unit: 'hộp' },
        { name: 'Gừng tươi thái lát mỏng', amount: '3', unit: 'lát' },
        { name: 'Hành tím và hành lá', amount: '2', unit: 'nhánh' },
      ],
      steps: [
        'Ngâm rong biển với nước ấm khoảng 10 phút cho nở mềm rồi rửa sạch vắt ráo.',
        'Phi thơm hành tím với chút dầu ăn, cho thịt băm vào xào săn với hạt nêm.',
        'Đổ 800ml nước lọc vào đun sôi, thả gừng tươi và đậu hũ non cắt miếng vuông vào.',
        'Thả rong biển vào nấu sôi bùng trong 2 phút, nêm nếm lại cho vừa miệng rồi rắc hành lá tắt bếp.'
      ],
    },
    mealPlan: null,
  },
  {
    id: 'post-recipe-003',
    authorName: 'Thùy Chi',
    authorAvatar: '🥗',
    authorBadge: 'Yêu Bếp',
    authorRole: 'Tín đồ ẩm thực xanh',
    title: 'Salad bơ trứng lòng đào sốt mè rang béo ngậy cho bữa sáng nhanh',
    content: 'Bữa sáng chuẩn healthy giàu chất béo tốt và vitamin chỉ với 10 phút chuẩn bị. Trứng lòng đào dẻo quánh cùng quả bơ bùi ngậy quyện với sốt mè rang thơm nức!',
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=80',
    category: 'recipe',
    likes: 215,
    comments: 14,
    bookmarks: 52,
    views: 840,
    tags: ['salad', 'eat-clean', 'bua-sang', 'nhanh-gon', 'bo-sap'],
    recipeData: {
      cookTime: 10,
      servings: 1,
      calories: 340,
      cost: 28000,
      ingredients: [
        { name: 'Trứng gà ta', amount: '2', unit: 'quả' },
        { name: 'Quả bơ sáp chín tới', amount: '1/2', unit: 'quả' },
        { name: 'Xà lách Romaine hoặc lolo', amount: '100', unit: 'g' },
        { name: 'Cà chua bi tươi', amount: '6', unit: 'quả' },
        { name: 'Sốt mè rang Kewpie', amount: '2', unit: 'thìa' },
      ],
      steps: [
        'Luộc trứng trong nước sôi đúng 6 phút 30 giây, vớt ra ngâm ngay bát nước đá lạnh rồi bóc vỏ.',
        'Rau xà lách rửa sạch để ráo nước, cà chua bi bổ đôi, bơ thái lát mỏng vừa ăn.',
        'Trải đều rau xà lách ra đĩa, xếp bơ và cà chua bi lên, bổ đôi quả trứng đặt chính giữa.',
        'Rưới sốt mè rang đều khắp đĩa và rắc thêm chút tiêu đen xay thưởng thức ngay.'
      ],
    },
    mealPlan: null,
  },
  {
    id: 'post-plan-001',
    authorName: 'Hoàng Nam',
    authorAvatar: '🍱',
    authorBadge: 'Meal Prep Pro',
    authorRole: 'Chuyên gia tối ưu chi phí bếp',
    title: 'Thực đơn Eat-clean 3 ngày tiết kiệm chi phí cho sinh viên & văn phòng (< 50k/ngày)',
    content: 'Kế hoạch ăn uống khoa học đã được tính toán đầy đủ calories và chi phí. Nguyên liệu dễ mua ở các chợ dân sinh hoặc săn đồ giảm giá giải cứu trên FoodSaver. Bạn có thể bấm "Áp dụng vào Lịch ăn" để đưa toàn bộ vào lịch ăn cá nhân!',
    imageUrl: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=800&auto=format&fit=crop&q=80',
    category: 'meal_plan',
    likes: 418,
    comments: 36,
    bookmarks: 142,
    views: 1850,
    tags: ['thuc-don-tuan', 'eat-clean', '50k/ngay', 'sinh-vien', 'meal-prep'],
    recipeData: null,
    mealPlan: {
      title: 'Lịch ăn 3 ngày Healthy Sinh viên',
      days: [
        {
          day: 1,
          meals: [
            { dayOffset: 0, slot: 'breakfast', meal: 'Yến mạch sữa tươi hoa quả', calories: 320, cost: 15000, ingredients: ['Yến mạch', 'Sữa tươi', 'Chuối'] },
            { dayOffset: 0, slot: 'lunch', meal: 'Cơm gạo lứt ức gà áp chảo luộc cải', calories: 520, cost: 25000, ingredients: ['Gạo lứt', 'Ức gà', 'Cải thìa'] },
            { dayOffset: 0, slot: 'dinner', meal: 'Salad cá ngừ ngô ngọt trứng luộc', calories: 380, cost: 22000, ingredients: ['Cá ngừ hộp', 'Ngô ngọt', 'Trứng', 'Xà lách'] },
          ],
        },
        {
          day: 2,
          meals: [
            { dayOffset: 1, slot: 'breakfast', meal: 'Bánh mì đen ốp la cà chua bi', calories: 340, cost: 14000, ingredients: ['Bánh mì đen', 'Trứng gà', 'Cà chua'] },
            { dayOffset: 1, slot: 'lunch', meal: 'Bún gạo lứt tôm luộc rau củ trộn sốt mè', calories: 480, cost: 28000, ingredients: ['Bún gạo lứt', 'Tôm tươi', 'Dưa chuột'] },
            { dayOffset: 1, slot: 'dinner', meal: 'Canh rong biển đậu non thịt nạc băm', calories: 290, cost: 18000, ingredients: ['Rong biển', 'Đậu hũ non', 'Thịt heo'] },
          ],
        },
        {
          day: 3,
          meals: [
            { dayOffset: 2, slot: 'breakfast', meal: 'Khoai lang mật nướng + sữa đậu nành', calories: 310, cost: 12000, ingredients: ['Khoai lang mật', 'Sữa đậu nành'] },
            { dayOffset: 2, slot: 'lunch', meal: 'Cơm gạo lứt thịt bò xào nấm ớt chuông', calories: 560, cost: 35000, ingredients: ['Thịt bò nạc', 'Nấm đùi gà', 'Ớt chuông'] },
            { dayOffset: 2, slot: 'dinner', meal: 'Miến dong xào ức gà rau cải xanh', calories: 420, cost: 22000, ingredients: ['Miến dong', 'Ức gà', 'Rau cải ngọt'] },
          ],
        },
      ],
    },
  },
  {
    id: 'post-plan-002',
    authorName: 'Chị Lan Phương',
    authorAvatar: '👩‍👧‍👦',
    authorBadge: 'Mẹ Thông Thái',
    authorRole: 'Quản lý gia đình & Zero-waste',
    title: 'Kế hoạch Meal Prep 5 hộp cơm trưa văn phòng giữ trọn độ tươi ngon',
    content: 'Chủ nhật bỏ ra đúng 1.5 tiếng chuẩn bị sẵn 5 hộp trưa cho cả tuần làm việc. Tiết kiệm hơn 300k tiền đặt đồ ăn ngoài, đảm bảo sạch sẽ và không bao giờ phải đau đầu nghĩ "Trưa nay ăn gì?".',
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop&q=80',
    category: 'meal_plan',
    likes: 356,
    comments: 24,
    bookmarks: 118,
    views: 1420,
    tags: ['meal-prep', 'com-trua-van-phong', 'tien-loi', 'dinh-duong', 'tiết kiệm'],
    recipeData: null,
    mealPlan: {
      title: '5 Hộp cơm trưa công sở',
      days: [
        {
          day: 1,
          meals: [
            { dayOffset: 0, slot: 'lunch', meal: 'Cá hồi sốt teriyaki bông cải cơm gạo lứt', calories: 550, cost: 42000, ingredients: ['Cá hồi phi lê', 'Bông cải xanh', 'Gạo lứt'] },
          ],
        },
        {
          day: 2,
          meals: [
            { dayOffset: 1, slot: 'lunch', meal: 'Thịt heo áp chảo ngũ vị đậu cove xào tỏi', calories: 530, cost: 26000, ingredients: ['Thịt nạc dăm', 'Đậu cove', 'Cơm trắng'] },
          ],
        },
        {
          day: 3,
          meals: [
            { dayOffset: 2, slot: 'lunch', meal: 'Ức gà nướng thảo mộc khoai tây bi nướng', calories: 490, cost: 28000, ingredients: ['Ức gà', 'Khoai tây bi', 'Cà rốt'] },
          ],
        },
        {
          day: 4,
          meals: [
            { dayOffset: 3, slot: 'lunch', meal: 'Tôm rim tỏi ớt canh bí đỏ thịt bằm', calories: 510, cost: 34000, ingredients: ['Tôm tươi', 'Bí đỏ', 'Thịt băm'] },
          ],
        },
        {
          day: 5,
          meals: [
            { dayOffset: 4, slot: 'lunch', meal: 'Bò lúc lắc ớt chuông hành tây cơm vàng nghệ', calories: 570, cost: 39000, ingredients: ['Thịt thăn bò', 'Ớt chuông', 'Hành tây'] },
          ],
        },
      ],
    },
  },
  {
    id: 'post-tip-001',
    authorName: 'Cô Thanh Mai',
    authorAvatar: '👵',
    authorBadge: 'Nội Trợ Thông Thái',
    authorRole: 'Chuyên gia bảo quản nông sản',
    title: 'Bí quyết chọn bơ sáp Đắk Lắk dẻo béo không sượng không đắng & mẹo ủ chín đều',
    content: 'Khi mua bơ sáp, các bạn hãy lắc nhẹ nghe hạt kêu lóc cóc là bơ già. Nhìn cuống bơ: nếu cuống màu vàng hơi nâu là bơ chuẩn ngon, nếu cuống xanh đậm là bơ non sẽ bị đắng sượng. Muốn ủ bơ chín tự nhiên, hãy đặt bơ cạnh chuối chín trong thùng giấy kín 1-2 ngày!',
    imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=800&auto=format&fit=crop&q=80',
    category: 'tips',
    likes: 295,
    comments: 21,
    bookmarks: 78,
    views: 1110,
    tags: ['chon-thuc-pham', 'trai-cay', 'meo-hay', 'bo-sap', 'bao-quan'],
    recipeData: null,
    mealPlan: null,
  },
  {
    id: 'post-seasonal-001',
    authorName: 'Đức Anh',
    authorAvatar: '👨‍🌾',
    authorBadge: 'Nông Nghiệp Xanh',
    authorRole: 'Đại sứ Nông sản Việt',
    title: 'Lịch nông sản và hoa quả tháng 11: Ăn gì ngon bổ rẻ đúng chính vụ?',
    content: 'Tháng 11 là thời điểm chính vụ của: Quýt đường, Cam sành Miền Tây, Bưởi da xanh Bến Tre, Hồng giòn Đà Lạt, Cải thảo, Su hào, Bông cải trắng. Mua trái cây đúng mùa giá chỉ bằng 40-50% nghịch mùa mà lại không lo dư lượng thuốc bảo vệ thực vật!',
    imageUrl: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=800&auto=format&fit=crop&q=80',
    category: 'seasonal',
    likes: 263,
    comments: 18,
    bookmarks: 89,
    views: 1350,
    tags: ['theo-mua', 'nong-san-viet', 'thang-11', 'gia-tot', 'trai cây'],
    recipeData: null,
    mealPlan: null,
  },
  {
    id: 'post-budget-001',
    authorName: 'Bảo Trâm',
    authorAvatar: '🛍️',
    authorBadge: 'Smart Shopper',
    authorRole: 'Thợ săn ưu đãi FoodSaver',
    title: 'Kinh nghiệm đi chợ và siêu thị sau 18h săn túi cứu trợ thực phẩm giảm 60-70%',
    content: 'Rất nhiều tiệm bánh mì Âu, siêu thị và chuỗi đồ ăn Nhật xả các túi cứu trợ "Surprise Bag" hoặc thực phẩm tươi trong ngày với giá cực rẻ sau 18h30. Dùng tính năng Bản đồ quét radar trên FoodSaver để đặt trước và ghé lấy, vừa cứu thực phẩm vừa tiết kiệm tiền triệu mỗi tháng!',
    imageUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&auto=format&fit=crop&q=80',
    category: 'budget',
    likes: 388,
    comments: 32,
    bookmarks: 135,
    views: 1980,
    tags: ['cuu-tro-thuc-pham', 'tiet-kiem', 'di-cho', 'zero-waste', '50k/ngày'],
    recipeData: null,
    mealPlan: null,
  },
];

const sampleComments = [
  { postId: 'post-recipe-001', authorName: 'Nguyễn Văn Hùng', authorAvatar: '👨', content: 'Mình đã làm thử theo công thức này, sốt mù tạt mật ong ngon tuyệt đỉnh! Cả nhà ai cũng khen.' },
  { postId: 'post-recipe-001', authorName: 'Thanh Thảo', authorAvatar: '👩', content: 'Gà làm kiểu này không hề bị khô hay bã, mềm ẩm rất thích hợp cho người đang ăn kiêng.' },
  { postId: 'post-recipe-002', authorName: 'Quang Khải', authorAvatar: '🧑', content: 'Tô canh rong biển nấu gừng giải cảm tuyệt vời. Cảm ơn tác giả nhiều!' },
  { postId: 'post-plan-001', authorName: 'Phương Linh', authorAvatar: '👧', content: 'Vừa bấm Áp dụng vào Lịch ăn xong, tiện quá trời luôn! Lên kế hoạch đi chợ cả tuần không bị lãng phí.' },
  { postId: 'post-plan-001', authorName: 'Tuấn Đạt', authorAvatar: '👦', content: 'Menu tính calo và giá tiền chi tiết thế này sinh viên tiết kiệm được bao nhiêu tiền.' },
  { postId: 'post-budget-001', authorName: 'Khánh Vy', authorAvatar: '👩‍💼', content: 'Tính năng Radar săn đồ cứu trợ quanh Hòa Khánh rất đỉnh, tối qua mình vừa cứu được hộp bánh sushi giảm 60%!' },
];

async function main() {
  console.log('Seeding rich community posts...');

  for (const post of communityPosts) {
    await prisma.communityPost.upsert({
      where: { id: post.id },
      update: {
        authorName: post.authorName,
        authorAvatar: post.authorAvatar,
        authorBadge: post.authorBadge,
        authorRole: post.authorRole,
        title: post.title,
        content: post.content,
        imageUrl: post.imageUrl,
        category: post.category,
        likes: post.likes,
        comments: post.comments,
        bookmarks: post.bookmarks,
        views: post.views,
        tags: post.tags,
        recipeData: post.recipeData,
        mealPlan: post.mealPlan,
      },
      create: {
        id: post.id,
        authorName: post.authorName,
        authorAvatar: post.authorAvatar,
        authorBadge: post.authorBadge,
        authorRole: post.authorRole,
        title: post.title,
        content: post.content,
        imageUrl: post.imageUrl,
        category: post.category,
        likes: post.likes,
        comments: post.comments,
        bookmarks: post.bookmarks,
        views: post.views,
        tags: post.tags,
        recipeData: post.recipeData,
        mealPlan: post.mealPlan,
      },
    });
  }

  console.log('Seeding sample comments...');
  for (const c of sampleComments) {
    const exists = await prisma.communityComment.findFirst({
      where: { postId: c.postId, content: c.content },
    });
    if (!exists) {
      await prisma.communityComment.create({
        data: {
          postId: c.postId,
          authorName: c.authorName,
          authorAvatar: c.authorAvatar,
          content: c.content,
        },
      });
    }
  }

  // Update actual comments count for each post
  for (const post of communityPosts) {
    const actualCount = await prisma.communityComment.count({ where: { postId: post.id } });
    if (actualCount > 0) {
      await prisma.communityPost.update({
        where: { id: post.id },
        data: { comments: actualCount },
      });
    }
  }

  console.log('Community seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
