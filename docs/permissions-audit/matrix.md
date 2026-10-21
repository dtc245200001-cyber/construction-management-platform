# Ma trận phân quyền toàn bộ hành động hệ thống (Matrix RBAC)

> **Dự án:** Nền tảng điều hành thi công công trình  
> **Đối tượng đối chiếu:** Mã nguồn đang chạy thực tế vs. Tài liệu Backlog / Thiết kế vai trò  
> **Ký hiệu ô:** `✔`: được phép | `—`: không được phép | `own`: chỉ phần của chính mình / đội mình | `?`: chưa chốt  

| Hành động (Mã & Mô tả) | Chủ đầu tư | Ban quản lý | Kỹ sư giám sát | Chỉ huy trưởng | Đội trưởng | Kế toán | Khách | System Admin | Theo Backlog | Nhãn |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|:---:|
| **E-01: Hạ tầng, CI/CD và vận hành môi trường** | | | | | | | | | | |
| `PUBLIC_VIEW_PROJECT`<br>Xem danh sách và chi tiết dự án công khai | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `PUBLIC_VIEW_PROJECT`<br>Xem danh sách và chi tiết dự án công khai | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `PUBLIC_NEWSLETTER`<br>Đăng ký nhận bản tin công trình | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `PUBLIC_ACCEPT_INVITATION`<br>Kiểm tra token và chấp nhận lời mời tham gia dự án | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `PUBLIC_ACCEPT_INVITATION`<br>Kiểm tra token và chấp nhận lời mời tham gia dự án | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `SYSTEM_HEALTH_CHECK`<br>Kiểm tra trạng thái sống và sẵn sàng của ứng dụng / DB | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `SYSTEM_HEALTH_CHECK`<br>Kiểm tra trạng thái sống và sẵn sàng của ứng dụng / DB | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `SYSTEM_HEALTH_CHECK`<br>Kiểm tra trạng thái sống và sẵn sàng của ứng dụng / DB | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `SYSTEM_HEALTH_CHECK`<br>Kiểm tra trạng thái sống và sẵn sàng của ứng dụng / DB | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `JOB_DB_BACKUP_NIGHTLY`<br>Sao lưu cơ sở dữ liệu tự động hằng đêm bằng pg_dump ngoài container | — | — | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `JOB_STAGING_MONITOR`<br>Giám sát sức khoẻ staging và cảnh báo khi staging ngừng phản hồi quá 5 phút | — | — | — | — | — | — | — | ✔ | all_authenticated | **KHỚP** |
| **E-02: Tài khoản, dự án và phân quyền** | | | | | | | | | | |
| `ADMIN_INVITE_USER`<br>Quản trị viên hệ thống gửi lời mời người dùng mới qua email | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_LIST_USERS`<br>Xem danh sách toàn bộ người dùng trong hệ thống (Tab Người dùng) | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_LIST_PROJECTS`<br>Xem danh sách toàn bộ dự án trong hệ thống (Tab Tất cả dự án) | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_CREATE_PROJECT`<br>Quản trị viên hệ thống tạo dự án mới | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_ASSIGN_PM`<br>Gán Ban quản lý cho dự án từ trang quản trị | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_AUDIT_LOGS`<br>Xem nhật ký hệ thống toàn cục (Tab Nhật ký hệ thống) | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_LOCK_USER`<br>Quản trị viên hệ thống khóa tài khoản người dùng | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_LOCK_USER`<br>Quản trị viên hệ thống khóa tài khoản người dùng | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `ADMIN_RESET_PASSWORD`<br>Quản trị viên hệ thống đặt lại mật khẩu cho tài khoản người dùng | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `AUTH_REGISTER`<br>Đăng ký tài khoản người dùng mới | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `AUTH_LOGIN`<br>Đăng nhập hệ thống bằng email và mật khẩu (khóa sau 5 lần sai) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `AUTH_ME`<br>Lấy thông tin tài khoản người dùng đang đăng nhập | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | all_authenticated | **LỆCH-QUYỀN** |
| `AUTH_LOGOUT`<br>Đăng xuất khỏi hệ thống và hủy phiên làm việc | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | all_authenticated | **LỆCH-QUYỀN** |
| `AUTH_PASSWORD_RESET`<br>Yêu cầu và thực hiện đặt lại mật khẩu qua email token | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `AUTH_PASSWORD_RESET`<br>Yêu cầu và thực hiện đặt lại mật khẩu qua email token | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `AUTH_GOOGLE_OAUTH`<br>Đăng nhập hoặc liên kết bằng tài khoản Google OAuth | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `AUTH_GOOGLE_OAUTH`<br>Đăng nhập hoặc liên kết bằng tài khoản Google OAuth | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `AUTH_GOOGLE_OAUTH`<br>Đăng nhập hoặc liên kết bằng tài khoản Google OAuth | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | public | **KHỚP** |
| `PROJECT_LIST_MINE`<br>Lấy danh sách các dự án mà tài khoản hiện tại tham gia | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | all_authenticated | **KHỚP** |
| `PROJECT_CREATE`<br>Khởi tạo dự án xây dựng mới (tự động gán người tạo là Ban quản lý) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | all_authenticated | **KHỚP** |
| `PROJECT_DELETE`<br>Xóa dự án (chỉ cho phép System Admin thực hiện) | — | — | — | — | — | — | — | ✔ | system_admin | **LỆCH-QUYỀN** |
| `PROJECT_UPDATE`<br>Cập nhật thông tin tổng quan, thời gian, trạng thái dự án | — | — | — | — | — | — | — | ✔ | ban_quan_ly | **LỆCH-QUYỀN** |
| `PROJECT_VIEW_DETAIL`<br>Xem chi tiết dự án | — | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **LỆCH-QUYỀN** |
| `PROJECT_VIEW_DETAIL`<br>Xem chi tiết dự án | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `PROJECT_VIEW_DETAIL`<br>Xem chi tiết dự án | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `MEMBER_LIST`<br>Xem danh sách thành viên dự án và lời mời đang chờ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `MEMBER_INVITE_OR_ADD`<br>Thêm thành viên đã có tài khoản hoặc gửi thư mời người mới vào dự án | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `MEMBER_REMOVE`<br>Xóa thành viên khỏi dự án (chặn tự gỡ mình) | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `MEMBER_REMOVE`<br>Xóa thành viên khỏi dự án (chặn tự gỡ mình) | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `MEMBER_LOCK_ACCOUNT`<br>Ban quản lý tạm khóa tài khoản thành viên trong dự án | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `INVITATION_MANAGE`<br>Gửi lại hoặc thu hồi lời mời tham gia dự án, kiểm tra trạng thái gửi email | ✔ | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly, chi_huy_truong, chu_dau_tu | **KHỚP** |
| `INVITATION_MANAGE`<br>Gửi lại hoặc thu hồi lời mời tham gia dự án, kiểm tra trạng thái gửi email | ✔ | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly, chi_huy_truong, chu_dau_tu | **KHỚP** |
| `SERVICE_EMAIL_WORKER`<br>Xử lý hàng đợi gửi email mời thành viên và email đặt lại mật khẩu | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `UI_ADMIN_PORTAL`<br>Hiển thị trang Quản trị hệ thống với 3 tab: Người dùng / Tất cả dự án / Nhật ký hệ thống | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `UI_ADMIN_CREATE_PROJECT_BTN`<br>Nút bấm 'Khởi tạo dự án' trên giao diện Quản trị hệ thống | — | — | — | — | — | — | — | ✔ | system_admin | **KHỚP** |
| `UI_MEMBERS_INVITE_BTN`<br>Nút bấm 'Mời thành viên mới' trên trang Quản lý thành viên dự án | — | ✔ | — | — | — | — | — | — | ban_quan_ly | **KHỚP** |
| **E-03: Cơ cấu công việc và hợp đồng khối lượng** | | | | | | | | | | |
| `WBS_VIEW_TREE`<br>Xem cây cơ cấu phân chia công việc (WBS) và danh sách hạng mục | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `WBS_VIEW_TREE`<br>Xem cây cơ cấu phân chia công việc (WBS) và danh sách hạng mục | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `WBS_MANAGE_ITEMS`<br>Tạo, sửa, xóa, sắp xếp lại thứ tự hạng mục WBS | — | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly | **LỆCH-QUYỀN** |
| `WBS_MANAGE_ITEMS`<br>Tạo, sửa, xóa, sắp xếp lại thứ tự hạng mục WBS | — | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly | **LỆCH-QUYỀN** |
| `WBS_MANAGE_ITEMS`<br>Tạo, sửa, xóa, sắp xếp lại thứ tự hạng mục WBS | — | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly | **LỆCH-QUYỀN** |
| `WBS_MANAGE_ITEMS`<br>Tạo, sửa, xóa, sắp xếp lại thứ tự hạng mục WBS | — | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly | **LỆCH-QUYỀN** |
| `CONTRACT_VIEW_QUANTITIES`<br>Xem khối lượng hợp đồng các hạng mục (ẩn đơn giá nếu không đủ quyền) | ✔ | ✔ | ✔ | ✔ | — | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ke_toan, ky_su_giam_sat, chi_huy_truong | **KHỚP** |
| `CONTRACT_MUTATE_QUANTITIES`<br>Cập nhật đơn giá, khối lượng hợp đồng hoặc gỡ bỏ ràng buộc hợp đồng | ✔ | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly | **KHỚP** |
| `CONTRACT_MUTATE_QUANTITIES`<br>Cập nhật đơn giá, khối lượng hợp đồng hoặc gỡ bỏ ràng buộc hợp đồng | ✔ | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly | **KHỚP** |
| `UI_CONTRACT_PRICE_MASKING`<br>Ẩn cột đơn giá và giá trị hợp đồng đối với Đội trưởng, Kỹ sư giám sát và Chỉ huy trưởng | ✔ | ✔ | — | — | — | ✔ | — | — | chu_dau_tu, ban_quan_ly, ke_toan | **KHỚP** |
| **E-04: Tiến độ và đường găng** | | | | | | | | | | |
| `BASELINE_SAVE`<br>Lưu đường cơ sở (Baseline) tiến độ khi bắt đầu thi công | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `BASELINE_VIEW`<br>Xem các phiên bản đường cơ sở tiến độ đã lưu | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DEPENDENCY_MANAGE`<br>Thiết lập hoặc xóa quan hệ phụ thuộc giữa các công việc (chặn vòng chu trình) | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `DEPENDENCY_VIEW_TASK`<br>Xem các mối quan hệ phụ thuộc của một công việc cụ thể | — | — | — | — | — | — | — | — | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHÔNG-KHAI-QUYỀN** |
| `DEPENDENCY_VIEW_TASK`<br>Xem các mối quan hệ phụ thuộc của một công việc cụ thể | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHÔNG-KHAI-QUYỀN** |
| `MILESTONE_VIEW_LIST`<br>Xem danh sách các mốc thi công quan trọng | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `MILESTONE_MANAGE`<br>Tạo mới, cập nhật, xóa mốc thi công dự án | ✔ | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly | **KHỚP** |
| `MILESTONE_MANAGE`<br>Tạo mới, cập nhật, xóa mốc thi công dự án | ✔ | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly | **KHỚP** |
| `MILESTONE_VIEW_LIST`<br>Xem danh sách các mốc thi công quan trọng | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `MILESTONE_VIEW_LIST`<br>Xem danh sách các mốc thi công quan trọng | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `PROGRESS_VIEW_DASHBOARD`<br>Xem Dashboard tổng hợp tiến độ chỉ dành riêng cho Chủ đầu tư | ✔ | — | — | — | — | — | — | ✔ | chu_dau_tu | **KHỚP** |
| `SCHEDULE_VIEW_RESULTS`<br>Xem kết quả tính toán đường găng, các mốc thời gian sớm/muộn và độ trễ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `SCHEDULE_VIEW_RESULTS`<br>Xem kết quả tính toán đường găng, các mốc thời gian sớm/muộn và độ trễ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `SCHEDULE_RECALCULATE_CPM`<br>Tính toán lại toàn bộ lịch tiến độ CPM và đường găng | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `SCHEDULE_VIEW_RESULTS`<br>Xem kết quả tính toán đường găng, các mốc thời gian sớm/muộn và độ trễ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `CALENDAR_VIEW`<br>Xem lịch làm việc tuần và danh sách ngày nghỉ lễ công trường | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `CALENDAR_MANAGE`<br>Cấu hình ngày làm việc trong tuần và thêm/xóa ngày nghỉ lễ | ✔ | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly, chu_dau_tu, chi_huy_truong | **KHỚP** |
| `CALENDAR_VIEW`<br>Xem lịch làm việc tuần và danh sách ngày nghỉ lễ công trường | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `CALENDAR_MANAGE`<br>Cấu hình ngày làm việc trong tuần và thêm/xóa ngày nghỉ lễ | ✔ | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly, chu_dau_tu, chi_huy_truong | **KHỚP** |
| `CALENDAR_MANAGE`<br>Cấu hình ngày làm việc trong tuần và thêm/xóa ngày nghỉ lễ | ✔ | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly, chu_dau_tu, chi_huy_truong | **KHỚP** |
| `CALENDAR_MANAGE`<br>Cấu hình ngày làm việc trong tuần và thêm/xóa ngày nghỉ lễ | ✔ | ✔ | — | ✔ | — | — | — | ✔ | ban_quan_ly, chu_dau_tu, chi_huy_truong | **KHỚP** |
| `TASK_MANAGE`<br>Khai báo, chỉnh sửa, xóa công việc và thời lượng thi công | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `TASK_MANAGE`<br>Khai báo, chỉnh sửa, xóa công việc và thời lượng thi công | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `TASK_MANAGE`<br>Khai báo, chỉnh sửa, xóa công việc và thời lượng thi công | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `TASK_MANAGE`<br>Khai báo, chỉnh sửa, xóa công việc và thời lượng thi công | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `TASK_MANAGE`<br>Khai báo, chỉnh sửa, xóa công việc và thời lượng thi công | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `JOB_SCHEDULE_CALC_ASYNC`<br>Xử lý hàng đợi tính toán tiến độ CPM và đường găng chạy ngầm | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `UI_PROGRESS_DASHBOARD_MENU`<br>Menu điều hướng 'Tiến độ tổng hợp' trên thanh Sidebar | ✔ | — | — | — | — | — | — | — | chu_dau_tu | **KHỚP** |
| `BACKLOG_GANTT_INTERACTIVE`<br>Kéo thả điều chỉnh thời lượng và quan hệ công việc trực tiếp trên biểu đồ Gantt | — | — | — | — | — | — | — | — | ban_quan_ly, chi_huy_truong | **THIẾU-TRONG-MÃ** |
| `BACKLOG_SHIFT_HOURLY_CALENDAR`<br>Lịch làm việc chi tiết theo ca và theo giờ trong ngày | — | — | — | — | — | — | — | — | ban_quan_ly, chi_huy_truong | **THIẾU-TRONG-MÃ** |
| `BACKLOG_MONTE_CARLO_FORECAST`<br>Dự báo ngày hoàn thành và xác suất rủi ro bằng mô phỏng Monte Carlo | — | — | — | — | — | — | — | — | chu_dau_tu, ban_quan_ly | **THIẾU-TRONG-MÃ** |
| **E-11: Giao việc cho đội và báo cáo từ hiện trường** | | | | | | | | | | |
| `TASK_LOG_COMMUNICATION`<br>Đăng và xem trao đổi, hình ảnh hiện trường trực tiếp theo từng công việc | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `TASK_LOG_COMMUNICATION`<br>Đăng và xem trao đổi, hình ảnh hiện trường trực tiếp theo từng công việc | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `TASK_LOG_COMMUNICATION`<br>Đăng và xem trao đổi, hình ảnh hiện trường trực tiếp theo từng công việc | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `TEAM_LIST`<br>Xem danh sách các đội thi công trong dự án | — | — | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **LỆCH-QUYỀN** |
| `TEAM_CREATE`<br>Tạo mới đội thi công trong dự án | — | — | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `TEAM_LIST_MEMBERS`<br>Xem danh sách thành viên thuộc đội thi công | — | — | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **LỆCH-QUYỀN** |
| `TEAM_ADD_MEMBER`<br>Thêm thành viên dự án vào đội thi công | — | — | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `TEAM_VIEW_WORKLOAD`<br>Xem phân tích tải công việc và cảnh báo quá tải đội thi công | — | — | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **LỆCH-QUYỀN** |
| `TASK_ASSIGN_TO_TEAM`<br>Phân công công việc cho đội và đặt khối lượng kế hoạch | — | — | — | — | — | — | — | ✔ | chi_huy_truong | **LỆCH-QUYỀN** |
| `TASK_ASSIGN_TO_TEAM`<br>Phân công công việc cho đội và đặt khối lượng kế hoạch | — | — | — | — | — | — | — | ✔ | chi_huy_truong | **LỆCH-QUYỀN** |
| `TASK_ASSIGN_TO_TEAM`<br>Phân công công việc cho đội và đặt khối lượng kế hoạch | — | — | — | — | — | — | — | ✔ | chi_huy_truong | **LỆCH-QUYỀN** |
| `TEAM_VIEW_ALL_TASKS`<br>Xem danh sách phân công công việc của tất cả các đội | — | — | — | — | — | — | — | ✔ | chi_huy_truong, ban_quan_ly, chu_dau_tu | **LỆCH-QUYỀN** |
| `TEAM_LIST`<br>Xem danh sách các đội thi công trong dự án | — | — | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **LỆCH-QUYỀN** |
| `TEAM_VIEW_OWN_TASKS`<br>Đội trưởng xem các công việc được giao cho đội mình | — | — | — | — | — | — | — | ✔ | doi_truong | **LỆCH-QUYỀN** |
| `QUANTITY_REPORT_CREATE`<br>Đội trưởng báo cáo khối lượng hoàn thành của đội mình từ hiện trường | — | — | — | — | ✔ | — | — | ✔ | doi_truong | **KHỚP** |
| `QUANTITY_REPORT_VIEW`<br>Xem lịch sử báo cáo khối lượng công việc theo đội | — | — | — | — | — | — | — | ✔ | doi_truong, chi_huy_truong, ban_quan_ly, chu_dau_tu | **LỆCH-QUYỀN** |
| `QUANTITY_REPORT_VIEW`<br>Xem lịch sử báo cáo khối lượng công việc theo đội | — | — | — | — | — | — | — | ✔ | doi_truong, chi_huy_truong, ban_quan_ly, chu_dau_tu | **LỆCH-QUYỀN** |
| `QUANTITY_REPORT_VIEW`<br>Xem lịch sử báo cáo khối lượng công việc theo đội | — | — | — | — | — | — | — | ✔ | doi_truong, chi_huy_truong, ban_quan_ly, chu_dau_tu | **LỆCH-QUYỀN** |
| **E-05: Nhật ký công trường ngoại tuyến** | | | | | | | | | | |
| `DIARY_VIEW_DAILY_HEADER`<br>Xem thông tin đầu ngày và dự báo thời tiết công trường | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DIARY_VIEW_DAILY_HEADER`<br>Xem thông tin đầu ngày và dự báo thời tiết công trường | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DIARY_VIEW_DAILY_HEADER`<br>Xem thông tin đầu ngày và dự báo thời tiết công trường | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DIARY_RECORD_DAILY_HEADER`<br>Ghi nhận thông tin đầu ngày: nhân lực, thiết bị, thời tiết | — | ✔ | ✔ | ✔ | — | — | — | ✔ | ky_su_giam_sat, chi_huy_truong | **LỆCH-QUYỀN** |
| `DIARY_MUTATE_ENTRY`<br>Tạo mới, chỉnh sửa hoặc xóa mục nhật ký thi công | — | ✔ | ✔ | ✔ | — | — | — | ✔ | ky_su_giam_sat, chi_huy_truong | **LỆCH-QUYỀN** |
| `DIARY_VIEW_ENTRIES`<br>Xem các mục nhật ký thi công công việc | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DIARY_MUTATE_ENTRY`<br>Tạo mới, chỉnh sửa hoặc xóa mục nhật ký thi công | — | ✔ | ✔ | ✔ | — | — | — | ✔ | ky_su_giam_sat, chi_huy_truong | **LỆCH-QUYỀN** |
| `DIARY_MUTATE_ENTRY`<br>Tạo mới, chỉnh sửa hoặc xóa mục nhật ký thi công | — | ✔ | ✔ | ✔ | — | — | — | ✔ | ky_su_giam_sat, chi_huy_truong | **LỆCH-QUYỀN** |
| `DIARY_VIEW_CONFLICTS`<br>Xem danh sách xung đột nhật ký phát sinh do sửa ngoại tuyến | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DIARY_RESOLVE_CONFLICT`<br>Giải quyết xung đột phiên bản nhật ký khi đồng bộ ngoại tuyến | — | ✔ | ✔ | ✔ | — | — | — | ✔ | ban_quan_ly, chi_huy_truong | **LỆCH-QUYỀN** |
| `DIARY_MUTATE_ENTRY`<br>Tạo mới, chỉnh sửa hoặc xóa mục nhật ký thi công | — | ✔ | ✔ | ✔ | — | — | — | ✔ | ky_su_giam_sat, chi_huy_truong | **LỆCH-QUYỀN** |
| `DIARY_VIEW_ENTRIES`<br>Xem các mục nhật ký thi công công việc | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DIARY_VIEW_LOCKS`<br>Xem trạng thái khóa sổ nhật ký theo ngày | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `DIARY_CLOSE_DAY`<br>Chốt sổ nhật ký cuối ngày (chỉ cho phép khóa ngày đã qua) | — | — | ✔ | — | — | — | — | ✔ | ky_su_giam_sat | **KHỚP** |
| `DIARY_UNLOCK_DAY`<br>Mở khóa sổ nhật ký của ngày đã qua (bắt buộc nhập lý do và ghi audit) | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `DIARY_VIEW_LOCKS`<br>Xem trạng thái khóa sổ nhật ký theo ngày | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `SERVICE_OFFLINE_SYNC_ENGINE`<br>Động cơ đồng bộ nhật ký từ bộ nhớ trình duyệt (IndexedDB) khi có mạng trở lại | — | ✔ | ✔ | ✔ | — | — | — | — | ky_su_giam_sat, chi_huy_truong | **LỆCH-QUYỀN** |
| `UI_DIARY_LOCK_BTN`<br>Nút bấm 'Chốt sổ nhật ký' cuối ngày thi công | — | — | ✔ | — | — | — | — | — | ky_su_giam_sat | **KHỚP** |
| `UI_DIARY_UNLOCK_BTN`<br>Nút bấm 'Mở khóa nhật ký' kèm hộp thoại bắt buộc nhập lý do điều chỉnh | — | ✔ | — | — | — | — | — | — | ban_quan_ly | **KHỚP** |
| `BACKLOG_OFFLINE_PHOTO_ATTACH`<br>Đính kèm và lưu trữ ảnh chụp hiện trường vào IndexedDB ngoại tuyến | — | — | — | — | — | — | — | — | ky_su_giam_sat, doi_truong | **THIẾU-TRONG-MÃ** |
| **E-06: Nghiệm thu khối lượng luỹ kế** | | | | | | | | | | |
| `ACCEPTANCE_CREATE_VOUCHER`<br>Lập phiếu nghiệm thu nháp cho đợt thi công (chỉ hạng mục lá, luỹ kế mới >= 0) | — | — | ✔ | — | — | — | — | ✔ | ky_su_giam_sat | **KHỚP** |
| `ACCEPTANCE_VIEW_VOUCHERS`<br>Xem danh sách hoặc chi tiết phiếu nghiệm thu khối lượng đợt | ✔ | ✔ | ✔ | — | — | — | — | ✔ | ky_su_giam_sat, chu_dau_tu, ban_quan_ly | **KHỚP** |
| `ACCEPTANCE_VIEW_VOUCHERS`<br>Xem danh sách hoặc chi tiết phiếu nghiệm thu khối lượng đợt | ✔ | ✔ | ✔ | — | — | — | — | ✔ | ky_su_giam_sat, chu_dau_tu, ban_quan_ly | **KHỚP** |
| `ACCEPTANCE_VIEW_VOUCHERS`<br>Xem danh sách hoặc chi tiết phiếu nghiệm thu khối lượng đợt | ✔ | ✔ | ✔ | — | — | — | — | ✔ | ky_su_giam_sat, chu_dau_tu, ban_quan_ly | **KHỚP** |
| `ACCEPTANCE_UPDATE_VOUCHER`<br>Chỉnh sửa phiếu nghiệm thu đang ở trạng thái nháp hoặc bị trả lại | — | — | ✔ | — | — | — | — | ✔ | ky_su_giam_sat | **KHỚP** |
| `ACCEPTANCE_CREATE_VOUCHER`<br>Lập phiếu nghiệm thu nháp cho đợt thi công (chỉ hạng mục lá, luỹ kế mới >= 0) | — | — | ✔ | — | — | — | — | ✔ | ky_su_giam_sat | **KHỚP** |
| `ACCEPTANCE_APPROVE_OFFICIAL`<br>Duyệt chính thức phiếu nghiệm thu khối lượng đợt | — | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly | **LỆCH-QUYỀN** |
| `ACCEPTANCE_RETURN_OFFICIAL`<br>Trả lại phiếu nghiệm thu khối lượng đợt kèm lý do yêu cầu sửa đổi | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `ACCEPTANCE_VIEW_VOUCHERS`<br>Xem danh sách hoặc chi tiết phiếu nghiệm thu khối lượng đợt | ✔ | ✔ | ✔ | — | — | — | — | ✔ | ky_su_giam_sat, chu_dau_tu, ban_quan_ly | **KHỚP** |
| `ACCEPTANCE_VIEW_VOUCHERS`<br>Xem danh sách hoặc chi tiết phiếu nghiệm thu khối lượng đợt | ✔ | ✔ | — | — | — | — | — | ✔ | ky_su_giam_sat, chu_dau_tu, ban_quan_ly | **LỆCH-QUYỀN** |
| `ACCEPTANCE_UPLOAD_PHOTO`<br>Tải ảnh hiện trường đính kèm phiếu nghiệm thu (lưu BYTEA, kiểm magic bytes) | — | — | ✔ | — | — | — | — | ✔ | ky_su_giam_sat | **KHỚP** |
| `ACCEPTANCE_VIEW_PHOTOS`<br>Xem danh sách ảnh và kết quả kiểm tra siêu dữ liệu EXIF/GPS ảnh nghiệm thu | ✔ | ✔ | ✔ | — | — | — | — | ✔ | ky_su_giam_sat, chu_dau_tu, ban_quan_ly | **KHỚP** |
| `ACCEPTANCE_EXPORT_DOSSIER`<br>Xuất hồ sơ nghiệm thu đợt ra tệp PDF / Excel có bảng đối chiếu | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `SERVICE_PDF_ACCEPTANCE_EXPORT`<br>Sinh tệp PDF hồ sơ nghiệm thu đợt kèm bảng đối chiếu luỹ kế | — | ✔ | — | — | — | — | — | — | ban_quan_ly | **KHỚP** |
| `BACKLOG_DIGITAL_SIGNATURE`<br>Ký số biên bản nghiệm thu và đề nghị thanh toán (SmartCA / USB Token) | — | — | — | — | — | — | — | — | chu_dau_tu, ban_quan_ly | **THIẾU-TRONG-MÃ** |
| **E-07: Ảnh hiện trường chống giả mạo** | | | | | | | | | | |
| `PHOTO_VIEW_METADATA_STATS`<br>Xem thống kê siêu dữ liệu ảnh hiện trường (ảnh có GPS, thời điểm chụp, thiết bị) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `SITE_GEOFENCE_VIEW`<br>Xem cấu hình toạ độ tâm và bán kính công trường | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | chu_dau_tu, ban_quan_ly, ky_su_giam_sat, chi_huy_truong, doi_truong, ke_toan | **KHỚP** |
| `SITE_GEOFENCE_MANAGE`<br>Cấu hình toạ độ tâm, bán kính công trường hoặc quét lại trạng thái phạm vi ảnh | ✔ | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly | **KHỚP** |
| `SITE_GEOFENCE_MANAGE`<br>Cấu hình toạ độ tâm, bán kính công trường hoặc quét lại trạng thái phạm vi ảnh | ✔ | ✔ | — | — | — | — | — | ✔ | chu_dau_tu, ban_quan_ly | **KHỚP** |
| `PHOTO_UPLOAD_CHUNKED`<br>Khởi tạo phiên, gửi chunk, commit hoặc hủy tải ảnh dung lượng lớn từng phần | — | ✔ | ✔ | ✔ | ✔ | — | — | ✔ | ky_su_giam_sat, chi_huy_truong, ban_quan_ly, doi_truong | **KHỚP** |
| `PHOTO_UPLOAD_CHUNKED`<br>Khởi tạo phiên, gửi chunk, commit hoặc hủy tải ảnh dung lượng lớn từng phần | — | ✔ | ✔ | ✔ | ✔ | — | — | ✔ | ky_su_giam_sat, chi_huy_truong, ban_quan_ly, doi_truong | **KHỚP** |
| `PHOTO_UPLOAD_CHUNKED`<br>Khởi tạo phiên, gửi chunk, commit hoặc hủy tải ảnh dung lượng lớn từng phần | — | ✔ | ✔ | ✔ | ✔ | — | — | ✔ | ky_su_giam_sat, chi_huy_truong, ban_quan_ly, doi_truong | **KHỚP** |
| `PHOTO_UPLOAD_CHUNKED`<br>Khởi tạo phiên, gửi chunk, commit hoặc hủy tải ảnh dung lượng lớn từng phần | — | ✔ | ✔ | ✔ | ✔ | — | — | ✔ | ky_su_giam_sat, chi_huy_truong, ban_quan_ly, doi_truong | **KHỚP** |
| `PHOTO_UPLOAD_CHUNKED`<br>Khởi tạo phiên, gửi chunk, commit hoặc hủy tải ảnh dung lượng lớn từng phần | — | ✔ | ✔ | ✔ | ✔ | — | — | ✔ | ky_su_giam_sat, chi_huy_truong, ban_quan_ly, doi_truong | **KHỚP** |
| `SERVICE_PHOTO_METADATA_EXTRACT`<br>Trích xuất toạ độ GPS và ngày giờ chụp từ siêu dữ liệu EXIF ảnh hiện trường | — | ✔ | ✔ | ✔ | ✔ | — | — | — | ky_su_giam_sat, doi_truong | **KHỚP** |
| `SERVICE_GEOFENCE_EVALUATE`<br>Tính khoảng cách Haversine giữa toạ độ ảnh và tâm công trường, gán nhãn MATCH/OUT_OF_BOUNDS | ✔ | ✔ | — | — | — | — | — | — | chu_dau_tu, ban_quan_ly | **KHỚP** |
| `BACKLOG_CLIENT_IMAGE_COMPRESSION`<br>Nén ảnh phía máy khách (Canvas/WASM) trước khi đưa vào hàng đợi tải lên | — | — | — | — | — | — | — | — | all_authenticated | **THIẾU-TRONG-MÃ** |
| **E-08: Thanh toán theo tiến độ** | | | | | | | | | | |
| `PAYMENT_REQUEST_CREATE`<br>Lập đề nghị thanh toán từ các phiếu nghiệm thu đã được phê duyệt | — | ✔ | — | — | — | — | — | ✔ | ban_quan_ly | **KHỚP** |
| `PAYMENT_REQUEST_VIEW`<br>Xem danh sách và chi tiết các đợt đề nghị thanh toán | ✔ | ✔ | — | — | — | ✔ | — | ✔ | ban_quan_ly, chu_dau_tu, ke_toan | **KHỚP** |
| `PAYMENT_REQUEST_VIEW`<br>Xem danh sách và chi tiết các đợt đề nghị thanh toán | ✔ | ✔ | — | — | — | ✔ | — | ✔ | ban_quan_ly, chu_dau_tu, ke_toan | **KHỚP** |
| `PAYMENT_REQUEST_APPROVE`<br>Chủ đầu tư phê duyệt đề nghị thanh toán theo đợt | ✔ | — | — | — | — | — | — | ✔ | chu_dau_tu | **KHỚP** |
| `PAYMENT_REQUEST_RETURN`<br>Chủ đầu tư trả lại đề nghị thanh toán kèm lý do yêu cầu rà soát | ✔ | — | — | — | — | — | — | ✔ | chu_dau_tu | **KHỚP** |
| `PAYMENT_RETENTION_MANAGE`<br>Cấu hình tỷ lệ tạm giữ bảo hành và giải tỏa tạm giữ theo hợp đồng/dự án | ✔ | ✔ | — | — | — | ✔ | — | ✔ | ban_quan_ly, chu_dau_tu | **LỆCH-QUYỀN** |
| `PAYMENT_RETENTION_MANAGE`<br>Cấu hình tỷ lệ tạm giữ bảo hành và giải tỏa tạm giữ theo hợp đồng/dự án | ✔ | ✔ | — | — | — | — | — | ✔ | ban_quan_ly, chu_dau_tu | **KHỚP** |
| `UI_PAYMENT_APPROVE_BTN`<br>Nút 'Duyệt thanh toán' trên màn hình chi tiết đợt đề nghị thanh toán | ✔ | — | — | — | — | — | — | — | chu_dau_tu | **KHỚP** |
| **E-09: Dự toán, thực chi và vật tư** | | | | | | | | | | |
| `ACTUAL_COST_RECORD`<br>Ghi nhận chi phí thực tế hoặc nhập hàng loạt từ tệp CSV | — | — | — | — | — | ✔ | — | ✔ | ban_quan_ly | **LỆCH-QUYỀN** |
| `ACTUAL_COST_VIEW`<br>Xem danh sách các khoản chi thực tế gắn với hạng mục dự án | ✔ | ✔ | — | ✔ | — | ✔ | — | ✔ | ban_quan_ly, chu_dau_tu, ke_toan, chi_huy_truong | **KHỚP** |
| `ACTUAL_COST_RECORD`<br>Ghi nhận chi phí thực tế hoặc nhập hàng loạt từ tệp CSV | — | — | — | — | — | ✔ | — | ✔ | ban_quan_ly | **LỆCH-QUYỀN** |
| `BUDGET_VIEW_VERSIONS`<br>Xem các phiên bản dự toán chi phí đã ban hành | ✔ | ✔ | — | ✔ | — | ✔ | — | ✔ | ban_quan_ly, chu_dau_tu, ke_toan, chi_huy_truong | **KHỚP** |
| `BUDGET_VIEW_VERSIONS`<br>Xem các phiên bản dự toán chi phí đã ban hành | ✔ | ✔ | — | ✔ | — | ✔ | — | ✔ | ban_quan_ly, chu_dau_tu, ke_toan, chi_huy_truong | **KHỚP** |
| `BUDGET_MANAGE`<br>Nhập và lưu phiên bản dự toán chi phí theo hạng mục lá | ✔ | ✔ | — | — | — | — | — | ✔ | ban_quan_ly, chu_dau_tu | **KHỚP** |
| `SERVICE_CSV_ACTUAL_COST_IMPORT`<br>Phân tích cú pháp tệp CSV và nạp hàng loạt các khoản chi thực tế | — | — | — | — | — | ✔ | — | — | ban_quan_ly | **LỆCH-QUYỀN** |
| **E-10: Nhật ký hệ thống, báo cáo và thông báo** | | | | | | | | | | |
| `BACKLOG_PUSH_NOTIFICATION`<br>Gửi thông báo đẩy (Web Push / Service Worker) khi có công việc mới hoặc nhật ký bị khóa | — | — | — | — | — | — | — | — | all_authenticated | **THIẾU-TRONG-MÃ** |
| `BACKLOG_AUTO_EMAIL_REPORT`<br>Định kỳ hằng tuần/tháng tự động xuất báo cáo tiến độ và gửi email cho Chủ đầu tư | — | — | — | — | — | — | — | — | chu_dau_tu | **THIẾU-TRONG-MÃ** |