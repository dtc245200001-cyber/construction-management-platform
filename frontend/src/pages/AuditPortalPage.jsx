import React, { useState, useEffect, useCallback } from "react";
import PageHeroBanner from "../components/PageHeroBanner";
import api from "../lib/api";
import { can } from "../lib/permissions";
import {
  History,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  ShieldCheck,
  Filter,
  X,
  Calendar,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import {
  ACTION_LABELS,
  ENTITY_LABELS,
  actionLabel,
  entityLabel,
} from "../lib/auditLabels";

const CATEGORY_TABS = [
  { id: "all", label: "Tất cả", entity: "" },
  { id: "acceptance", label: "📋 Nghiệm thu", entity: "acceptance_vouchers" },
  { id: "diary", label: "📔 Nhật ký thi công", entity: "diary_entries" },
  { id: "lock", label: "🔒 Khóa / Mở sổ", entity: "daily_log_locks" },
  { id: "quantity", label: "📊 Khối lượng", entity: "task_quantity_reports" },
];

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (_e) {
    return iso;
  }
}

// Hiển thị 1 cặp {old_value, new_value} gọn gàng
function OldNewDetails({ details }) {
  if (!details || typeof details !== "object") {
    return <span className="text-slate-400 italic">—</span>;
  }

  const hasOldNew =
    Object.prototype.hasOwnProperty.call(details, "old_value") ||
    Object.prototype.hasOwnProperty.call(details, "new_value");

  if (!hasOldNew) {
    // Fallback: render tóm tắt keys cho các log cũ chưa dùng old/new
    const keys = Object.keys(details);
    if (keys.length === 0) return <span className="text-slate-400 italic">—</span>;
    return (
      <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-32">
        {JSON.stringify(details, null, 2)}
      </pre>
    );
  }

  const { old_value, new_value, ...rest } = details;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
      <div>
        <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
          Trước
        </div>
        <pre className="bg-rose-50 border border-rose-100 rounded p-2 overflow-auto max-h-40">
          {old_value == null
            ? "(không có — bản ghi mới)"
            : JSON.stringify(old_value, null, 2)}
        </pre>
      </div>
      <div>
        <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
          Sau
        </div>
        <pre className="bg-emerald-50 border border-emerald-100 rounded p-2 overflow-auto max-h-40">
          {new_value == null ? "(đã xoá / trống)" : JSON.stringify(new_value, null, 2)}
        </pre>
      </div>
      {Object.keys(rest).length > 0 && (
        <div className="md:col-span-2">
          <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
            Thông tin bổ sung
          </div>
          <pre className="bg-slate-50 border rounded p-2 overflow-auto max-h-24">
            {JSON.stringify(rest, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AuditPortalPage({ user }) {
  const projectId = localStorage.getItem("currentProjectId") || 1;

  const [projectRole, setProjectRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityIdFilter, setEntityIdFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 50;

  const setQuickRange = (type) => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const formatYMD = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const todayStr = formatYMD(now);

    if (type === "today") {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === "7days") {
      const past = new Date(now);
      past.setDate(past.getDate() - 7);
      setFromDate(formatYMD(past));
      setToDate(todayStr);
    } else if (type === "30days") {
      const past = new Date(now);
      past.setDate(past.getDate() - 30);
      setFromDate(formatYMD(past));
      setToDate(todayStr);
    } else if (type === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(formatYMD(startOfMonth));
      setToDate(todayStr);
    }
    setPage(0);
  };

  // 1. Lấy vai trò của user trong project để kiểm tra quyền portal
  const fetchMembership = useCallback(async () => {
    setRoleLoading(true);
    try {
      const res = await api.get(`/projects/${projectId}`);
      setProjectRole(res.data?.membership || null);
    } catch (_e) {
      setProjectRole(null);
    } finally {
      setRoleLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembership();
  }, [fetchMembership]);

  const canViewPortal =
    user?.is_system_admin || can(projectRole, "audit.view_project");

  // 2. Tải danh sách audit logs
  const fetchLogs = useCallback(async () => {
    if (!canViewPortal) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (entityFilter) params.set("entity", entityFilter);
      if (actionFilter) params.set("action", actionFilter.trim().toUpperCase());
      if (entityIdFilter) params.set("entity_id", entityIdFilter.trim());
      if (fromDate) params.set("from", new Date(fromDate + "T00:00:00+07:00").toISOString());
      if (toDate) params.set("to", new Date(toDate + "T23:59:59.999+07:00").toISOString());
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await api.get(
        `/projects/${projectId}/audit-logs?${params.toString()}`
      );
      setLogs(res.data?.logs || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      const msg = err?.response?.data?.message || "Không thể tải nhật ký";
      setError(msg);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [
    canViewPortal,
    projectId,
    entityFilter,
    actionFilter,
    entityIdFilter,
    fromDate,
    toDate,
    page,
  ]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleReset = () => {
    setEntityFilter("");
    setActionFilter("");
    setEntityIdFilter("");
    setFromDate("");
    setToDate("");
    setPage(0);
  };

  const totalPages = Math.ceil(total / limit);
  const hasActiveFilter = entityFilter || actionFilter || entityIdFilter || fromDate || toDate;

  if (roleLoading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-emerald-600" />
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  if (!canViewPortal) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="p-12 text-center border-amber-200 bg-amber-50">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Không có quyền truy cập Nhật ký thao tác
          </h2>
          <p className="text-sm text-slate-600">
            Màn hình này chỉ dành cho <strong>Chủ đầu tư</strong> và{" "}
            <strong>Ban quản lý dự án</strong>.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 pb-24 lg:pb-6 gap-6 max-w-[1672px] mx-auto w-full">
        {/* Header */}
      <PageHeroBanner
        icon={<History className="size-6 sm:size-8" />}
        title="Nhật ký thao tác"
        subtitle="Lịch sử các thao tác trên dự án — phiếu nghiệm thu, khoá/mở nhật ký, báo cáo khối lượng. (Dành cho Chủ đầu tư & Ban quản lý.)"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-xs transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </PageHeroBanner>

      {/* Filter bar */}
      <Card className="p-4 sm:p-5 shadow-xs border-slate-200">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-4 border-b border-slate-100 no-scrollbar">
          {CATEGORY_TABS.map((tab) => {
            const isActive =
              tab.entity === ""
                ? entityFilter === ""
                : entityFilter === tab.entity;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setEntityFilter(tab.entity);
                  setPage(0);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-xs font-semibold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Main Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          {/* 1. Hành động */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Hành động
            </label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              className="w-full h-9 border border-slate-200 rounded-md px-2.5 text-xs sm:text-sm bg-white text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            >
              <option value="">— Tất cả hành động —</option>
              <optgroup label="📋 Phiếu nghiệm thu">
                <option value="APPROVE_ACCEPTANCE_VOUCHER">✅ Duyệt phiếu nghiệm thu</option>
                <option value="RETURN_ACCEPTANCE_VOUCHER">↩️ Trả lại phiếu nghiệm thu</option>
                <option value="SUBMIT_ACCEPTANCE_VOUCHER">📤 Gửi duyệt phiếu nghiệm thu</option>
                <option value="CREATE_ACCEPTANCE_VOUCHER">➕ Tạo phiếu nghiệm thu</option>
              </optgroup>
              <optgroup label="📔 Nhật ký & Chốt sổ">
                <option value="LOCK_DIARY">🔒 Khóa sổ nhật ký ngày</option>
                <option value="UNLOCK_DIARY">🔓 Mở khóa sổ nhật ký</option>
                <option value="CREATE_DIARY_ENTRY">📝 Ghi nhật ký thi công</option>
                <option value="UPDATE_DIARY_ENTRY">✏️ Sửa nhật ký</option>
                <option value="DELETE_DIARY_ENTRY">🗑️ Xóa nhật ký</option>
                <option value="UPSERT_DIARY_DAILY_LOG">📋 Cập nhật mục đầu ngày</option>
                <option value="RESOLVE_DIARY_CONFLICT">⚡ Xử lý xung đột nhật ký</option>
              </optgroup>
              <optgroup label="📊 Khối lượng thi công">
                <option value="CREATE_QUANTITY_REPORT">📈 Báo cáo khối lượng</option>
                <option value="CONTRACT_QUANTITY_SET">📌 Gán khối lượng hợp đồng</option>
                <option value="CONTRACT_QUANTITY_CLEAR">❌ Xoá khối lượng hợp đồng</option>
              </optgroup>
              <optgroup label="👥 Dự án & Hệ thống">
                <option value="CREATE_PROJECT">🏗️ Tạo dự án</option>
                <option value="CREATE_INVITATION">✉️ Gửi lời mời</option>
                <option value="LOCK_USER">🚫 Khóa tài khoản</option>
                <option value="UNLOCK_USER">🟢 Mở khóa tài khoản</option>
              </optgroup>
            </select>
          </div>

          {/* 2. Từ ngày */}
          <div>
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Từ ngày
            </label>
            <Input
              type="date"
              aria-label="Từ ngày"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              className="text-xs sm:text-sm h-9"
            />
          </div>

          {/* 3. Đến ngày */}
          <div>
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Đến ngày
            </label>
            <Input
              type="date"
              aria-label="Đến ngày"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              className="text-xs sm:text-sm h-9"
            />
          </div>

          {/* 4. Controls: Nâng cao & Xoá lọc */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="h-9 px-3 text-xs text-slate-600 hover:text-slate-900 border-slate-200"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              {showAdvanced ? "Thu gọn" : "Nâng cao"}
            </Button>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-9 px-2.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Xoá lọc
              </Button>
            )}
          </div>
        </div>

        {/* Quick Date Range Presets */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-400 font-medium">Chọn nhanh:</span>
          <button
            type="button"
            onClick={() => setQuickRange("today")}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer font-medium"
          >
            Hôm nay
          </button>
          <button
            type="button"
            onClick={() => setQuickRange("7days")}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer font-medium"
          >
            7 ngày qua
          </button>
          <button
            type="button"
            onClick={() => setQuickRange("30days")}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer font-medium"
          >
            30 ngày qua
          </button>
          <button
            type="button"
            onClick={() => setQuickRange("this_month")}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer font-medium"
          >
            Tháng này
          </button>
        </div>

        {/* Advanced Collapsible Section */}
        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-xl">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Đối tượng cụ thể (Kỹ thuật)
              </label>
              <select
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full h-9 border border-slate-200 rounded-md px-2.5 text-xs bg-white text-slate-800 outline-none focus:border-emerald-500"
              >
                <option value="">— Tất cả đối tượng —</option>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v} ({k})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                ID đối tượng trong database
              </label>
              <Input
                value={entityIdFilter}
                onChange={(e) => {
                  setEntityIdFilter(e.target.value);
                  setPage(0);
                }}
                placeholder="VD: 102"
                aria-label="ID đối tượng"
                className="text-xs h-9 bg-white"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Table */}
      {loading ? (
        <Card className="p-12 text-center text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-emerald-600" />
          <p>Đang tải nhật ký...</p>
        </Card>
      ) : error ? (
        <Card className="p-8 text-center border-red-200 bg-red-50 text-red-700">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
          <p className="font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchLogs} className="mt-4">
            Thử lại
          </Button>
        </Card>
      ) : logs.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <History className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-700">
            Chưa có sự kiện nào
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {hasActiveFilter
              ? "Không có sự kiện phù hợp bộ lọc."
              : "Các thao tác trên dự án sẽ xuất hiện tại đây."}
          </p>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto bg-white shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
              <tr>
                <th className="py-3 px-4 w-8"></th>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Người thao tác</th>
                <th className="py-3 px-4">Hành động</th>
                <th className="py-3 px-4">Đối tượng</th>
                <th className="py-3 px-4 text-right">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : log.id)
                      }
                    >
                      <td className="py-3 px-4">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">
                          {log.user_name || "(hệ thống)"}
                        </div>
                        {log.user_email && (
                          <div className="text-xs text-slate-500">
                            {log.user_email}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className="bg-blue-50 text-blue-800 border-blue-200"
                          title={log.action}
                        >
                          {actionLabel(log.action)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {entityLabel(log.entity, log.entity_id)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {log.entity_id ?? "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="space-y-3">
                            <OldNewDetails details={log.details} />
                            {log.ip_address && (
                              <div className="text-xs text-slate-500">
                                <strong>IP:</strong> {log.ip_address}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-slate-600">
            Hiển thị {page * limit + 1}–{Math.min((page + 1) * limit, total)} /{" "}
            {total} sự kiện
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Trước
            </Button>
            <span className="text-sm text-slate-600 px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
