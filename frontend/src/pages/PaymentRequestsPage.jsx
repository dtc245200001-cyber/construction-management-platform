import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import api from "../lib/api";
import { can } from "../lib/permissions";
import { toast } from "sonner";
import { formatVND, formatQuantityVN } from "../utils/decimal";
import { formatDateVN } from "../utils/dateVN";
import {
  FileText,
  Calendar,
  AlertCircle,
  ShieldAlert,
  RefreshCw,
  Eye,
  ArrowLeft,
  X,
  Receipt,
  Layers,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Check,
  RotateCcw,
  History,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";

// Ánh xạ trạng thái hiển thị bằng chữ và giao diện trực quan
const STATUS_CONFIG = {
  DRAFT: {
    label: "Bản nháp",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
    icon: Clock,
  },
  APPROVED: {
    label: "Đã duyệt",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  RETURNED: {
    label: "Bị trả lại",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800",
    icon: AlertTriangle,
  },
};

export default function PaymentRequestsPage({ user: propUser } = {}) {
  const { id: urlParamId } = useParams();
  const navigate = useNavigate();
  const projectId = localStorage.getItem("currentProjectId") || "1";

  const outletContext = useOutletContext();
  const user = propUser || outletContext?.user;
  const projectRole = outletContext?.projectRole;

  const isSystemAdmin = Boolean(
    user?.is_system_admin ||
    outletContext?.is_system_admin ||
    projectRole === "system_admin"
  );
  const canCreate = isSystemAdmin || can(projectRole, "payment_request.create");
  const canReview = isSystemAdmin || can(projectRole, "payment.approve");

  // Dialog lập đề nghị thanh toán
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const handleOpenCreateDialog = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    setPeriodStart(`${year}-${month}-01`);
    setPeriodEnd(`${year}-${month}-${day}`);
    setCreateError("");
    setCreateDialogOpen(true);
  };

  const handleCreatePaymentRequest = async (e) => {
    e.preventDefault();
    if (!periodStart || !periodEnd) {
      setCreateError("Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc kỳ thanh toán");
      return;
    }
    if (periodEnd < periodStart) {
      setCreateError("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu");
      return;
    }

    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await api.post(`/projects/${projectId}/payment-requests`, {
        period_start: periodStart,
        period_end: periodEnd,
      });
      toast.success(res.data?.message || "Lập đề nghị thanh toán thành công");
      setCreateDialogOpen(false);
      fetchPaymentRequests();
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Không thể lập đề nghị thanh toán";
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  // Danh sách đề nghị
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Chi tiết đề nghị được chọn
  const [selectedId, setSelectedId] = useState(urlParamId || null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailForbidden, setDetailForbidden] = useState(false);

  // S-44 / T-115: xác nhận duyệt / trả lại
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [returnReason, setReturnReason] = useState("");

  // Tải danh sách đề nghị thanh toán
  const fetchPaymentRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsForbidden(false);

    try {
      const res = await api.get(`/projects/${projectId}/payment-requests`);
      setPaymentRequests(res.data?.payment_requests || []);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        setIsForbidden(true);
        setError("Bạn không đủ quyền xem đề nghị thanh toán của dự án này.");
      } else {
        setError(
          err.response?.data?.message ||
            "Không thể tải danh sách đề nghị thanh toán. Vui lòng thử lại."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Tải chi tiết một đề nghị thanh toán
  const fetchPaymentRequestDetail = useCallback(
    async (id) => {
      if (!id) {
        setDetail(null);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);
      setDetailForbidden(false);

      try {
        const res = await api.get(`/projects/${projectId}/payment-requests/${id}`);
        setDetail(res.data?.payment_request || null);
      } catch (err) {
        const status = err.response?.status;
        if (status === 403) {
          setDetailForbidden(true);
          setDetailError("Bạn không đủ quyền xem chi tiết đề nghị thanh toán này.");
        } else {
          setDetailError(
            err.response?.data?.message ||
              "Không thể tải chi tiết đề nghị thanh toán. Vui lòng thử lại."
          );
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    fetchPaymentRequests();
  }, [fetchPaymentRequests]);

  useEffect(() => {
    if (selectedId) {
      fetchPaymentRequestDetail(selectedId);
    } else {
      setDetail(null);
      setDetailError(null);
    }
  }, [selectedId, fetchPaymentRequestDetail]);

  const handleOpenDetail = (id) => {
    setSelectedId(id);
  };

  const handleCloseDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    if (urlParamId) {
      navigate("/payment-requests");
    }
  };

  const refreshAfterReview = async () => {
    await Promise.all([
      fetchPaymentRequests(),
      selectedId ? fetchPaymentRequestDetail(selectedId) : Promise.resolve(),
    ]);
  };

  const handleOpenApprove = () => {
    if (!detail || detail.status !== "DRAFT" || !canReview) return;
    setReviewError("");
    setApproveDialogOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!detail || reviewLoading) return;
    setReviewLoading(true);
    setReviewError("");
    try {
      const res = await api.post(
        `/projects/${projectId}/payment-requests/${detail.id}/approve`,
        {}
      );
      toast.success(res.data?.message || "Đã duyệt đề nghị thanh toán");
      setApproveDialogOpen(false);
      await refreshAfterReview();
    } catch (err) {
      setReviewError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể duyệt đề nghị thanh toán"
      );
    } finally {
      setReviewLoading(false);
    }
  };

  const handleOpenReturn = () => {
    if (!detail || detail.status !== "DRAFT" || !canReview) return;
    setReturnReason("");
    setReviewError("");
    setReturnDialogOpen(true);
  };

  const handleConfirmReturn = async () => {
    const reason = returnReason.trim();
    if (!reason) {
      setReviewError("Bắt buộc nhập lý do trả lại đề nghị thanh toán");
      return;
    }
    if (!detail || reviewLoading) return;

    setReviewLoading(true);
    setReviewError("");
    try {
      const res = await api.post(
        `/projects/${projectId}/payment-requests/${detail.id}/return`,
        { reason }
      );
      toast.success(res.data?.message || "Đã trả lại đề nghị thanh toán");
      setReturnDialogOpen(false);
      await refreshAfterReview();
    } catch (err) {
      setReviewError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể trả lại đề nghị thanh toán"
      );
    } finally {
      setReviewLoading(false);
    }
  };

  const renderStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || {
      label: status || "Không rõ",
      badgeClass: "bg-slate-100 text-slate-800 border-slate-300",
      icon: Clock,
    };
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.badgeClass}`}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{config.label}</span>
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Tiêu đề trang */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <Receipt className="size-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Đề nghị thanh toán
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Xem danh sách đề nghị thanh toán và bảng tổng hợp khối lượng từ phiếu nghiệm thu
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPaymentRequests}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </Button>

          {canCreate && (
            <Button
              size="sm"
              onClick={handleOpenCreateDialog}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 font-bold"
            >
              <Plus className="size-4" />
              <span>Lập đề nghị thanh toán</span>
            </Button>
          )}
        </div>
      </div>

      {/* ================= TRẠNG THÁI 403: KHÔNG ĐỦ QUYỀN ================= */}
      {isForbidden && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50/80 dark:bg-amber-950/40 p-6 text-amber-900 dark:text-amber-200 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="size-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold">Không đủ quyền truy cập</h2>
              <p className="text-sm mt-1 text-amber-800 dark:text-amber-300">
                Bạn không có quyền xem đề nghị thanh toán của dự án này. Vui lòng liên hệ ban quản lý
                hoặc chủ đầu tư nếu cần cấp quyền.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= TRẠNG THÁI LỖI TẢI (KÈM NÚT THỬ LẠI) ================= */}
      {!isForbidden && error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50/80 dark:bg-rose-950/40 p-6 text-rose-900 dark:text-rose-200 shadow-xs"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="flex items-start gap-3">
              <AlertCircle className="size-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold">Lỗi tải dữ liệu</h2>
                <p className="text-sm mt-1 text-rose-800 dark:text-rose-300">{error}</p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={fetchPaymentRequests}
              className="gap-2 shrink-0"
            >
              <RefreshCw className="size-3.5" />
              <span>Thử lại</span>
            </Button>
          </div>
        </div>
      )}

      {/* ================= TRẠNG THÁI ĐANG TẢI ================= */}
      {loading && (
        <div
          role="status"
          className="flex flex-col items-center justify-center p-12 sm:p-16 rounded-2xl border border-border bg-card shadow-xs"
        >
          <RefreshCw className="size-8 text-primary animate-spin mb-3" />
          <p className="text-sm font-medium text-foreground">
            Đang tải danh sách đề nghị thanh toán...
          </p>
          <p className="text-xs text-muted-foreground mt-1">Vui lòng chờ trong giây lát</p>
        </div>
      )}

      {/* ================= TRẠNG THÁI RỖNG ================= */}
      {!loading && !error && !isForbidden && paymentRequests.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center p-12 sm:p-16 rounded-2xl border border-dashed border-border bg-card shadow-xs">
          <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-4">
            <FileText className="size-7" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-foreground">
            Chưa có đề nghị thanh toán nào
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mt-1">
            Dự án này chưa phát sinh đề nghị thanh toán nào. Đề nghị thanh toán sẽ được lập từ các phiếu
            nghiệm thu khối lượng đã được phê duyệt.
          </p>
          {canCreate && (
            <Button
              onClick={handleOpenCreateDialog}
              className="mt-5 gap-2 font-bold"
            >
              <Plus className="size-4" />
              <span>Lập đề nghị thanh toán ngay</span>
            </Button>
          )}
        </div>
      )}

      {/* ================= DANH SÁCH ĐỀ NGHỊ THANH TOÁN ================= */}
      {!loading && !error && !isForbidden && paymentRequests.length > 0 && (
        <div className="space-y-4">
          {/* Giao diện dạng Thẻ cho Mobile (chiều rộng hẹp khoảng 360px) */}
          <div className="grid grid-cols-1 gap-3.5 sm:hidden">
            {paymentRequests.map((pr) => (
              <Card
                key={pr.id}
                onClick={() => handleOpenDetail(pr.id)}
                className="p-4 rounded-xl border border-border hover:border-primary/50 transition-all cursor-pointer active:scale-[0.99] touch-target"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Đề nghị #{pr.id}
                    </span>
                    <p className="text-sm font-bold text-foreground truncate mt-0.5">
                      Kỳ: {formatDateVN(pr.period_start)} – {formatDateVN(pr.period_end)}
                    </p>
                  </div>
                  <div>{renderStatusBadge(pr.status)}</div>
                </div>

                <div className="mt-3 pt-3 border-t border-border/60 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Tổng cộng:</span>
                    <span className="text-base font-extrabold text-primary">
                      {formatVND(pr.total_amount)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">Ngày tạo:</span>
                    <span className="text-xs text-foreground font-medium">
                      {formatDateVN(pr.created_at)}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Giao diện Bảng cho Tablet / Desktop (kèm cuộn ngang an toàn) */}
          <div className="hidden sm:block rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto min-w-full">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <th scope="col" className="py-3 px-4 w-16">
                      Mã
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Kỳ thanh toán
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Trạng thái
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Tổng cộng
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Ngày tạo
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Người lập
                    </th>
                    <th scope="col" className="py-3 px-4 text-center w-28">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paymentRequests.map((pr) => (
                    <tr
                      key={pr.id}
                      onClick={() => handleOpenDetail(pr.id)}
                      className="hover:bg-accent/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        #{pr.id}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground whitespace-nowrap">
                        {formatDateVN(pr.period_start)} – {formatDateVN(pr.period_end)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(pr.status)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-foreground whitespace-nowrap">
                        {formatVND(pr.total_amount)}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                        {formatDateVN(pr.created_at)}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground truncate max-w-[150px]">
                        {pr.creator_name || "—"}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(pr.id);
                          }}
                          className="h-8 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <Eye className="size-3.5" />
                          <span>Chi tiết</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL XEM CHI TIẾT ĐỀ NGHỊ THANH TOÁN ================= */}
      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) handleCloseDetail();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
          {/* Header Modal */}
          <DialogHeader className="p-4 sm:p-6 border-b border-border bg-card shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <span>Chi tiết đề nghị thanh toán</span>
                  {detail && (
                    <span className="text-primary font-extrabold">#{detail.id}</span>
                  )}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bảng chi tiết các hạng mục nghiệm thu trong kỳ và thành tiền tương ứng
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Thân Modal */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {detailLoading && (
              <div
                role="status"
                className="flex flex-col items-center justify-center p-12 text-center"
              >
                <RefreshCw className="size-7 text-primary animate-spin mb-3" />
                <p className="text-sm font-medium text-foreground">
                  Đang tải chi tiết đề nghị thanh toán...
                </p>
              </div>
            )}

            {!detailLoading && detailForbidden && (
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-900"
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert className="size-5 text-amber-600 shrink-0" />
                  <p className="text-sm font-medium">{detailError}</p>
                </div>
              </div>
            )}

            {!detailLoading && !detailForbidden && detailError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-rose-900 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="size-5 text-rose-600 shrink-0" />
                  <p className="text-sm font-medium">{detailError}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPaymentRequestDetail(selectedId)}
                  className="gap-2 shrink-0"
                >
                  <RefreshCw className="size-3.5" />
                  <span>Thử lại</span>
                </Button>
              </div>
            )}

            {!detailLoading && detail && (
              <div className="space-y-6">
                {/* 1. Phần đầu: Kỳ, Trạng thái, Tổng cộng và thông tin chung */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-4 rounded-xl border border-border bg-muted/20">
                  {/* Kỳ thanh toán */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="size-3.5" /> Kỳ đề nghị
                    </span>
                    <p className="text-sm sm:text-base font-bold text-foreground">
                      {formatDateVN(detail.period_start)} – {formatDateVN(detail.period_end)}
                    </p>
                  </div>

                  {/* Trạng thái */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Clock className="size-3.5" /> Trạng thái
                    </span>
                    <div>{renderStatusBadge(detail.status)}</div>
                  </div>

                  {/* Tổng cộng đề nghị */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Receipt className="size-3.5" /> Tổng cộng đề nghị
                    </span>
                    <p
                      data-testid="detail-total-amount"
                      className="text-lg sm:text-xl font-extrabold text-primary tracking-tight"
                    >
                      {formatVND(detail.total_amount)}
                    </p>
                  </div>
                </div>

                {/* Thông tin bổ sung */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground px-1">
                  <div className="flex items-center gap-1.5">
                    <User className="size-3.5" />
                    <span>Người lập: </span>
                    <strong className="text-foreground font-semibold">
                      {detail.creator_name || "—"}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    <span>Ngày lập: </span>
                    <strong className="text-foreground font-semibold">
                      {formatDateVN(detail.created_at)}
                    </strong>
                  </div>
                  {detail.acceptances && (
                    <div className="flex items-center gap-1.5">
                      <Layers className="size-3.5" />
                      <span>Số phiếu nghiệm thu: </span>
                      <strong className="text-foreground font-semibold">
                        {detail.acceptances.length}
                      </strong>
                    </div>
                  )}
                </div>

                {/* S-44 / T-115: thông tin duyệt/trả lại và lịch sử trạng thái */}
                {(detail.reviewed_at || detail.return_reason) && (
                  <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-sm">
                    {detail.reviewed_at && (
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        <span className="text-muted-foreground">Người thao tác:</span>
                        <strong>{detail.reviewer_name || `#${detail.reviewed_by}`}</strong>
                        <span className="text-muted-foreground">·</span>
                        <span>{formatDateVN(detail.reviewed_at)}</span>
                      </div>
                    )}
                    {detail.status === "RETURNED" && detail.return_reason && (
                      <div className="text-rose-700">
                        <strong>Lý do trả lại:</strong> {detail.return_reason}
                      </div>
                    )}
                    {detail.status === "APPROVED" && (
                      <div className="text-emerald-700 font-medium">
                        Đề nghị đã duyệt được khóa; không còn thao tác chỉnh sửa hoặc đổi trạng thái.
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <History className="size-4 text-primary" />
                    Lịch sử trạng thái
                  </h3>
                  <div className="rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
                    {detail.history?.length ? (
                      detail.history.map((item) => (
                        <div key={item.id} className="p-3 flex items-start justify-between gap-4 text-xs">
                          <div>
                            <div className="font-semibold text-foreground">
                              {item.action === "CREATED"
                                ? "Lập đề nghị"
                                : item.action === "APPROVED"
                                  ? "Duyệt đề nghị"
                                  : "Trả lại đề nghị"}
                            </div>
                            <div className="text-muted-foreground mt-0.5">
                              {item.acted_by_name || `#${item.acted_by}`}
                              {item.reason ? ` · Lý do: ${item.reason}` : ""}
                            </div>
                          </div>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {formatDateVN(item.acted_at)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-muted-foreground italic">
                        Chưa có lịch sử trạng thái.
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Bảng dòng: Hạng mục, Khối lượng đợt, Đơn giá, Thành tiền + Hàng Tổng cộng */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>Bảng chi tiết các dòng thanh toán</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      ({detail.lines?.length || 0} dòng)
                    </span>
                  </h3>

                  {/* Dạng thẻ cho Mobile hẹp ~360px */}
                  <div className="grid grid-cols-1 gap-3 sm:hidden">
                    {detail.lines && detail.lines.length > 0 ? (
                      detail.lines.map((line, idx) => (
                        <Card
                          key={line.id || idx}
                          className="p-3.5 rounded-xl border border-border bg-card space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-bold text-muted-foreground">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-bold text-primary">
                              {formatVND(line.amount)}
                            </span>
                          </div>

                          <div>
                            <span className="text-xs font-semibold text-foreground block">
                              {line.work_item_code ? `[${line.work_item_code}] ` : ""}
                              {line.work_item_name}
                            </span>
                            {line.acceptance_batch_name && (
                              <span className="text-[11px] text-muted-foreground block mt-0.5">
                                Đợt: {line.acceptance_batch_name}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                            <div>
                              <span className="text-[10px] text-muted-foreground block">
                                Khối lượng đợt ({line.unit || "ĐVT"}):
                              </span>
                              <span className="font-semibold text-foreground">
                                {formatQuantityVN(line.quantity)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-muted-foreground block">Đơn giá:</span>
                              <span className="font-semibold text-foreground">
                                {formatVND(line.unit_price)}
                              </span>
                            </div>
                          </div>
                        </Card>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground italic p-4 text-center">
                        Không có dòng chi tiết nào
                      </p>
                    )}

                    {/* Hàng tổng cộng trên Mobile */}
                    <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase">Tổng cộng:</span>
                      <span
                        data-testid="mobile-detail-total-amount"
                        className="text-base font-extrabold text-primary"
                      >
                        {formatVND(detail.total_amount)}
                      </span>
                    </div>
                  </div>

                  {/* Dạng Bảng cho Tablet / Desktop (cuộn ngang khi màn hình co lại) */}
                  <div className="hidden sm:block rounded-xl border border-border bg-card overflow-hidden">
                    <div className="overflow-x-auto min-w-full">
                      <table className="w-full text-left text-xs sm:text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                            <th scope="col" className="py-2.5 px-3 w-12 text-center">
                              STT
                            </th>
                            <th scope="col" className="py-2.5 px-3">
                              Hạng mục
                            </th>
                            <th scope="col" className="py-2.5 px-3">
                              Đợt nghiệm thu
                            </th>
                            <th scope="col" className="py-2.5 px-3 text-right">
                              Khối lượng đợt
                            </th>
                            <th scope="col" className="py-2.5 px-3 text-right">
                              Đơn giá
                            </th>
                            <th scope="col" className="py-2.5 px-3 text-right">
                              Thành tiền
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {detail.lines && detail.lines.length > 0 ? (
                            detail.lines.map((line, idx) => (
                              <tr key={line.id || idx} className="hover:bg-accent/20">
                                <td className="py-2.5 px-3 text-center text-muted-foreground">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-medium text-foreground">
                                    {line.work_item_code ? (
                                      <span className="font-semibold text-primary mr-1">
                                        [{line.work_item_code}]
                                      </span>
                                    ) : null}
                                    {line.work_item_name}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    ĐVT: {line.unit || "—"}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                                  {line.acceptance_batch_name || `#${line.acceptance_id}`}
                                </td>
                                <td className="py-2.5 px-3 text-right font-medium text-foreground whitespace-nowrap">
                                  {formatQuantityVN(line.quantity)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-medium text-foreground whitespace-nowrap">
                                  {formatVND(line.unit_price)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-foreground whitespace-nowrap">
                                  {formatVND(line.amount)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-6 text-center text-xs text-muted-foreground italic"
                              >
                                Không có dòng chi tiết nào
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/30 font-bold text-foreground">
                            <td colSpan={5} className="py-3 px-3 text-right uppercase tracking-wider text-xs">
                              Tổng cộng:
                            </td>
                            <td
                              data-testid="table-detail-total-amount"
                              className="py-3 px-3 text-right text-sm sm:text-base font-extrabold text-primary whitespace-nowrap"
                            >
                              {formatVND(detail.total_amount)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* S-44 / T-115: chỉ Chủ đầu tư được thao tác khi đề nghị còn DRAFT. */}
          <div className="p-4 border-t border-border bg-card flex flex-wrap justify-end gap-2 shrink-0">
            <Button variant="outline" onClick={handleCloseDetail}>
              Đóng
            </Button>
            {detail?.status === "DRAFT" && canReview && (
              <>
                <Button
                  variant="outline"
                  onClick={handleOpenReturn}
                  className="text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <RotateCcw className="size-4 mr-1.5" />
                  Trả lại
                </Button>
                <Button
                  onClick={handleOpenApprove}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="size-4 mr-1.5" />
                  Duyệt
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ================= XÁC NHẬN DUYỆT ================= */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận duyệt đề nghị thanh toán</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Bạn đang duyệt đề nghị <strong>#{detail?.id}</strong>. Sau khi duyệt,
              đề nghị sẽ bị khóa và không thể chỉnh sửa hoặc trả lại.
            </p>
            {reviewError && (
              <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
                {reviewError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveDialogOpen(false)}
              disabled={reviewLoading}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleConfirmApprove}
              disabled={reviewLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {reviewLoading ? "Đang duyệt..." : "Xác nhận duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= TRẢ LẠI ĐỀ NGHỊ ================= */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trả lại đề nghị thanh toán</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="payment-return-reason">
                Lý do trả lại <span className="text-rose-600">*</span>
              </Label>
              <textarea
                id="payment-return-reason"
                aria-label="Lý do trả lại"
                rows={4}
                maxLength={2000}
                value={returnReason}
                onChange={(e) => {
                  setReturnReason(e.target.value);
                  if (reviewError) setReviewError("");
                }}
                placeholder="Nhập lý do để Ban quản lý biết nội dung cần xử lý..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {reviewError && (
              <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm">
                {reviewError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReturnDialogOpen(false)}
              disabled={reviewLoading}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleConfirmReturn}
              disabled={reviewLoading}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {reviewLoading ? "Đang trả lại..." : "Xác nhận trả lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL LẬP ĐỀ NGHỊ THANH TOÁN ================= */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              <span>Lập đề nghị thanh toán mới</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreatePaymentRequest} className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Hệ thống sẽ tự động quét và tập hợp các phiếu nghiệm thu khối lượng đã được phê duyệt trong kỳ để tổng hợp khối lượng và thành tiền.
            </p>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs" role="alert">
                {createError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="period_start">Kỳ thanh toán: Từ ngày</Label>
              <Input
                id="period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="period_end">Đến ngày</Label>
              <Input
                id="period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createLoading}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={createLoading}
                className="gap-2 font-bold"
              >
                {createLoading && <RefreshCw className="size-3.5 animate-spin" />}
                <span>Tạo đề nghị thanh toán</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
