# S-39 — Kiểm tra bổ sung audit (14/10/2026)

## Cập nhật xử lý xung đột PR #142

- Lấy `origin/main` tại `c207d86`, hợp nhất vào nhánh `fix/s39-ci-audit`; không merge PR vào main.
- Kết hợp API sửa phiếu của main với audit/lịch sử S-39; giữ kiểm tra người lập và chặn gửi phiếu rỗng, ghi audit gửi lại phiếu. Giao diện giữ danh sách chờ duyệt, thông tin người duyệt và lý do trả lại; chỉ Chủ đầu tư được duyệt chính thức theo permission backend; BQL được trả lại. Loại bỏ dialog trả lại trùng lặp.
- File đọc thêm: `backend/__tests__/acceptanceReturn.test.js`, `frontend/src/pages/__tests__/AcceptancePage.test.jsx`, `frontend/src/pages/__tests__/AcceptanceReviewPage.test.jsx`; đọc các phiên bản Git của hai file xung đột.
- File sửa trong lần này: `backend/routes/acceptanceRoutes.js`, `frontend/src/pages/AcceptancePage.jsx`, `backend/__tests__/acceptanceLifecycle.test.js`, `frontend/src/pages/__tests__/AcceptanceReviewPage.test.jsx`, `backend/jest.audit.config.cjs`, báo cáo này. Không tạo file mới; merge tiếp nhận các test nghiệm thu mới từ main.
- Lệnh: `git fetch origin main`, `git merge --no-commit --no-ff origin/main`, `git show`, `git diff`, `git status`, `rg`, `Get-Content`, script Python chỉnh file nguồn; `node --check backend/routes/acceptanceRoutes.js`; cấu hình Jest mock nêu dưới: **57/57 đạt**; Vitest cho AcceptanceReviewPage, AcceptancePage, AuditPortalPage, FieldPage.history: **13/13 đạt**; ESLint file sửa: đạt; `npm.cmd run build`: đạt; `git diff --check`: đạt. Sau đó `git add`, `git commit`, `git push origin HEAD:refs/heads/fix/s39-ci-audit`.
- Không kết nối/ghi database thật, không chạy migration, không sửa cấu hình DB/CI/deploy. Kiểm thử dùng mock; các giới hạn audit và cảnh báo build bên dưới vẫn áp dụng. CI GitHub cần được xác nhận riêng sau khi đẩy.

## Kết quả

- Nhánh đã có audit tạo/gửi/duyệt/trả phiếu nghiệm thu và `projectId` cho khóa/mở sổ. Kiểm thử xác nhận các luồng này.
- Bổ sung `projectId` và giá trị trước/sau cho xóa nhật ký, cập nhật nhật ký ngày; lưu nội dung và phiên bản trước/sau khi sửa hoặc xử lý xung đột nhật ký.
- Portal `/audit` đã có phân quyền Chủ đầu tư/Ban quản lý, lọc và phân trang. Bổ sung nhãn và bộ lọc xung đột; thống nhất ngày/giờ Việt Nam, bao gồm mili giây cuối ngày; từ chối khoảng ngày đảo ngược.

## File đọc

`AGENTS.md`, `package.json`, `backend/package.json`, `frontend/package.json`,
`backend/utils/auditLogger.js`, `backend/utils/permissions.js`,
`backend/utils/diaryDayValidators.js`, `backend/utils/diaryDayGuard.js`,
`backend/routes/acceptanceRoutes.js`, `backend/routes/diaryRoutes.js`,
`backend/routes/diaryDaysRoutes.js`, `backend/jest.globalSetup.js`, `backend/jest.setup.js`,
`backend/__tests__/acceptanceReview.test.js`, `backend/__tests__/acceptanceFlow.test.js`,
`backend/__tests__/acceptanceLifecycle.test.js`, `frontend/src/pages/AuditPortalPage.jsx`,
`frontend/src/pages/__tests__/FieldPage.history.test.jsx`,
`frontend/src/config/permissions.js`, `frontend/vite.config.js`,
`frontend/eslint.config.js`, `frontend/src/setupTests.js`, `.github/workflows/ci.yml`.

## File sửa/tạo

Sửa ba router `acceptanceRoutes.js`, `diaryRoutes.js`, `diaryDaysRoutes.js`,
`acceptanceLifecycle.test.js`, `AuditPortalPage.jsx`.
Tạo `backend/__tests__/diaryAudit.test.js`, `backend/jest.audit.config.cjs`,
`frontend/src/pages/__tests__/AuditPortalPage.test.jsx`, báo cáo này.

## Lệnh và kiểm thử

- Đọc/tìm kiếm bằng `Get-Content`, `Select-Object`, `Select-String`, `rg`, `Test-Path`, `Get-Location`.
- Kiểm tra Git: `git status`, `git branch --show-current`, `git remote -v`, `git log -4 --oneline`, `git diff`, `git diff --check`, `git ls-remote --heads origin fix/s39-ci-audit`.
- `node --check` cho cả ba router: đạt.
- Backend: `node node_modules/jest/bin/jest.js --config jest.audit.config.cjs --runInBand`: 49/49 test đạt. Cấu hình riêng bỏ qua dotenv, setup môi trường và globalSetup migration; mọi truy vấn DB trong các suite đều mock.
- Frontend: `npm.cmd test -- --run src/pages/__tests__/AuditPortalPage.test.jsx src/pages/__tests__/FieldPage.history.test.jsx`: 5/5 test đạt, API mock.
- ESLint qua `node node_modules/eslint/bin/eslint.js` cho toàn bộ file mã nguồn/test/cấu hình sửa hoặc tạo: đạt.
- `npm.cmd run build` trong frontend: đạt; cảnh báo CSS `@theme`/`@custom-variant` và kích thước bundle vẫn còn.
- Lần gọi `npm` ban đầu bị PowerShell ExecutionPolicy chặn; chạy lại bằng `npm.cmd`. Lần tra cứu remote trong sandbox bị chặn mạng; tra cứu có quyền mạng thành công.
- Đẩy commit lên nhánh `fix/s39-ci-audit` bằng Git; không merge vào main.

## Phạm vi và giới hạn

Không kết nối/ghi dữ liệu production; không chạy migration, seed, integration DB hoặc server local. Không sửa `.env`, cấu hình database, migration, CI/CD hay deploy.

Chưa kiểm thử trên database thực hoặc trình duyệt nối backend thật. Audit hiện vẫn ghi sau COMMIT theo cơ chế fail-open có sẵn: lỗi ghi audit có thể làm thiếu lịch sử, nên không thể khẳng định audit bảo đảm tuyệt đối. Các dòng audit cũ có `project_id = null` không được sửa/bổ sung hồi tố. Router nghiệm thu hiện không có endpoint hủy; phân hệ thanh toán chưa được triển khai trong menu hiện tại, nên chưa xác nhận audit cho hủy/thanh toán.
