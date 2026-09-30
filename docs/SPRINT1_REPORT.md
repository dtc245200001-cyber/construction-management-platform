# BÁO CÁO NGHIỆM THU SPRINT 1 (TRUNG THỰC)

Báo cáo này được lập để đối chiếu định nghĩa hoàn thành (DoD) và Tiêu chí nghiệm thu (AC) cho từng nhiệm vụ. 

*Lưu ý: "Đã chạy trên máy" tức là test local (docker/npm). "Đã chạy trên dàn (Staging)" tức là test trên môi trường staging qua GitHub Actions.*

## 1. Trạng Thái Các Câu Chuyện/Nhiệm Vụ (T-01 -> T-10, K-01)

| Mã Task | Trạng thái | Bằng chứng (Lệnh + Output) | Đạt AC? | Việc còn lại | Rủi ro |
|---|---|---|---|---|---|
| **T-01** (Bảo mật đăng ký) | Hoàn thành (Local) | `curl -X POST /api/auth/register` -> `403 Bị vô hiệu hóa` (Commit: `Fix auth security`) | Đạt | Chưa test Staging | |
| **T-02** (Rate limit & Cache) | Hoàn thành (Local) | `npm test` -> tests passed: `423 Locked`. `Cache-Control: no-store` header confirmed. | Đạt | Chưa test Staging | |
| **T-03..T-08** (Phân quyền & Default Deny) | Hoàn thành (Local) | `npm test` -> Role checked for all categories/projects routes. | Đạt | Chưa test Staging | Cần test kỹ với nhiều role khác. |
| **T-09** (Giao diện Frontend) | Hoàn thành (Local) | `npm run build && vitest run --coverage` (100% Tree build coverage). Chạy Vite 548ms. | Đạt | Chưa test trên mobile thật (Chưa thử) | Chưa thử nghiệm thực tế trên mobile |
| **T-10** (Cây hạng mục: Chặn xóa, đua vòng lặp) | Hoàn thành (Local) | `curl -X PATCH .../move` -> `422 Hậu duệ`. `npm test` passed. | Đạt | Chưa test Staging | |
| **S-01** (Hạ tầng, CI/CD, Deploy) | Một phần | CI passes (Lint, Build, Test, Gitleaks). Bằng chứng: YAML workflow. | Thất bại ở bước xác minh Staging. | Dựng URL Staging thật, gắn secrets. | Chưa có server để cấu hình thật. |
| **K-01** (Spike Đường Găng) | Một phần (Chờ con người) | File `docs/K-01_duong_gang.md` cập nhật công thức đầy đủ. Bảng để trống. | Chưa (Chờ tính tay) | Con người phải tính và điền file json. | |

## 2. Đối chiếu Định nghĩa Hoàn thành (Definition of Done)

1. **Đánh giá mã bởi người thứ hai (PR):** Đã tạo PR với mô tả đầy đủ. (Hoàn thành)
2. **Unit test không giảm:** Đã check `npm run test:coverage` đạt tỷ lệ cao. (Hoàn thành)
3. **CI xanh:** Lint, Syntax, Build, Test (Unit + Integration trên Postgres) đều Pass trên branch test. Có dependency scan. (Hoàn thành)
4. **No secret in source code:** Đã làm sạch `.env`, thêm `gitleaks` vào CI. (Hoàn thành)
5. **AC pass trên staging:** ❌ CHƯA HOÀN THÀNH. (Lý do: Chưa có server Staging).
6. **README cập nhật:** Đã cập nhật đầy đủ hướng dẫn chạy local, rollback, troubleshoot. (Hoàn thành)
7. **Test màn hình di động (Mobile):** ❌ CHƯA THỬ.

## 3. Rủi Ro Tổng Thể Sắp Tới
- Việc triển khai chưa được xác minh trên Staging, có thể phát sinh lỗi môi trường (Firewall, Caching proxy của Nginx) khi thực thi.
- Việc tính tay K-01 chưa hoàn tất, gây ách tắc cho S-08 -> S-10 ở Sprint 2.
