# QUY TẮC BẢO VỆ DỮ LIỆU PRODUCTION — CÔNG TRƯỜNG 360

> Nguồn chung cho mọi AI agent làm việc trong `D:\construction-management-platform`.
> Claude Code đọc qua `CLAUDE.md` tham chiếu tới file này. Antigravity được cấu hình thủ công để đọc file này.

## 1. Nguyên tắc bất biến

- Dữ liệu production trên Supabase là quan trọng nhất. Không tự ý thay đổi, xóa, ghi đè, làm sạch hoặc khởi tạo lại dữ liệu production.
- Không tự ý thay đổi, xóa, ghi đè, làm sạch hoặc khởi tạo lại cấu hình kết nối database hiện tại.
- Không tự tạo thêm Supabase project hoặc database mới khi chưa được chủ dự án đồng ý.
- Không tự ý thay đổi cấu hình Render, GitHub Actions, quy trình deploy hoặc migration production.
- Không hy sinh dữ liệu thật để sửa lỗi giao diện, API hoặc kiểm thử.
- Không tuyên bố dữ liệu production được bảo vệ tuyệt đối chỉ nhờ quy tắc AI.

## 2. Cấm thực hiện khi chưa được cho phép rõ ràng

Không tự ý chạy hoặc tạo lệnh có thể ghi, sửa, xóa dữ liệu production, bao gồm nhưng không giới hạn:

- `DELETE`, `TRUNCATE`, `DROP`, `ALTER`, `UPDATE`, `INSERT` và mọi câu SQL có khả năng thay đổi dữ liệu hoặc schema production.
- Chạy seed, restore, reset database, script sửa dữ liệu hàng loạt hoặc script thử nghiệm trên production.
- Chạy migration có thể thay đổi schema hoặc dữ liệu production.
- Chạy test có khả năng ghi dữ liệu thật.
- Thay đổi `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL` hoặc bất kỳ biến môi trường kết nối database nào.
- Thay đổi cấu hình Supabase, Render, GitHub Actions hoặc luồng deploy.
- Để frontend local gửi yêu cầu ghi dữ liệu tới API production (ví dụ `VITE_API_BASE_URL` trỏ domain Render).
- Chạy lệnh Git hoặc deploy có thể đưa thay đổi chưa kiểm tra lên production.

Không được cho rằng một thao tác là an toàn chỉ vì tên file hoặc tên lệnh có chữ `test`, `dev`, `seed`, `backup` hoặc `safe`. Phải kiểm tra tác động thực tế.

## 3. Bắt buộc kiểm tra trước khi thao tác

Trước khi thực hiện bất kỳ công việc nào liên quan đến database, API ghi dữ liệu, migration, seed, restore, deploy hoặc cấu hình môi trường:

1. Xác định chính xác thao tác sẽ ảnh hưởng tới thành phần nào.
2. Kiểm tra lệnh có thể kết nối tới production hay không (connection string, hostname, biến môi trường).
3. Ưu tiên dữ liệu giả, mock API và kiểm thử không ghi dữ liệu.
4. Nếu không xác minh được môi trường kết nối hoặc phạm vi ảnh hưởng, phải dừng lại.
5. Báo cho chủ dự án biết rủi ro, file liên quan và phương án an toàn hơn.
6. Chờ đồng ý rõ ràng trước khi thực hiện thao tác có nguy cơ ảnh hưởng dữ liệu thật.

Không được tự suy đoán rằng database là local hoặc dữ liệu có thể khôi phục được.

## 4. Phát triển và kiểm thử an toàn

- Ưu tiên sửa giao diện, logic frontend và sử dụng mock data / mock API khi có thể.
- Không sử dụng dữ liệu production làm dữ liệu thử nghiệm.
- Không chạy script sửa dữ liệu thật chỉ để kiểm tra một chức năng.
- Khi cần kiểm thử backend có ghi dữ liệu, chỉ sử dụng môi trường đã xác minh là an toàn (DB test độc lập, không phải production).
- Không được coi `NODE_ENV=development`, tên file `test` hoặc tên lệnh `dev` là bằng chứng database an toàn. Phải kiểm tra hostname/connection target thực tế.
- Không chạy script nguy hiểm chỉ vì cho rằng có thể khôi phục dữ liệu.
- Không tự ý xóa file backup, migration hoặc script hiện có.
- Không tự ý sửa file `.env`, `render.yaml`, cấu hình CI/CD hoặc file kết nối database.

## 5. Quy trình xin phép

Trước khi thực hiện bất kỳ thao tác nào có khả năng thay đổi dữ liệu thật, phải trình bày:

- Thao tác dự định thực hiện.
- File và lệnh liên quan.
- Dữ liệu hoặc schema có thể bị ảnh hưởng.
- Rủi ro và phương án thay thế an toàn.

Sau đó dừng lại và chờ xác nhận rõ ràng. Không được coi yêu cầu sửa lỗi hoặc hoàn thành tính năng là sự cho phép thay đổi dữ liệu production. Nếu việc hoàn thành nhiệm vụ xung đột với bảo vệ dữ liệu, ưu tiên bảo vệ dữ liệu.

## 6. Báo cáo sau mỗi công việc

Khi hoàn thành một nhiệm vụ, phải báo cáo:

- File đã đọc, đã sửa và đã tạo.
- Các lệnh đã chạy.
- Những bài kiểm thử đã thực hiện.
- Có hay không có thao tác ghi dữ liệu.
- Có hay không có thay đổi cấu hình database, migration hoặc deploy.
- Những rủi ro chưa được xác minh.

Không được tuyên bố dữ liệu production đã an toàn tuyệt đối nếu chưa có biện pháp kỹ thuật và kiểm chứng phù hợp.
