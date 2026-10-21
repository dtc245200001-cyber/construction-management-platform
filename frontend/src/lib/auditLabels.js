// Nhãn thân thiện cho nhật ký hệ thống — dùng chung cho AdminPage và AuditPortalPage.
// Người không chuyên đọc nhãn tiếng Việt; mã kỹ thuật gốc giữ trong title (tooltip).

// Hành động: mã kỹ thuật -> nhãn tiếng Việt.
export const ACTION_LABELS = {
  // Nghiệm thu
  CREATE_ACCEPTANCE_VOUCHER: "Tạo phiếu nghiệm thu",
  SUBMIT_ACCEPTANCE_VOUCHER: "Gửi duyệt phiếu nghiệm thu",
  RESUBMIT_ACCEPTANCE_VOUCHER: "Gửi lại phiếu sau khi sửa",
  UPDATE_ACCEPTANCE_VOUCHER: "Sửa phiếu nghiệm thu",
  APPROVE_ACCEPTANCE_VOUCHER: "Duyệt phiếu nghiệm thu",
  RETURN_ACCEPTANCE_VOUCHER: "Trả lại phiếu cần sửa",
  // Thanh toán
  APPROVE_PAYMENT_REQUEST: "Duyệt đề nghị thanh toán",
  RETURN_PAYMENT_REQUEST: "Trả lại đề nghị thanh toán",
  UPDATE_PAYMENT_RETENTION_CONFIG: "Đổi mức giữ lại tiền bảo hành",
  CREATE_PAYMENT_REQUEST: "Tạo đề nghị thanh toán",
  // Nhật ký thi công
  CREATE_DIARY_ENTRY: "Ghi nhật ký thi công",
  UPDATE_DIARY_ENTRY: "Sửa nhật ký",
  DELETE_DIARY_ENTRY: "Xóa nhật ký",
  CREATE_DIARY_CONFLICT: "Phát hiện 2 bản ghi trùng",
  RESOLVE_DIARY_CONFLICT: "Chốt bản ghi đúng",
  UPSERT_DIARY_DAILY_LOG: "Cập nhật bảng công ngày",
  UPSERT_DIARY_ENTRY: "Cập nhật nhật ký",
  LOCK_DIARY: "Khóa sổ nhật ký",
  UNLOCK_DIARY: "Mở khóa sổ nhật ký",
  DELETE_DIARY: "Xóa nhật ký",
  // Khối lượng
  CREATE_QUANTITY_REPORT: "Báo khối lượng làm được",
  CONTRACT_QUANTITY_SET: "Gán khối lượng hợp đồng",
  CONTRACT_QUANTITY_CLEAR: "Xóa khối lượng hợp đồng",
  // Dự án
  CREATE_PROJECT: "Tạo dự án mới",
  UPDATE_PROJECT: "Sửa thông tin dự án",
  DELETE_PROJECT: "Xóa dự án",
  SITE_GEOFENCE_SET: "Bật chấm công theo vị trí",
  SITE_GEOFENCE_CLEAR: "Tắt chấm công theo vị trí",
  // Thành viên
  ADD_PROJECT_MEMBER: "Thêm người vào dự án",
  REMOVE_PROJECT_MEMBER: "Xóa người khỏi dự án",
  CREATE_INVITATION: "Mời người vào dự án",
  ASSIGN_PM_FAILSAFE: "Gán lại ban quản lý",
  LOCK_USER: "Khóa tài khoản",
  UNLOCK_USER: "Mở khóa tài khoản",
  RESET_PASSWORD: "Đặt lại mật khẩu",
  CREATE_TEAM: "Tạo tổ đội",
  UPDATE_TEAM: "Sửa tổ đội",
  ASSIGN_TASK: "Giao việc",
  REASSIGN_TASK: "Giao lại việc",
};

// Đối tượng: tên bảng kỹ thuật -> nhãn tiếng Việt.
export const ENTITY_LABELS = {
  acceptance_vouchers: "Phiếu nghiệm thu",
  acceptance_voucher_items: "Hạng mục phiếu",
  acceptance_voucher_photos: "Ảnh phiếu",
  daily_log_locks: "Khóa sổ nhật ký ngày",
  diary_entries: "Nhật ký thi công",
  diary_entry_conflicts: "Xung đột nhật ký",
  diary_daily_logs: "Bảng công ngày",
  day_locks: "Khóa sổ ngày",
  task_quantity_reports: "Báo cáo khối lượng",
  tasks: "Công việc",
  work_items: "Hạng mục",
  projects: "Dự án",
  project_members: "Thành viên dự án",
  users: "Tài khoản",
  invitations: "Thư mời",
  teams: "Tổ đội",
  team_members: "Thành viên tổ đội",
  payment_requests: "Đề nghị thanh toán",
  payment_retention_config: "Mức giữ lại tiền",
  contract_quantities: "Khối lượng hợp đồng",
  audit_logs: "Nhật ký hệ thống",
};

// Nhãn hành động: fallback giữ mã gốc để không mất thông tin khi gặp action mới.
export function actionLabel(action) {
  if (!action) return "—";
  return ACTION_LABELS[action] || action;
}

// Nhãn đối tượng kèm id: "Phiếu nghiệm thu #36".
export function entityLabel(entity, entityId) {
  if (!entity) return "—";
  const name = ENTITY_LABELS[entity] || entity;
  return entityId != null ? `${name} #${entityId}` : name;
}
