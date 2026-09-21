# FoodSaver - Backend (Modular / Feature-Based Architecture)

Dự án Backend cho hệ thống **FoodSaver**, được thiết kế chuẩn mực theo kiến trúc **Modular / Feature-Based Architecture** (kết hợp mô hình MVC khép kín bên trong từng Feature Module). Dự án sử dụng **Express.js**, **Prisma ORM** (Multi-file Schema Mapping tự động, không dùng SQL thủ công), **MySQL 8 (Docker)**, **JWT Authentication**, và **Global Exception Handling**.

---

## 🎯 Bản chất của Modular / Feature-Based Architecture

### 1. Phân biệt với Layered Architecture (Horizontal Monolith)
- ❌ **Layered Architecture (Chia theo tầng ngang truyền thống):**
  - Mọi Controller gom vào `src/controllers/`, mọi Model gom vào `src/models/`, mọi Route gom vào `src/routes/`.
  - 👉 **Hậu quả:** Khi dự án đạt 50+ tính năng, mỗi thư mục phình to thành hàng trăm file, việc bảo trì trở nên phân mảnh và dễ gây xung đột merge conflict.

- ✅ **Modular / Feature-Based Architecture (Chia theo tính năng dọc - Vertical Slicing):**
  - Dự án được chia thành từng **Feature Module độc lập** theo Domain nghiệp vụ: `auth`, `users`, `foods`, `orders`, v.v.
  - Mỗi Feature Module chứa trọn vẹn chu trình xử lý của chính nó: **Route ➔ Validation ➔ Controller ➔ Service ➔ Model**.
  - 👉 **Lợi ích:** 
    - **High Cohesion (Gắn kết cao):** Mọi logic của tính năng nằm cạnh nhau.
    - **Loose Coupling (Khớp nối lỏng):** Các module không can thiệp sâu vào cấu trúc nội bộ của nhau.
    - **Dễ mở rộng:** Thêm mới hoặc gỡ bỏ một module mà không ảnh hưởng tới các phần còn lại.

---

## 🏗️ Cấu trúc thư mục (Folder Structure)

```text
BE/
├── docker-compose.yml               # Cấu hình Docker cho MySQL 8 & phpMyAdmin
├── prisma/                          # THƯ MỤC CẤU HÌNH ORM PRISMA
│   ├── schema/                      # MULTI-FILE SCHEMA (Tách riêng schema theo từng Domain)
│   │   ├── base.prisma              # Datasource MySQL & Generator Client
│   │   ├── user.prisma              # Entity User, Role, UserStatus (Domain User)
│   │   └── food.prisma              # Entity Food, FoodCategory, FoodStatus (Domain Food)
│   └── seed.js                      # Script nạp dữ liệu mẫu bằng Prisma Client thuần (admin, user, partner)
├── .env.example                     # Mẫu biến môi trường
├── .env                             # Biến môi trường hiện tại
├── .gitignore                       # Loại trừ node_modules, .env, logs
├── package.json
└── src/
    ├── app.js                       # Cấu hình Express, Security (Helmet, CORS), Routes, Error Handlers
    ├── server.js                    # Entry point, Process exception guards, Graceful shutdown
    ├── config/
    │   ├── env.js                   # Load và validate biến môi trường tập trung
    │   └── database.js              # Khởi tạo PrismaClient & quản lý vòng đời kết nối MySQL
    ├── shared/                      # Hạ tầng & tiện ích dùng chung (Cross-cutting Concerns)
    │   ├── constants/
    │   │   └── httpStatus.js        # Mã HTTP Status chuẩn
    │   ├── middlewares/
    │   │   ├── auth.js              # Middleware xác thực JWT (authenticate) & phân quyền RBAC (authorize)
    │   │   ├── errorHandler.js      # Global Centralized Error Handler (bắt lỗi Prisma, JWT, JSON body, 500)
    │   │   ├── notFound.js          # Xử lý 404 Route Not Found
    │   │   └── validate.js          # Validate input bằng Zod Schema
    │   └── utils/
    │       ├── apiError.js          # Lớp ApiError chuẩn hóa mã lỗi & thông điệp
    │       ├── apiResponse.js       # Chuẩn hóa format phản hồi JSON thống nhất
    │       ├── asyncHandler.js      # Wrapper bọc async controller
    │       └── jwt.js               # Helper ký & giải mã Access Token / Refresh Token
    ├── routes/
    │   └── index.js                 # Master Router tổng hợp các module
    └── modules/
        ├── auth/                    # Module xác thực & phiên làm việc
        │   ├── auth.controller.js
        │   ├── auth.service.js
        │   ├── auth.model.js
        │   ├── auth.routes.js
        │   └── auth.validation.js
        ├── users/                   # Module quản lý người dùng (Admin & RBAC)
        │   ├── user.controller.js
        │   ├── user.service.js
        │   ├── user.model.js        # 100% Prisma ORM queries (prisma.user)
        │   ├── user.routes.js
        │   └── user.validation.js
        └── foods/                   # Module giải cứu thực phẩm (FoodSaver)
            ├── food.controller.js
            ├── food.service.js
            ├── food.model.js
            ├── food.routes.js
            └── food.validation.js
```

---

## 🗄️ Multi-file Prisma Schema (Tự động Map DB theo Domain)

Thay vì dồn tất cả model vào một file đơn lẻ, dự án áp dụng tính năng **Multi-file Schema** của Prisma để tách độc lập:

- **`prisma/schema/base.prisma`**: Cấu hình MySQL datasource và client.
- **`prisma/schema/user.prisma`**: Định nghĩa model `User` và các Enum `Role`, `UserStatus`.
- **`prisma/schema/food.prisma`**: Định nghĩa model `Food` và các Enum `FoodCategory`, `FoodStatus`.

Khi có domain mới (ví dụ `orders`), bạn chỉ cần tạo `prisma/schema/order.prisma`.

---

## 🐳 Cấu hình MySQL & phpMyAdmin qua Docker

Container MySQL chạy thuần túy, Prisma ORM sẽ chịu trách nhiệm sinh bảng và cập nhật cấu trúc:
- **MySQL 8.0**: Port `3306`.
- **phpMyAdmin**: Giao diện trực quan trên web tại `http://localhost:8080`.

### Lệnh quản lý:
```bash
# 1. Bật MySQL & phpMyAdmin qua Docker
npm run docker:up

# 2. Tự động đồng bộ Schema từ prisma/schema vào MySQL (Tương tự ddl-auto=update của JPA)
npm run db:push

# 3. Nạp dữ liệu mẫu ban đầu qua Prisma Client
npm run db:seed

# 4. Tắt Docker containers khi không dùng
npm run docker:down
```

---

## 📡 Danh sách API chi tiết

### 1. Auth APIs (`/api/v1/auth`)

| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Đăng ký tài khoản mới (`USER` hoặc `PARTNER`) |
| `POST` | `/api/v1/auth/login` | Public | Đăng nhập hệ thống, trả về `accessToken` và `refreshToken` |
| `POST` | `/api/v1/auth/refresh-token` | Public | Cấp lại `accessToken` từ `refreshToken` hợp lệ |
| `GET` | `/api/v1/auth/me` | Bearer Token | Lấy thông tin cá nhân của người dùng hiện tại |
| `PUT` | `/api/v1/auth/profile` | Bearer Token | Cập nhật họ tên, điện thoại, địa chỉ, avatar, bio |
| `POST` | `/api/v1/auth/change-password` | Bearer Token | Đổi mật khẩu tài khoản và thu hồi refresh token |
| `POST` | `/api/v1/auth/logout` | Bearer Token | Đăng xuất và vô hiệu hóa refresh token trong database |

### 2. User Management APIs (`/api/v1/users`)

| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users` | Admin | Lấy danh sách người dùng (hỗ trợ `page`, `limit`, `search`, `role`, `status`) |
| `POST` | `/api/v1/users` | Admin | Tạo mới tài khoản người dùng bởi Admin |
| `GET` | `/api/v1/users/:id` | Authenticated | Xem chi tiết thông tin 1 người dùng theo ID |
| `PUT` | `/api/v1/users/:id` | Admin | Cập nhật thông tin người dùng |
| `PATCH` | `/api/v1/users/:id/status` | Admin | Cập nhật trạng thái (`ACTIVE`, `INACTIVE`, `BANNED`) |
| `PATCH` | `/api/v1/users/:id/role` | Admin | Phân quyền vai trò (`USER`, `PARTNER`, `ADMIN`) |
| `DELETE` | `/api/v1/users/:id` | Admin | Xóa tài khoản người dùng (ngăn chặn tự xóa tài khoản Admin đang login) |
