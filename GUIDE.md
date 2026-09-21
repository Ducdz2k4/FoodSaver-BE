# 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy Nhanh FoodSaver (FE & BE)

---

## 1. Clone Source Code

Mở terminal tại thư mục bạn muốn chứa dự án:

```bash
# Clone Backend
git clone https://github.com/Ducdz2k4/FoodSaver-BE.git BE

# Clone Frontend
git clone https://github.com/Ducdz2k4/FoodSaver-FE.git FE
```

---

## 2. Cài đặt & Khởi chạy Backend (BE)

### Bước 2.1: Cài thư viện & Tạo file cấu hình
```bash
cd BE
npm install
cp .env.example .env
```

### Bước 2.2: Khởi động Database MySQL qua Docker
> 💡 *Đảm bảo ứng dụng **Docker Desktop** đang bật trên máy.*

```bash
npm run docker:up
```
*(Lệnh này sẽ khởi động MySQL 8 trên port `3306` và phpMyAdmin trên port `8080`).*

### Bước 2.3: Đồng bộ Schema & Nạp dữ liệu mẫu (Seed DB)
```bash
# 1. ORM tự động tạo/cập nhật bảng vào MySQL (tương tự ddl-auto=update của JPA)
npm run db:push

# 2. Nạp tài khoản mẫu ban đầu (admin, user, partner)
npm run db:seed
```

### Bước 2.4: Chạy server Backend
```bash
# Chế độ phát triển (Tự reload khi sửa code)
npm run dev
```
> Server Backend sẽ chạy tại: **`http://localhost:5000`**  
> API Base URL: **`http://localhost:5000/api/v1`**  
> Health check: **`http://localhost:5000/health`**

---

## 3. Cài đặt & Khởi chạy Frontend (FE)

Mở một cửa sổ Terminal mới:

```bash
cd FE
npm install
npm run dev
```
> Giao diện Web Frontend sẽ chạy tại: **`http://localhost:3000`**

---

## 4. Tài khoản mẫu có sẵn (Seed Accounts)

| Vai trò | Email | Mật khẩu | Quyền hạn |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin@foodsaver.vn` | `Admin@123456` | Toàn quyền quản trị người dùng & hệ thống |
| **Người dùng (User)** | `user@foodsaver.vn` | `Admin@123456` | Người nhận thực phẩm |
| **Đối tác (Partner)** | `partner@foodsaver.vn` | `Admin@123456` | Đơn vị cung cấp / quyên góp thực phẩm |

---

## 5. Các địa chỉ truy cập nhanh

- 🌐 **Frontend Web**: [http://localhost:3000](http://localhost:3000)
- 🚀 **Backend API**: [http://localhost:5000/api/v1](http://localhost:5000/api/v1)
- 🗄️ **phpMyAdmin**: [http://localhost:8080](http://localhost:8080) (User: `foodsaver_user` / Pass: `foodsaver_password`)
- 📊 **Prisma Studio (Xem DB giao diện riêng của Prisma)**: `cd BE && npm run db:studio` -> [http://localhost:5555](http://localhost:5555)

---

## 6. Lệnh hữu ích khi dừng hoặc bảo trì

```bash
# Tắt Docker MySQL khi không dùng
cd BE && npm run docker:down

# Vừa sync schema vừa chạy server Backend
cd BE && npm run dev:sync
```
