# Hướng Dẫn Kiểm Tra Trước Khi Đẩy Code (Pre-Push Checklist)

Để đảm bảo mọi lần `git push` hoặc tạo Pull Request đều **vượt qua toàn bộ CI/CD Pipeline** (`.github/workflows/ci.yml`) và không làm gián đoạn hệ thống, tất cả thành viên phát triển **bắt buộc phải chạy và pass** các bài kiểm tra dưới đây tại môi trường máy cá nhân (Local) trước khi đẩy code lên Git.

---

## 📋 Danh sách các bài kiểm tra trong CI/CD

Quy trình CI trên GitHub Actions kiểm tra 3 giai đoạn:

```
[Security Scan (Gitleaks)]
       ├──► [Backend CI (Node.js)]  ──┐
       └──► [Frontend CI (Node.js)] ──┴──► [Build Image & Deploy Staging] (nhánh main)
```

| STT | Bài kiểm tra | Khu vực | Mục đích |
| :---: | :--- | :---: | :--- |
| **1** | **Bảo mật (Secret Scan)** | Toàn bộ repo | Không để lộ mật khẩu, JWT secret, API key, token trong code hoặc commit git. |
| **2** | **NPM Audit** | Cả 2 | Đảm bảo không có thư viện phụ thuộc nào dính lỗ hổng bảo mật nghiêm trọng (`high` / `critical`). |
| **3** | **Kiểm tra cú pháp & Chuẩn code (Lint)** | Cả 2 | Tuân thủ quy chuẩn ESLint, không có biến thừa, lỗi cú pháp, format sai. |
| **4** | **Kiểm tra kiểu dữ liệu (Typecheck)** | Frontend | Chạy TypeScript compiler để phát hiện lỗi kiểu dữ liệu. |
| **5** | **Kiểm tra đóng gói (Build check)** | Cả 2 | Đảm bảo code đóng gói (Vite / Node check) không bị lỗi trước khi deploy. |
| **6** | **Chạy Migration Database** | Backend | Đảm bảo các file migration PostgreSQL chạy thành công, không lỗi schema. |
| **7** | **Unit & Integration Tests** | Cả 2 | Toàn bộ bài test tự động (Jest & Vitest) phải hiển thị màu xanh (100% Pass). |
| **8** | **Smoke Test (Ready & Healthcheck)** | Backend | Server khởi động bình thường và phản hồi thành công endpoint `/ready`, `/health`. |

---

## 🛠️ Hướng dẫn thực hiện kiểm tra tại Local

Trước khi gõ `git push origin <tên-nhánh>`, hãy mở terminal và thực hiện lần lượt các bước sau:

### 1. Kiểm tra Frontend
Mở thư mục `frontend`:
```bash
cd frontend
```

Chạy lần lượt 4 lệnh kiểm tra:
```bash
# 1. Kiểm tra chuẩn code ESLint
npm run lint

# 2. Kiểm tra lỗi kiểu TypeScript
npx tsc --noEmit

# 3. Thử build đóng gói giao diện
npm run build

# 4. Chạy toàn bộ bài test tự động Frontend (Vitest)
npm test
```
> ⚠️ **Yêu cầu:** Cả 4 lệnh trên đều phải chạy thành công không báo lỗi đỏ (`exit code 0`).

---

### 2. Kiểm tra Backend
Mở thư mục `backend`:
```bash
cd backend
```

Chạy lần lượt các lệnh kiểm tra:
```bash
# 1. Kiểm tra chuẩn code ESLint
npm run lint

# 2. Kiểm tra cú pháp các file cốt lõi (Syntax Check)
npm run build

# 3. Kiểm tra migration cơ sở dữ liệu
npm run migrate:up

# 4. Chạy toàn bộ bài test tự động Backend (Jest)
npm test
```
> ⚠️ **Yêu cầu:** Tất cả test cases trong `npm test` đều phải PASS.

---

### 3. Kiểm tra An toàn & Bí mật (Security Check)
* **Tuyệt đối không commit file `.env`** hoặc bất kỳ chuỗi token/mật khẩu thật nào vào code. Hãy đảm bảo file `.env` luôn nằm trong `.gitignore`.
* Kiểm tra các thay đổi chuẩn bị commit bằng:
  ```bash
  git diff --staged
  ```
  để rà soát xem có vô tình để lại `apiKey`, `password`, `connection string` nhạy cảm nào không.

---

## ⚡ Tóm tắt lệnh nhanh (Cheatsheet)

Nếu muốn kiểm tra nhanh toàn bộ trước khi commit/push, bạn có thể chạy chuỗi lệnh sau:

### Chạy nhanh ở Frontend:
```bash
cd frontend && npm run lint && npx tsc --noEmit && npm run build && npm test
```

### Chạy nhanh ở Backend:
```bash
cd backend && npm run lint && npm run build && npm test
```

---

## 🚀 Quy trình chuẩn khi Commit & Push

```bash
# Bước 1: Kiểm tra test và build ở cả 2 bên (Frontend & Backend)
# Bước 2: Xem lại các file thay đổi
git status

# Bước 3: Thêm các file thay đổi
git add .

# Bước 4: Viết commit message rõ ràng
git commit -m "feat(members): cap nhat giao dien chon doi thi cong"

# Bước 5: Đẩy code lên nhánh của bạn
git push origin <ten-nhanh>
```
Sau khi push, hãy truy cập vào mục **Actions** trên GitHub repository để theo dõi xem pipeline CI có chạy xanh (`Passed`) hay không.
