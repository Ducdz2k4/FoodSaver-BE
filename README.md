# FoodSaver - Backend (Modular / Feature-Based Architecture)

Dự án Backend cho hệ thống **FoodSaver**, được thiết kế chuẩn mực theo kiến trúc **Modular / Feature-Based Architecture** (kết hợp mô hình MVC khép kín trong từng Module/Feature) nhằm đảm bảo tính độc lập, dễ mở rộng và ngăn chặn tình trạng mã nguồn phình to khó quản lý khi dự án phát triển nhiều tính năng.

---

## 🎯 Bản chất của Modular / Feature-Based Architecture

### 1. Phân biệt với Layered Architecture (Horizontal Monolith)
- ❌ **Layered Architecture (Chia theo tầng ngang truyền thống):**
  - Mọi Controller nằm trong `src/controllers/`
  - Mọi Model nằm trong `src/models/`
  - Mọi Service nằm trong `src/services/`
  - 👉 **Hậu quả:** Khi dự án có 50+ tính năng, mỗi thư mục phình to thành hàng trăm file. Một thay đổi nhỏ ở tính năng `foods` đòi hỏi phải mở cùng lúc nhiều thư mục xa nhau, dễ gây xung đột git (merge conflict) và khó phân công công việc.

- ✅ **Modular / Feature-Based Architecture (Chia theo tính năng dọc - Vertical Slicing):**
  - Dự án được chia thành từng **Feature Module độc lập** (Self-contained modules) đại diện cho từng nghiệp vụ (Domain): `auth`, `users`, `foods`, `orders`, `donations`, v.v.
  - Mỗi Feature Module chứa trọn vẹn chu trình xử lý của chính nó: **Route ➔ Validation ➔ Controller ➔ Service ➔ Model**.
  - 👉 **Lợi ích:** 
    - **Tính gắn kết cao (High Cohesion):** Code liên quan mật thiết nằm cạnh nhau.
    - **Khớp nối lỏng (Loose Coupling):** Các module hoạt động độc lập, không phụ thuộc chéo bừa bãi.
    - **Dễ bảo trì & tháo rời:** Muốn xóa, sửa hay thêm mới một tính năng chỉ cần thao tác trong đúng thư mục module đó mà không sợ ảnh hưởng đến phần còn lại.

---

## 🏗️ Cấu trúc thư mục chuẩn (Folder Structure)

```text
BE/
├── .env.example                     # Mẫu biến môi trường
├── .env                             # Biến môi trường hiện tại (được .gitignore bảo vệ)
├── .gitignore                       # Bỏ qua node_modules, .env, logs
├── package.json                     # Quản lý dependencies & scripts ("type": "module")
├── README.md                        # Tài liệu kiến trúc và hướng dẫn dự án
└── src/
    ├── app.js                       # Khởi tạo Express, bảo mật (Helmet, CORS), parser & error handlers
    ├── server.js                    # Entry point, Process exception guards, Graceful shutdown
    ├── config/                      # Cấu hình hệ thống chung
    │   ├── env.js                   # Load và validate biến môi trường tập trung
    │   └── database.js              # Quản lý kết nối Database (MongoDB / PostgreSQL / Prisma)
    ├── shared/                      # Các thành phần dùng chung phi nghiệp vụ (Cross-cutting Concerns)
    │   ├── constants/
    │   │   └── httpStatus.js        # HTTP Status Codes chuẩn hóa
    │   ├── middlewares/
    │   │   ├── errorHandler.js      # Global Centralized Error Handler
    │   │   ├── notFound.js          # Middleware bắt lỗi 404 Route Not Found
    │   │   └── validate.js          # Middleware validate dữ liệu đầu vào bằng Zod
    │   └── utils/
    │       ├── apiError.js          # Lớp ApiError chuẩn hóa mã lỗi & thông điệp
    │       ├── apiResponse.js       # Chuẩn hóa format phản hồi JSON thống nhất
    │       └── asyncHandler.js      # Wrapper bọc async controller tránh try/catch lặp
    ├── routes/
    │   └── index.js                 # Master Router tổng hợp các route từ từng Feature Module
    └── modules/                     # CÁC FEATURE / DOMAIN MODULES
        ├── auth/                    # Feature: Xác thực người dùng
        │   ├── auth.controller.js   # C: Tiếp nhận HTTP request, trả về ApiResponse
        │   ├── auth.service.js      # Business Logic: Mã hóa mật khẩu, tạo token
        │   ├── auth.model.js        # M: Truy vấn dữ liệu tài khoản
        │   ├── auth.routes.js       # Khai báo endpoint URL của auth
        │   └── auth.validation.js   # Schema validate input (Zod)
        ├── users/                   # Feature: Quản lý người dùng
        │   ├── user.controller.js
        │   ├── user.service.js
        │   ├── user.model.js
        │   ├── user.routes.js
        │   └── user.validation.js
        └── foods/                   # Feature: Món ăn cứu trợ (FoodSaver domain)
            ├── food.controller.js
            ├── food.service.js
            ├── food.model.js
            ├── food.routes.js
            └── food.validation.js
```

---

## 🛡️ Cơ chế Global Exception Handling (Xử lý ngoại lệ toàn cục)

Dự án triển khai hệ thống bắt lỗi đa tầng bảo vệ để đảm bảo ứng dụng không bao giờ bị crash đột ngột hoặc lộ thông tin nhạy cảm:

1. **Tầng tiến trình (Process-Level Guards - `src/server.js`):**
   - `uncaughtException`: Đặt ngay đầu file server để bắt mọi ngoại lệ đồng bộ chưa được xử lý, ghi log và thoát tiến trình an toàn.
   - `unhandledRejection`: Bắt toàn bộ các Promise bị rejected mà không có `.catch()`, thực hiện đóng HTTP server an toàn (`graceful shutdown`) trước khi kết thúc.
   - `SIGINT` & `SIGTERM`: Bắt tín hiệu dừng tiến trình để giải phóng kết nối database và tài nguyên mạng sạch sẽ.

2. **Tầng ứng dụng (Express Centralized Middleware - `src/shared/middlewares/errorHandler.js`):**
   - **Tự động bắt lỗi cú pháp JSON**: Khi client gửi body JSON sai định dạng, middleware chuẩn hóa thành HTTP 400 Bad Request kèm thông báo thân thiện.
   - **Tự động bắt lỗi Cơ sở dữ liệu (MongoDB/Mongoose)**: Tự động chuyển đổi `CastError` (sai ID), `code 11000` (trùng lặp unique), `ValidationError` thành mã lỗi HTTP tương ứng (400, 409).
   - **Tự động bắt lỗi JWT**: Xử lý token hết hạn hoặc token giả mạo thành HTTP 401.
   - **Bảo mật Production**: Tự động che giấu `stack trace` và thông báo lỗi hệ thống nội bộ khi chạy ở môi trường `production`.

3. **Tầng Controller & Nghiệp vụ (Async & Custom Error - `ApiError` + `asyncHandler`):**
   - Các controller được bọc trong `asyncHandler`, loại bỏ hoàn toàn việc lặp lại khối `try...catch` thủ công.
   - Bắn lỗi nghiệp vụ trực tiếp thông qua `throw ApiError.badRequest(...)`, `throw ApiError.notFound(...)`, `throw ApiError.conflict(...)`.

---

## 🚀 Hướng dẫn thêm một Feature Module mới (Quy trình chuẩn)

Giả sử bạn cần tạo tính năng **Quản lý Đơn hàng (`orders`)**:

1. **Tạo thư mục module**: `src/modules/orders/`
2. **Tạo các file thành phần theo chuẩn**:
   - `order.validation.js`: Khai báo Zod schema cho body/params/query.
   - `order.model.js`: Khai báo truy vấn cơ sở dữ liệu cho đơn hàng.
   - `order.service.js`: Viết logic nghiệp vụ (kiểm tra tồn kho món ăn, tính tổng tiền, đổi trạng thái).
   - `order.controller.js`: Xử lý HTTP request và gọi `ApiResponse.success(...)` hoặc `ApiResponse.created(...)`.
   - `order.routes.js`: Định nghĩa các route (`POST /`, `GET /`, `GET /:id`), gắn middleware `validate(...)`.
3. **Đăng ký module vào Master Router (`src/routes/index.js`)**:
   ```javascript
   import { orderRoutes } from '../modules/orders/order.routes.js';

   router.use('/orders', orderRoutes);
   ```
*(Chỉ với 3 bước trên, tính năng mới đã sẵn sàng mà không cần chạm vào code của bất kỳ feature nào khác).*

---

## 💻 Cài đặt & Khởi chạy

### Cài đặt dependencies:
```bash
cd BE
npm install
```

### Thiết lập biến môi trường:
```bash
cp .env.example .env
```

### Chạy ứng dụng:
- **Phát triển (Nodemon tự reload):**
  ```bash
  npm run dev
  ```
- **Môi trường Production:**
  ```bash
  npm start
  ```

---

## 📡 Danh sách API mẫu có sẵn

| Method | Endpoint | Module | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Core | Kiểm tra sức khỏe server (Health check) |
| `POST` | `/api/v1/auth/register` | `auth` | Đăng ký tài khoản (hỗ trợ role `user`, `partner`) |
| `POST` | `/api/v1/auth/login` | `auth` | Đăng nhập hệ thống |
| `GET` | `/api/v1/auth/me` | `auth` | Lấy thông tin tài khoản đang đăng nhập |
| `GET` | `/api/v1/users` | `users` | Danh sách người dùng (hỗ trợ query `search`, `role`) |
| `GET` | `/api/v1/users/:id` | `users` | Chi tiết 1 người dùng |
| `PUT` | `/api/v1/users/:id` | `users` | Cập nhật hồ sơ người dùng |
| `DELETE` | `/api/v1/users/:id` | `users` | Xóa người dùng |
| `GET` | `/api/v1/foods` | `foods` | Danh sách món ăn cứu trợ (`search`, `category`, `maxPrice`, `status`) |
| `POST` | `/api/v1/foods` | `foods` | Đăng tin món ăn cứu trợ |
| `GET` | `/api/v1/foods/:id` | `foods` | Chi tiết món ăn |
| `PUT` | `/api/v1/foods/:id` | `foods` | Cập nhật thông tin món ăn |
| `DELETE` | `/api/v1/foods/:id` | `foods` | Xóa món ăn |
