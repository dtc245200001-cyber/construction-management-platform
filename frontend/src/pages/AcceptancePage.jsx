import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../lib/api";
import { can } from "../lib/permissions";
import {
  formatQuantityVN,
  normalizeDecimalInput,
  subtractQuantities,
} from "../utils/decimal";
import {
  CheckSquare,
  Plus,
  Eye,
  AlertTriangle,
  FileText,
  Camera,
  UploadCloud,
  X,
  Check,
  AlertCircle,
  Calendar,
  User,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Info,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import PhotoMetadataPanel from "../components/PhotoMetadataPanel";

const ALLOWED_PHOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic"];
const MAX_PHOTO_SIZE_MB = 10;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;

export default function AcceptancePage({ user: propUser } = {}) {
  const projectId = localStorage.getItem("currentProjectId") || 1;

  let outletContext = null;
  try {
    outletContext = useOutletContext();
  } catch {
    outletContext = null;
  }
  const user = propUser || outletContext?.user;

  // Quyền truy cập
  const [projectRole, setProjectRole] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const isSystemAdmin = Boolean(
    user?.is_system_admin ||
    outletContext?.is_system_admin ||
    projectRole === "system_admin"
  );
  const hasAccess = isSystemAdmin || can(projectRole, "acceptance.access");
  const isSupervisor = isSystemAdmin || can(projectRole, "acceptance.create_dossier");
  const isInvestor = isSystemAdmin || can(projectRole, "acceptance.approve_official");
  const canApprove = isInvestor;
  const canReturn = isSystemAdmin || can(projectRole, "acceptance.return_official");

  // Dữ liệu danh sách phiếu
  const [vouchers, setVouchers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Dữ liệu hạng mục lá để lập phiếu
  const [leafItems, setLeafItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Dialog lập phiếu mới
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [batchName, setBatchName] = useState("");
  // itemInputs: { [workItemId]: { selected: boolean, cumulative: string, error: string } }
  const [itemInputs, setItemInputs] = useState({});
  // photos: Array<{ file: File, previewUrl: string, caption: string, error: string }>
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [savedVoucherId, setSavedVoucherId] = useState(null);

  // Dialog xem chi tiết
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewingVoucher, setViewingVoucher] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Quản lý modal ảnh theo máy trạng thái rõ ràng: 'closed' | 'detail' | 'preview'
  // Đảm bảo tại một thời điểm chỉ mở tối đa 1 modal ảnh (không chồng lấn nhiều overlay)
  const [photoModal, setPhotoModal] = useState({
    status: "closed", // 'closed' | 'detail' | 'preview'
    photo: null,
  });

  const handleOpenPhotoDetail = (photo) => {
    setPhotoModal({
      status: "detail",
      photo: {
        ...photo,
        project_id: viewingVoucher?.voucher?.project_id || projectId,
        kind: "acceptance",
        batch_name: viewingVoucher?.voucher?.batch_name,
        uploaded_by_name: viewingVoucher?.voucher?.created_by_name,
      },
    });
  };

  const handleOpenPhotoPreview = (photo) => {
    setPhotoModal({
      status: "preview",
      photo: {
        ...photo,
        project_id: viewingVoucher?.voucher?.project_id || projectId,
        kind: "acceptance",
        batch_name: viewingVoucher?.voucher?.batch_name,
        uploaded_by_name: viewingVoucher?.voucher?.created_by_name,
      },
    });
  };

  const handleClosePhotoModal = () => {
    setPhotoModal({
      status: "closed",
      photo: null,
    });
  };

  // S-39: dialog lịch sử phiếu + dialog trả lại (reason)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyVoucherId, setHistoryVoucherId] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveError, setApproveError] = useState("");

  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState(null); // voucher being returned
  const [returnReason, setReturnReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const canReviewInternal = isInvestor || isSystemAdmin;
  const pendingReviewVouchers = vouchers.filter((v) => v.status === "pending_review");
  const [reviewError, setReviewError] = useState("");

  // 1. Tải vai trò trong dự án
  const fetchMembership = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setProjectRole(res.data?.membership || null);
    } catch (_err) {
      setProjectRole(null);
    } finally {
      setMembershipLoading(false);
    }
  }, [projectId]);

  // 2. Tải danh sách phiếu nghiệm thu
  const fetchVouchers = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await api.get(`/projects/${projectId}/acceptance-vouchers`);
      setVouchers(res.data?.vouchers || []);
    } catch (err) {
      const msg =
        err?.response?.data?.message || "Không thể tải danh sách phiếu nghiệm thu";
      setListError(msg);
    } finally {
      setLoadingList(false);
    }
  }, [projectId]);

  // 3. Tải danh sách hạng mục lá kèm luỹ kế đã duyệt và đội báo
  const fetchLeafItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await api.get(
        `/projects/${projectId}/acceptance-vouchers/items-summary`
      );
      const items = res.data?.items || [];
      setLeafItems(items);

      // Khởi tạo form inputs
      const initialMap = {};
      items.forEach((item) => {
        initialMap[item.id] = {
          selected: false,
          cumulative: "",
          error: "",
        };
      });
      setItemInputs(initialMap);
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Không thể tải danh sách hạng mục công việc"
      );
    } finally {
      setLoadingItems(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembership();
  }, [fetchMembership]);

  useEffect(() => {
    if (membershipLoading) return;
    if (hasAccess) {
      fetchVouchers();
    } else {
      setVouchers([]);
      setLoadingList(false);
    }
  }, [fetchVouchers, hasAccess, membershipLoading]);

  // Mở modal tạo phiếu mới
  const handleOpenCreateModal = () => {
    setBatchName("");
    setSelectedPhotos([]);
    setSubmitError("");
    setSavedVoucherId(null);
    fetchLeafItems();
    setCreateDialogOpen(true);
  };

  // Thay đổi input luỹ kế của một hạng mục
  const handleCumulativeChange = (workItemId, val) => {
    setItemInputs((prev) => {
      const cur = prev[workItemId] || { selected: false, cumulative: "", error: "" };
      let error = "";
      if (val.trim() !== "") {
        const check = normalizeDecimalInput(val, {
          maxIntDigits: 11,
          maxScale: 3,
          fieldName: "Luỹ kế",
        });
        if (!check.ok) {
          error = check.error;
        }
      }
      return {
        ...prev,
        [workItemId]: {
          ...cur,
          cumulative: val,
          error,
          selected: val.trim() !== "" ? true : cur.selected,
        },
      };
    });
  };

  // Bật/tắt chọn hạng mục
  const handleToggleSelect = (workItemId) => {
    setItemInputs((prev) => {
      const cur = prev[workItemId] || { selected: false, cumulative: "", error: "" };
      return {
        ...prev,
        [workItemId]: {
          ...cur,
          selected: !cur.selected,
        },
      };
    });
  };

  // Chọn toàn bộ hạng mục lá
  const handleSelectAll = (select) => {
    setItemInputs((prev) => {
      const next = { ...prev };
      leafItems.forEach((it) => {
        next[it.id] = {
          ...(next[it.id] || { cumulative: "", error: "" }),
          selected: select,
        };
      });
      return next;
    });
  };

  // Xử lý chọn ảnh đính kèm
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = [];
    for (const file of files) {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      let error = "";

      if (!ALLOWED_PHOTO_EXTS.includes(ext)) {
        error = `Định dạng ${ext} không hợp lệ. Chỉ chấp nhận: JPEG, PNG, WebP, HEIC.`;
      } else if (file.size > MAX_PHOTO_SIZE_BYTES) {
        error = `Dung lượng ${(file.size / (1024 * 1024)).toFixed(1)}MB vượt quá giới hạn ${MAX_PHOTO_SIZE_MB}MB.`;
      }

      const previewUrl = URL.createObjectURL(file);
      newPhotos.push({
        file,
        previewUrl,
        caption: "",
        error,
        inspection: null,
      });
    }

    setSelectedPhotos((prev) => [...prev, ...newPhotos]);
    // Reset file input
    e.target.value = "";
  };

  // Xoá ảnh khỏi danh sách
  const handleRemovePhoto = (index) => {
    setSelectedPhotos((prev) => {
      const target = prev[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  // Cập nhật chú thích ảnh
  const handlePhotoCaptionChange = (index, caption) => {
    setSelectedPhotos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], caption };
      return next;
    });
  };

  // Thu hồi Object URLs khi đóng modal
  useEffect(() => {
    return () => {
      selectedPhotos.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, [selectedPhotos]);

  // Tính toán tóm tắt các hạng mục được chọn
  const computedSummary = useMemo(() => {
    const selectedList = [];
    let hasAnyNegative = false;
    let hasValidationError = false;

    leafItems.forEach((item) => {
      const state = itemInputs[item.id];
      if (state && state.selected) {
        const val = state.cumulative.trim();
        if (val === "" || state.error) {
          hasValidationError = true;
        }

        const normalized = normalizeDecimalInput(val || "0", {
          maxIntDigits: 11,
          maxScale: 3,
          fieldName: "Luỹ kế",
        });

        const cumVal = normalized.ok ? normalized.value : "0";
        const calc = subtractQuantities(cumVal, item.prev_approved_cumulative);

        if (calc.isNegative) {
          hasAnyNegative = true;
        }

        selectedList.push({
          item,
          cumulative: val,
          prevApproved: item.prev_approved_cumulative,
          delta: calc.delta,
          isNegative: calc.isNegative,
          formattedDelta: calc.formatted,
          teamReported: item.team_reported_quantity,
          hasError: Boolean(state.error) || val === "",
        });
      }
    });

    return {
      selectedList,
      count: selectedList.length,
      hasAnyNegative,
      hasValidationError,
    };
  }, [leafItems, itemInputs]);

  // Submit tạo phiếu nghiệm thu
  const handleCreateVoucher = async () => {
    if (!isSupervisor || savedVoucherId) return;
    setSubmitError("");

    if (!batchName.trim()) {
      setSubmitError("Vui lòng nhập tên đợt nghiệm thu");
      return;
    }

    if (computedSummary.count === 0) {
      setSubmitError("Vui lòng chọn ít nhất 1 hạng mục để lập phiếu nghiệm thu");
      return;
    }

    if (computedSummary.hasValidationError) {
      setSubmitError("Một số hạng mục đã chọn có giá trị luỹ kế chưa hợp lệ");
      return;
    }

    // Kiểm tra ảnh có lỗi định dạng/dung lượng không
    const invalidPhoto = selectedPhotos.find((p) => p.error);
    if (invalidPhoto) {
      setSubmitError(`Ảnh "${invalidPhoto.file.name}" không hợp lệ: ${invalidPhoto.error}`);
      return;
    }

    const payloadItems = computedSummary.selectedList.map((row) => ({
      work_item_id: row.item.id,
      cumulative_quantity: row.cumulative.replace(",", "."),
    }));

    setSubmitting(true);
    let createdVoucherId = null;
    try {
      // 1. Tạo phiếu
      const createRes = await api.post(
        `/projects/${projectId}/acceptance-vouchers`,
        {
          batch_name: batchName.trim(),
          items: payloadItems,
        }
      );

      const voucherId = createRes.data?.voucher?.id;
      createdVoucherId = voucherId;
      setSavedVoucherId(voucherId || null);
      const warnings = createRes.data?.warnings || [];

      // 2. Upload ảnh đính kèm nếu có
      if (selectedPhotos.length > 0 && voucherId) {
        for (const [photoIndex, photoItem] of selectedPhotos.entries()) {
          const formData = new FormData();
          formData.append("photo", photoItem.file);
          if (photoItem.caption) {
            formData.append("caption", photoItem.caption);
          }
          const uploadRes = await api.post(
            `/projects/${projectId}/acceptance-vouchers/${voucherId}/photos`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          setSelectedPhotos((previous) =>
            previous.map((selectedPhoto, index) =>
              index === photoIndex
                ? { ...selectedPhoto, inspection: uploadRes.data?.inspection || null }
                : selectedPhoto
            )
          );
        }
      }

      if (warnings.length > 0) {
        toast.warning(warnings[0].message, { duration: 6000 });
      } else {
        toast.success("Tạo phiếu nghiệm thu nháp thành công!");
      }

      fetchVouchers();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        "Lỗi trong quá trình tạo phiếu nghiệm thu";
      setSubmitError(msg);
      toast.error(msg);
      if (createdVoucherId) fetchVouchers();
    } finally {
      setSubmitting(false);
    }
  };

  // Mở modal xem chi tiết phiếu
  const handleViewDetail = async (voucherId) => {
    setDetailDialogOpen(true);
    setDetailLoading(true);
    setViewingVoucher(null);
    try {
      const res = await api.get(
        `/projects/${projectId}/acceptance-vouchers/${voucherId}`
      );
      setViewingVoucher(res.data);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Không thể tải chi tiết phiếu nghiệm thu"
      );
    } finally {
      setDetailLoading(false);
    }
  };

  // S-39: mở dialog lịch sử phiếu
  const handleViewHistory = async (voucherId) => {
    setHistoryVoucherId(voucherId);
    setHistoryDialogOpen(true);
    setHistoryLoading(true);
    setHistoryLogs([]);
    try {
      const res = await api.get(
        `/projects/${projectId}/acceptance-vouchers/${voucherId}/history`
      );
      setHistoryLogs(res.data?.logs || []);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Không thể tải lịch sử phiếu"
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  // S-39: gửi duyệt (draft/returned → pending_review)
  const handleSubmit = async (voucher) => {
    if (!window.confirm(`Gửi duyệt phiếu "${voucher.batch_name}"?`)) return;
    setActionLoading(true);
    try {
      await api.post(
        `/projects/${projectId}/acceptance-vouchers/${voucher.id}/submit`
      );
      toast.success("Đã gửi phiếu lên Chủ đầu tư để duyệt");
      fetchVouchers();
    } catch (err) {
      const msg = err?.response?.data?.message || "Không thể gửi duyệt phiếu";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // S-38 / T-98: mở hộp xác nhận duyệt trong giao diện (không dùng window.confirm).
  const handleApprove = (voucher) => {
    if (!canApprove || actionLoading) return;
    setApproveError("");
    const targetWithFlags =
      viewingVoucher?.voucher?.id === voucher.id && viewingVoucher?.photo_flags
        ? { ...voucher, photo_flags: viewingVoucher.photo_flags }
        : voucher;
    setApproveTarget(targetWithFlags);
    setApproveDialogOpen(true);
  };

  // Chỉ thực thi API sau khi Chủ đầu tư bấm "Xác nhận duyệt" trong dialog.
  const handleConfirmApprove = async () => {
    if (!approveTarget || !canApprove || actionLoading) return;

    setActionLoading(true);
    setApproveError("");
    try {
      const res = await api.post(
        `/projects/${projectId}/acceptance-vouchers/${approveTarget.id}/approve`,
        {}
      );

      const approvedVoucher = res?.data?.voucher;
      setVouchers((current) =>
        current.map((voucher) =>
          voucher.id === approveTarget.id
            ? { ...voucher, ...approvedVoucher, status: "approved" }
            : voucher
        )
      );

      toast.success(res?.data?.message || "Đã duyệt phiếu nghiệm thu");
      setApproveDialogOpen(false);
      setApproveTarget(null);
      await fetchVouchers();
    } catch (err) {
      const status = err?.response?.status;
      const detail =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Không thể duyệt phiếu";
      const msg = status ? `Duyệt phiếu thất bại (${status}): ${detail}` : detail;
      setApproveError(msg);
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // S-39: mở dialog trả lại phiếu (bắt buộc lý do)
  const handleOpenReturn = (voucher) => {
    setReviewError("");
    setReturnTarget(voucher);
    setReturnReason("");
    setReturnDialogOpen(true);
  };

  const handleConfirmReturn = async () => {
    if (!returnReason.trim()) {
      setReviewError("Bắt buộc nhập lý do trả lại phiếu");
      return;
    }
    if (!returnTarget || !canReturn || actionLoading) return;
    setActionLoading(true);
    try {
      await api.post(
        `/projects/${projectId}/acceptance-vouchers/${returnTarget.id}/return`,
        { reason: returnReason.trim() }
      );
      toast.success("Đã trả lại phiếu cho Kỹ sư giám sát");
      setReturnDialogOpen(false);
      setReturnTarget(null);
      fetchVouchers();
    } catch (err) {
      const msg = err?.response?.data?.message || "Không thể trả lại phiếu";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Lọc phiếu theo từ khoá tìm kiếm
  const filteredVouchers = vouchers.filter((v) =>
    (v.batch_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (membershipLoading) {
    return (
      <div className="p-6 text-center text-slate-500">
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6 text-center text-rose-700" role="alert">
        Bạn không có quyền truy cập chức năng nghiệm thu khối lượng trong dự án này.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-7 w-7 text-emerald-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Nghiệm thu khối lượng đợt
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Lập phiếu nghiệm thu, tự động tính khối lượng đợt từ luỹ kế và đối chiếu với khối lượng đội thi công báo cáo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVouchers}
            disabled={loadingList}
            className="flex-1 sm:flex-initial min-h-[44px] flex items-center justify-center gap-1.5 touch-target"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`}
            />
            Làm mới
          </Button>

          {isSupervisor && (
            <Button
              onClick={handleOpenCreateModal}
              className="w-full sm:w-auto min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 font-bold touch-target shadow-sm"
            >
              <Plus className="h-5 w-5" />
              Lập phiếu nghiệm thu
            </Button>
          )}
        </div>
      </div>

      {canReviewInternal && (
        <Card className="border-blue-200 bg-blue-50/40 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-blue-700" />
                Phiếu chờ duyệt
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Chủ đầu tư xem bằng chứng, duyệt hoặc trả lại phiếu đang chờ duyệt.
              </p>
            </div>
            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
              {pendingReviewVouchers.length} phiếu
            </Badge>
          </div>

          {pendingReviewVouchers.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">Không có phiếu nào đang chờ duyệt.</p>
          ) : (
            <div className="space-y-2">
              {pendingReviewVouchers.map((voucher) => (
                <div
                  key={`review-${voucher.id}`}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 truncate">
                      #{voucher.id} · {voucher.batch_name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Người lập: {voucher.created_by_name || "—"} · {voucher.item_count || 0} hạng mục
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetail(voucher.id)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Chi tiết
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleOpenReturn(voucher)}
                      className="text-rose-700 border-rose-200 hover:bg-rose-50"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Trả lại
                    </Button>
                    {canApprove && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => handleApprove(voucher)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Duyệt
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── THANH TÌM KIẾM & THỐNG KÊ ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Tìm theo tên đợt nghiệm thu..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 min-h-[44px] text-[15px]"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-medium">Tổng cộng:</span>
          <Badge variant="secondary" className="font-semibold">
            {vouchers.length} phiếu
          </Badge>
          {vouchers.filter((v) => v.has_negative_delta).length > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              {vouchers.filter((v) => v.has_negative_delta).length} có đợt âm
            </Badge>
          )}
        </div>
      </div>

      {/* ── DANH SÁCH PHIẾU NGHIỆM THU ── */}
      {loadingList ? (
        <Card className="p-12 text-center text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-emerald-600" />
          <p>Đang tải danh sách phiếu nghiệm thu...</p>
        </Card>
      ) : listError ? (
        <Card className="p-8 text-center border-red-200 bg-red-50 text-red-700">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
          <p className="font-medium">{listError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVouchers}
            className="mt-4 min-h-[44px] touch-target"
          >
            Thử lại
          </Button>
        </Card>
      ) : filteredVouchers.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-700">
            {searchTerm
              ? "Không tìm thấy phiếu phù hợp"
              : "Chưa có phiếu nghiệm thu nào"}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {searchTerm
              ? "Thử tìm kiếm với từ khoá khác."
              : isSupervisor
              ? "Bấm nút 'Lập phiếu nghiệm thu' ở trên để tạo phiếu nghiệm thu khối lượng đầu tiên."
              : "Hiện chưa có phiếu nghiệm thu nào được tạo trong dự án này."}
          </p>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto bg-white shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
              <tr>
                <th className="py-3 px-4">Mã</th>
                <th className="py-3 px-4">Tên đợt nghiệm thu</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">Đợt âm</th>
                <th className="py-3 px-4 text-center">Hạng mục</th>
                <th className="py-3 px-4 text-center">Ảnh</th>
                <th className="py-3 px-4">Người lập</th>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-800">
              {filteredVouchers.map((v) => {
                const isNegative = v.has_negative_delta;
                return (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-600">
                      #{v.id}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {v.batch_name}
                    </td>
                    <td className="py-3 px-4">
                      {v.status === "draft" && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700">
                          Bản nháp
                        </Badge>
                      )}
                      {v.status === "pending_review" && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                          Chờ duyệt
                        </Badge>
                      )}
                      {v.status === "approved" && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          Đã duyệt
                        </Badge>
                      )}
                      {v.status === "returned" && (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-200">
                          Bị trả lại
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isNegative ? (
                        <Badge
                          variant="destructive"
                          className="bg-rose-100 text-rose-800 border-rose-300 font-normal gap-1"
                        >
                          <AlertTriangle className="h-3 w-3 text-rose-600" />
                          Có đợt âm
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">Không</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-medium">
                      {v.item_count}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {v.photo_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <Camera className="h-3.5 w-3.5 text-slate-400" />
                          {v.photo_count}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span>{v.created_by_name || "—"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(v.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(v.id)}
                          className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 h-8 px-2.5"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Chi tiết
                        </Button>

                        {/* S-39: Gửi duyệt (KSGS, chỉ draft/returned) */}
                        {isSupervisor &&
                          (v.status === "draft" || v.status === "returned") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSubmit(v)}
                              disabled={actionLoading || v.has_negative_delta}
                              title={
                                v.has_negative_delta
                                  ? "Phiếu có khối lượng âm — không thể gửi duyệt"
                                  : "Gửi phiếu lên Chủ đầu tư"
                              }
                              className="h-8 px-2.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                            >
                              Gửi duyệt
                            </Button>
                          )}

                        {/* S-38 / T-98: Duyệt (CĐT, pending_review) */}
                        {canApprove && v.status === "pending_review" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(v)}
                            disabled={actionLoading}
                            className="h-8 px-2.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Duyệt
                          </Button>
                        )}

                        {/* S-39: Trả lại (CĐT, pending_review) */}
                        {canReturn && v.status === "pending_review" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenReturn(v)}
                            disabled={actionLoading}
                            className="h-8 px-2.5 text-rose-700 border-rose-200 hover:bg-rose-50"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Trả lại
                          </Button>
                        )}

                        {/* S-39: Lịch sử phiếu */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewHistory(v.id)}
                          className="text-slate-600 hover:text-slate-800 h-8 px-2"
                          title="Lịch sử thao tác trên phiếu"
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── DIALOG: LẬP PHIẾU NGHIỆM THU MỚI ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-slate-900">
              <CheckSquare className="h-5 w-5 text-emerald-600" />
              Lập phiếu nghiệm thu khối lượng đợt
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Tên đợt */}
            <div className="space-y-2">
              <Label htmlFor="batchName" className="font-semibold text-slate-800">
                Tên đợt nghiệm thu <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="batchName"
                placeholder="Ví dụ: Nghiệm thu đợt 3 - Khối móng & Tầng trệt"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                maxLength={200}
                className="font-medium"
              />
              <p className="text-xs text-slate-500">
                Nhập tên đợt rõ ràng để dễ dàng đối chiếu khi làm hồ sơ thanh toán.
              </p>
            </div>

            {/* Bảng hạng mục lá */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <Label className="font-semibold text-slate-800">
                    Chọn hạng mục thi công & Nhập luỹ kế đợt
                  </Label>
                  <p className="text-xs text-slate-500">
                    Chỉ hạng mục lá (không có hạng mục con) mới được nghiệm thu.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAll(true)}
                    className="h-7 text-xs"
                  >
                    Chọn tất cả
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAll(false)}
                    className="h-7 text-xs"
                  >
                    Bỏ chọn
                  </Button>
                </div>
              </div>

              {loadingItems ? (
                <div className="p-8 text-center text-slate-500 border rounded-lg">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-emerald-600" />
                  Đang tải danh sách hạng mục...
                </div>
              ) : leafItems.length === 0 ? (
                <div className="p-6 text-center text-slate-500 border rounded-lg bg-slate-50">
                  Dự án này chưa có hạng mục lá nào. Vui lòng thiết lập WBS trước.
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto max-h-[360px] relative">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">Chọn</th>
                        <th className="py-2.5 px-3">Hạng mục (Lá)</th>
                        <th className="py-2.5 px-2 text-center">ĐVT</th>
                        <th className="py-2.5 px-3 text-right">LK Đã duyệt</th>
                        <th className="py-2.5 px-3 text-right text-indigo-700">
                          Đội báo (S-26)
                        </th>
                        <th className="py-2.5 px-3 w-36">
                          Luỹ kế mới <span className="text-rose-500">*</span>
                        </th>
                        <th className="py-2.5 px-3 text-right font-bold">
                          Đợt tự tính
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-800">
                      {leafItems.map((item) => {
                        const state = itemInputs[item.id] || {
                          selected: false,
                          cumulative: "",
                          error: "",
                        };
                        const hasVal = state.cumulative.trim() !== "";
                        const normalized = normalizeDecimalInput(
                          hasVal ? state.cumulative : "0",
                          { maxIntDigits: 11, maxScale: 3, fieldName: "Luỹ kế" }
                        );
                        const cumStr = normalized.ok ? normalized.value : "0";
                        const calc = subtractQuantities(
                          cumStr,
                          item.prev_approved_cumulative
                        );
                        const isNeg = hasVal && calc.isNegative;

                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              isNeg
                                ? "bg-rose-50/80 hover:bg-rose-100/70"
                                : state.selected
                                ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={state.selected}
                                onChange={() => handleToggleSelect(item.id)}
                                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900">
                                {item.code ? `[${item.code}] ` : ""}
                                {item.name}
                              </div>
                              {item.contract_quantity && (
                                <div className="text-[11px] text-slate-500">
                                  HĐ: {formatQuantityVN(item.contract_quantity)} {item.unit || ""}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center text-slate-500">
                              {item.unit || "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              {formatQuantityVN(item.prev_approved_cumulative)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-indigo-700 bg-indigo-50/30">
                              {formatQuantityVN(item.team_reported_quantity)}
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                size="sm"
                                placeholder="Nhập luỹ kế..."
                                value={state.cumulative}
                                onChange={(e) =>
                                  handleCumulativeChange(item.id, e.target.value)
                                }
                                className={`h-8 text-xs font-mono ${
                                  state.error
                                    ? "border-rose-500 focus-visible:ring-rose-400"
                                    : isNeg
                                    ? "border-rose-400 bg-rose-50"
                                    : ""
                                }`}
                              />
                              {state.error && (
                                <p className="text-[10px] text-rose-600 mt-0.5">
                                  {state.error}
                                </p>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {hasVal ? (
                                isNeg ? (
                                  <div className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                                    <AlertTriangle className="h-3 w-3 text-rose-600" />
                                    <span>{calc.formatted}</span>
                                  </div>
                                ) : (
                                  <span className="font-semibold text-emerald-700">
                                    +{calc.formatted}
                                  </span>
                                )
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Cảnh báo đợt âm nếu có */}
            {computedSummary.hasAnyNegative && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-rose-800 text-xs">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-900">
                    Cảnh báo đợt âm (luỹ kế mới nhỏ hơn luỹ kế đã duyệt gần nhất)
                  </div>
                  <p className="mt-0.5">
                    Phiếu có chứa hạng mục giảm sẽ được lưu ở trạng thái nháp kèm cờ cảnh báo, nhưng{" "}
                    <strong>không thể gửi duyệt</strong> cho đến khi có quy tắc điều chỉnh chính thức.
                  </p>
                </div>
              </div>
            )}

            {/* Đính kèm ảnh hiện trường */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-emerald-600" />
                    Đính kèm ảnh hiện trường (Tùy chọn)
                  </Label>
                  <p className="text-xs text-slate-500">
                    Hỗ trợ đính nhiều ảnh (JPEG, PNG, WebP, HEIC). Tối đa {MAX_PHOTO_SIZE_MB}MB mỗi ảnh.
                  </p>
                </div>

                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition">
                    <UploadCloud className="h-3.5 w-3.5 text-emerald-600" />
                    Thêm ảnh
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {selectedPhotos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                  {selectedPhotos.map((item, idx) => (
                    <div
                      key={idx}
                      className={`relative border rounded-lg p-2 bg-slate-50 flex flex-col gap-2 ${
                        item.error ? "border-rose-400 bg-rose-50/50" : ""
                      }`}
                    >
                      <div className="relative aspect-video rounded overflow-hidden bg-slate-200">
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 text-xs">
                        <div className="font-medium text-slate-800 truncate" title={item.file.name}>
                          {item.file.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                        <div
                          data-testid={`selected-photo-status-${idx}`}
                          className="mt-1 text-[11px] font-medium text-slate-700"
                        >
                          {item.inspection?.data_status_label ||
                            "Chưa có kết quả kiểm tra"}
                        </div>

                        {item.error ? (
                          <p className="text-[11px] text-rose-600 mt-1 font-medium">
                            {item.error}
                          </p>
                        ) : (
                          <Input
                            placeholder="Chú thích ảnh..."
                            value={item.caption}
                            onChange={(e) => handlePhotoCaptionChange(idx, e.target.value)}
                            className="mt-1 h-7 text-xs"
                            maxLength={500}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tóm tắt xem trước trước khi tạo */}
            <div className="p-3 bg-slate-50 rounded-lg border text-xs space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-slate-500" />
                Xem trước tóm tắt phiếu
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-600">
                <div>
                  Hạng mục đã chọn:{" "}
                  <strong className="text-slate-900">{computedSummary.count}</strong>
                </div>
                <div>
                  Dòng phát sinh âm:{" "}
                  <strong
                    className={
                      computedSummary.hasAnyNegative ? "text-rose-600" : "text-slate-900"
                    }
                  >
                    {computedSummary.selectedList.filter((r) => r.isNegative).length}
                  </strong>
                </div>
                <div>
                  Ảnh đính kèm:{" "}
                  <strong className="text-slate-900">{selectedPhotos.length}</strong>
                </div>
                <div>
                  Trạng thái sau tạo:{" "}
                  <Badge variant="outline" className="text-[10px] py-0">
                    Bản nháp (draft)
                  </Badge>
                </div>
              </div>
            </div>

            {submitError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={submitting}
            >
              {savedVoucherId ? "Đóng" : "Hủy"}
            </Button>
            <Button
              type="button"
              onClick={handleCreateVoucher}
              disabled={submitting || savedVoucherId || computedSummary.count === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Đang lưu...
                </>
              ) : (
                savedVoucherId
                  ? `Đã lưu bản nháp #${savedVoucherId}`
                  : "Tạo phiếu nghiệm thu nháp"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: CHI TIẾT PHIẾU NGHIỆM THU ── */}
      <Dialog
        open={detailDialogOpen}
        onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) {
            handleClosePhotoModal();
            setViewingVoucher(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-slate-900">
              <FileText className="h-5 w-5 text-emerald-600" />
              Chi tiết phiếu nghiệm thu
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-emerald-600" />
              Đang tải chi tiết phiếu...
            </div>
          ) : !viewingVoucher ? (
            <div className="py-8 text-center text-rose-600">
              Không thể tải dữ liệu phiếu nghiệm thu
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {/* Thẻ thông tin chung */}
              <div className="bg-slate-50 border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Tên đợt nghiệm thu</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {viewingVoucher.voucher.batch_name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Mã phiếu</span>
                  <span className="font-mono font-semibold text-slate-800">
                    #{viewingVoucher.voucher.id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Trạng thái</span>
                  <Badge variant="outline" className="mt-0.5">
                    {viewingVoucher.voucher.status === "draft"
                      ? "Bản nháp"
                      : viewingVoucher.voucher.status === "pending_review"
                      ? "Chờ duyệt"
                      : viewingVoucher.voucher.status === "approved"
                      ? "Đã duyệt"
                      : viewingVoucher.voucher.status === "returned"
                      ? "Đã trả lại"
                      : viewingVoucher.voucher.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-slate-500 block">Người lập & Ngày tạo</span>
                  <span className="font-medium text-slate-800 block">
                    {viewingVoucher.voucher.created_by_name}
                  </span>
                  <span className="text-slate-500">
                    {new Date(viewingVoucher.voucher.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
              </div>

              {viewingVoucher.voucher.review_note && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-semibold">
                    {viewingVoucher.voucher.status === "returned"
                      ? "Lý do trả lại"
                      : "Ghi chú xử lý gần nhất"}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{viewingVoucher.voucher.review_note}</p>
                  {(viewingVoucher.voucher.reviewed_by_name || viewingVoucher.voucher.reviewed_at) && (
                    <div className="mt-2 text-[11px] text-amber-700">
                      {viewingVoucher.voucher.reviewed_by_name && (
                        <span>Người xử lý: {viewingVoucher.voucher.reviewed_by_name}</span>
                      )}
                      {viewingVoucher.voucher.reviewed_at && (
                        <span>
                          {viewingVoucher.voucher.reviewed_by_name ? " · " : ""}
                          {new Date(viewingVoucher.voucher.reviewed_at).toLocaleString("vi-VN")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cảnh báo đợt âm nếu có */}
              {viewingVoucher.voucher.has_negative_delta && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-rose-800 text-xs">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-rose-900">
                      Phiếu có hạng mục khối lượng đợt âm
                    </div>
                    <p className="mt-0.5">
                      Phiếu đang ở trạng thái nháp và không được gửi duyệt hoặc cộng dồn vào luỹ kế đã duyệt cho tới khi có quy tắc điều chỉnh.
                    </p>
                  </div>
                </div>
              )}

              {/* Cảnh báo ảnh chụp ngoài bán kính công trường (S-41 / T-108) */}
              {isInvestor && viewingVoucher.photo_flags?.outside > 0 && (
                <div
                  data-testid="geofence-warning-banner"
                  className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-amber-900 text-xs"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-amber-950">
                      Cảnh báo vị trí ảnh hiện trường
                    </div>
                    <p className="mt-0.5 text-amber-800">
                      Phát hiện {viewingVoucher.photo_flags.outside} ảnh chụp ngoài bán kính công trường. Dấu hiệu này nhằm tham khảo khi đối chiếu bằng chứng (không chặn quy trình duyệt phiếu).
                    </p>
                  </div>
                </div>
              )}

              {/* Cảnh báo dấu hiệu bất thường của ảnh hiện trường (Story S-42 / T-109 / T-110) */}
              {viewingVoucher.photo_flags?.anomalies_count > 0 && (
                <div
                  data-testid="evidence-anomaly-banner"
                  className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2.5 text-orange-950 text-xs"
                >
                  <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-orange-950">
                      Cảnh báo dấu hiệu bất thường bằng chứng ảnh ({viewingVoucher.photo_flags.anomalies_count} ảnh cần xác minh)
                    </div>
                    <p className="mt-0.5 text-orange-800">
                      Phát hiện {viewingVoucher.photo_flags.anomalies_count} ảnh có dấu hiệu nghi vấn (tỷ lệ chụp màn hình hoặc sai lệch thời gian chụp so với đợt nghiệm thu). Đây là khuyến nghị kỹ thuật để kiểm tra thực tế, không tự động chặn quy trình duyệt phiếu.
                    </p>
                  </div>
                </div>
              )}

              {/* Bảng chi tiết hạng mục */}
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-800 text-sm">
                  Chi tiết khối lượng nghiệm thu
                </h4>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                      <tr>
                        <th className="py-2.5 px-3">Mã hạng mục</th>
                        <th className="py-2.5 px-3">Tên hạng mục</th>
                        <th className="py-2.5 px-2 text-center">ĐVT</th>
                        <th className="py-2.5 px-3 text-right">LK Đã duyệt trước</th>
                        <th className="py-2.5 px-3 text-right text-indigo-700">
                          Đội báo (S-26)
                        </th>
                        <th className="py-2.5 px-3 text-right">Luỹ kế mới</th>
                        <th className="py-2.5 px-3 text-right font-bold">
                          Khối lượng đợt
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-800">
                      {viewingVoucher.items.map((it) => {
                        const isNegative = parseFloat(it.delta_quantity) < 0;
                        return (
                          <tr
                            key={it.id}
                            className={isNegative ? "bg-rose-50/70" : "hover:bg-slate-50"}
                          >
                            <td className="py-2 px-3 font-mono text-slate-600">
                              {it.work_item_code || "—"}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {it.work_item_name}
                            </td>
                            <td className="py-2 px-2 text-center text-slate-500">
                              {it.unit || "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {formatQuantityVN(it.prev_approved_cumulative)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-indigo-700 bg-indigo-50/20">
                              {formatQuantityVN(it.team_reported_quantity)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-medium text-slate-900">
                              {formatQuantityVN(it.cumulative_quantity)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold">
                              {isNegative ? (
                                <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                                  <AlertTriangle className="h-3 w-3 text-rose-600" />
                                  {formatQuantityVN(it.delta_quantity)}
                                </span>
                              ) : (
                                <span className="text-emerald-700">
                                  +{formatQuantityVN(it.delta_quantity)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Danh sách ảnh hiện trường */}
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4 text-emerald-600" />
                  Ảnh hiện trường ({viewingVoucher.photos?.length || 0})
                </h4>

                {(!viewingVoucher.photos || viewingVoucher.photos.length === 0) ? (
                  <p className="text-xs text-slate-400 italic">
                    Phiếu này không có ảnh hiện trường đính kèm.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
                    {viewingVoucher.photos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={
                          isInvestor
                            ? () => handleOpenPhotoPreview(photo)
                            : undefined
                        }
                        className={`${isInvestor ? "cursor-pointer hover:shadow-md" : ""} group border rounded-lg overflow-hidden bg-slate-50 transition`}
                      >
                        <div className="aspect-video relative overflow-hidden bg-slate-200">
                          <img
                            src={photo.url}
                            alt={photo.file_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-2 text-xs">
                          <div className="font-medium text-slate-800 truncate" title={photo.file_name}>
                            {photo.file_name}
                          </div>
                          {photo.caption && (
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                              {photo.caption}
                            </p>
                          )}

                          <div
                            data-testid={`evidence-badge-${photo.id}`}
                            className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            {photo.inspection?.data_status_label ||
                              "Chưa có kết quả kiểm tra"}
                          </div>

                          {isInvestor && photo.geofence_status === "outside" && (
                            <div
                              data-testid={`geofence-badge-${photo.id}`}
                              className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200"
                            >
                              ⚠️ Ngoài phạm vi {photo.geofence_distance_m !== null ? `(${Number(photo.geofence_distance_m).toLocaleString("vi-VN")} m)` : ""}
                            </div>
                          )}
                          {isInvestor && photo.geofence_status === "inside" && (
                            <div
                              data-testid={`geofence-badge-${photo.id}`}
                              className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200"
                            >
                              ✓ Đúng vị trí {photo.geofence_distance_m !== null ? `(${Number(photo.geofence_distance_m).toLocaleString("vi-VN")} m)` : ""}
                            </div>
                          )}
                          {isInvestor &&
                            (photo.geofence_status === "no_gps" ||
                              photo.geofence_status === "no_site_config") && (
                              <div
                                data-testid={`geofence-badge-${photo.id}`}
                                className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-500 bg-slate-100"
                              >
                                {photo.geofence_status === "no_gps"
                                  ? "Không có GPS"
                                  : "Chưa cấu hình tâm"}
                              </div>
                            )}

                          {isInvestor && (
                            <button
                              type="button"
                              data-testid={`photo-meta-btn-${photo.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPhotoDetail(photo);
                              }}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-medium block cursor-pointer"
                            >
                              ℹ️ Thông tin ảnh
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Panel xem chi tiết ảnh hiện trường / Phóng to ảnh (S-40 / S-42 / T-106, T-110) */}
      <PhotoMetadataPanel
        projectId={photoModal.photo?.project_id || viewingVoucher?.voucher?.project_id || projectId}
        photoId={photoModal.photo?.id}
        photo={photoModal.photo}
        kind="acceptance"
        isOpen={isInvestor && photoModal.status !== "closed"}
        mode={photoModal.status}
        onSwitchMode={(newMode) =>
          setPhotoModal((prev) => ({ ...prev, status: newMode }))
        }
        onClose={handleClosePhotoModal}
      />

      {/* ── DIALOG: XÁC NHẬN DUYỆT PHIẾU ── */}
      <Dialog
        open={approveDialogOpen}
        onOpenChange={(open) => {
          if (!actionLoading) {
            setApproveDialogOpen(open);
            if (!open) {
              setApproveTarget(null);
              setApproveError("");
            }
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600" />
              Xác nhận duyệt phiếu
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
              Bạn đang duyệt phiếu{" "}
              <span className="font-semibold">
                #{approveTarget?.id} · {approveTarget?.batch_name}
              </span>
              .
            </div>

            {/* Cảnh báo nhắc nhở nếu phiếu có ảnh có dấu hiệu bất thường (Story S-42 / T-110) */}
            {approveTarget?.photo_flags?.anomalies_count > 0 && (
              <div
                data-testid="approve-evidence-warning"
                className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Lưu ý kiểm tra bằng chứng hiện trường:</span>
                  <span>
                    Phiếu này có {approveTarget.photo_flags.anomalies_count} ảnh có dấu hiệu cần xác minh (chụp màn hình hoặc sai lệch thời gian). Vui lòng đảm bảo đã đối chiếu thực tế trước khi xác nhận duyệt.
                  </span>
                </div>
              </div>
            )}
            <p className="text-sm text-slate-600">
              Sau khi duyệt, phiếu chuyển sang trạng thái <strong>Đã duyệt</strong> và
              không còn được chỉnh sửa như phiếu nháp.
            </p>
            {approveError && (
              <div
                role="alert"
                className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700"
              >
                {approveError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={actionLoading}
              onClick={() => setApproveDialogOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={actionLoading || !approveTarget}
              onClick={handleConfirmApprove}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {actionLoading ? "Đang duyệt..." : "Xác nhận duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: TRẢ LẠI PHIẾU ── */}
      <Dialog
        open={returnDialogOpen}
        onOpenChange={(open) => {
          if (!actionLoading) {
            setReturnDialogOpen(open);
            if (!open) {
              setReturnTarget(null);
              setReturnReason("");
              setReviewError("");
            }
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Trả lại phiếu nghiệm thu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-slate-50 border p-3 text-sm text-slate-700">
              Phiếu: <span className="font-semibold">#{returnTarget?.id} · {returnTarget?.batch_name}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acceptance-return-reason">
                Lý do trả lại <span className="text-rose-600">*</span>
              </Label>
              <textarea
                id="acceptance-return-reason"
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                disabled={actionLoading}
                maxLength={2000}
                rows={5}
                placeholder="Nhập rõ nội dung cần người lập chỉnh sửa..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-slate-100"
              />
              <div className="text-right text-[11px] text-slate-400">
                {returnReason.length}/2000
              </div>
            </div>
            {reviewError && (
              <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
                {reviewError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={actionLoading}
              onClick={() => setReturnDialogOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={actionLoading}
              onClick={handleConfirmReturn}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {actionLoading ? "Đang trả lại..." : "Xác nhận trả lại"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ── DIALOG: LỊCH SỬ PHIẾU (S-39) ── */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-600" />
              Lịch sử thao tác — Phiếu #{historyVoucherId}
            </DialogTitle>
          </DialogHeader>

          {historyLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-emerald-600" />
              Đang tải lịch sử...
            </div>
          ) : historyLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <History className="h-10 w-10 mx-auto mb-2 text-slate-300" />
              Chưa có sự kiện nào được ghi lại
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {historyLogs.map((log) => {
                const actionLabel =
                  {
                    CREATE_ACCEPTANCE_VOUCHER: "Tạo phiếu",
                    SUBMIT_ACCEPTANCE_VOUCHER: "Gửi duyệt",
                    APPROVE_ACCEPTANCE_VOUCHER: "Duyệt phiếu",
                    RETURN_ACCEPTANCE_VOUCHER: "Trả lại phiếu",
                  }[log.action] || log.action;
                const colorMap = {
                  CREATE_ACCEPTANCE_VOUCHER: "bg-slate-100 text-slate-700",
                  SUBMIT_ACCEPTANCE_VOUCHER: "bg-blue-100 text-blue-800",
                  APPROVE_ACCEPTANCE_VOUCHER: "bg-emerald-100 text-emerald-800",
                  RETURN_ACCEPTANCE_VOUCHER: "bg-rose-100 text-rose-800",
                };
                const badgeCls =
                  colorMap[log.action] || "bg-slate-100 text-slate-700";
                return (
                  <div
                    key={log.id}
                    className="border rounded-lg p-3 bg-slate-50/50"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge className={badgeCls}>{actionLabel}</Badge>
                      <span className="text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <div className="text-sm text-slate-800">
                      <strong>{log.user_name || "(hệ thống)"}</strong>
                      {log.user_email && (
                        <span className="text-xs text-slate-500 ml-2">
                          {log.user_email}
                        </span>
                      )}
                    </div>
                    {log.details && (
                      <div className="mt-2 text-xs">
                        {log.details.old_value && log.details.new_value ? (
                          <div className="flex flex-wrap gap-3 text-slate-600">
                            <span>
                              Trạng thái:{" "}
                              <code className="bg-slate-100 px-1 rounded">
                                {log.details.old_value.status}
                              </code>
                              {" → "}
                              <code className="bg-emerald-100 px-1 rounded">
                                {log.details.new_value.status}
                              </code>
                            </span>
                            {log.details.reason && (
                              <span className="text-rose-700">
                                Lý do: {log.details.reason}
                              </span>
                            )}
                            {log.details.new_value.review_note && (
                              <span className="text-slate-600 italic">
                                Ghi chú: {log.details.new_value.review_note}
                              </span>
                            )}
                          </div>
                        ) : (
                          <pre className="bg-white border rounded p-2 overflow-auto text-[11px]">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHistoryDialogOpen(false)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}
