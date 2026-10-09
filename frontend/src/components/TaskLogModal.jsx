import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import {
  Camera,
  Image as ImageIcon,
  Upload,
  X,
  RefreshCw,
  AlertTriangle,
  User,
  Clock,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  processAndCompressImages,
  formatFileSize,
  MAX_COMPRESSED_IMAGE_BYTES,
  isUnderSizeLimit,
} from "../utils/imageCompressor";

/**
 * TaskLogModal (S-23 / T-53 / T-54)
 * Modal ghi nhật ký & đính kèm nhiều ảnh nén phía client (T53).
 * Hỗ trợ tải trước tối đa 10 thumbnail, lazy-load các ảnh tiếp theo và xem ảnh gốc theo yêu cầu (T54).
 */
export default function TaskLogModal({
  projectId,
  taskId,
  taskName,
  isOpen = true,
  onClose,
  onLogAdded,
}) {
  const effectiveProjectId = projectId || localStorage.getItem("currentProjectId");
  const effectiveTaskId = taskId;

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [content, setContent] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [viewingImageIndex, setViewingImageIndex] = useState(null);

  const allAttachments = logs.flatMap((l) => l.attachments || []);
  let globalAttachmentCounter = 0;

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const draftKey = `task_log_draft_${effectiveProjectId}_${effectiveTaskId}`;

  // Load logs
  const fetchLogs = async () => {
    if (!effectiveProjectId || !effectiveTaskId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.get(
        `/projects/${effectiveProjectId}/tasks/${effectiveTaskId}/logs`
      );
      setLogs(res.data?.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Không thể tải nhật ký của công việc"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && effectiveProjectId && effectiveTaskId) {
      fetchLogs();

      // Khôi phục bản nháp nếu có
      try {
        const savedDraft = localStorage.getItem(draftKey);
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          if (draft.content) setContent(draft.content);
        }
      } catch (e) {
        console.warn("Không thể khôi phục bản nháp:", e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, taskId]);

  // Lưu bản nháp nội dung
  useEffect(() => {
    if (!projectId || !taskId) return;
    try {
      if (content.trim()) {
        localStorage.setItem(draftKey, JSON.stringify({ content }));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch (e) {
      // ignore
    }
  }, [content, projectId, taskId, draftKey]);

  // Dọn dẹp object URLs khi unmount
  useEffect(() => {
    return () => {
      selectedImages.forEach((img) => {
        if (img.previewUrl && img.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    };
  }, [selectedImages]);

  if (!isOpen) return null;

  // Xử lý chọn ảnh & nén tự động dưới 1MB
  const handleFilesSelected = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSubmitError("");
    setCompressing(true);

    try {
      const remainingSlots = 10 - selectedImages.length;
      if (remainingSlots <= 0) {
        setSubmitError("Đã đạt giới hạn tối đa 10 ảnh cho mỗi mục nhật ký.");
        setCompressing(false);
        return;
      }

      const compressedList = await processAndCompressImages(
        files,
        remainingSlots
      );
      setSelectedImages((prev) => [...prev, ...compressedList]);
    } catch (err) {
      setSubmitError(
        "Có lỗi khi xử lý nén ảnh: " + (err.message || "Lỗi không xác định")
      );
    } finally {
      setCompressing(false);
      if (e.target) e.target.value = "";
    }
  };

  // Xóa ảnh khỏi danh sách chuẩn bị gửi
  const handleRemoveImage = (imgId) => {
    setSelectedImages((prev) => {
      const target = prev.find((img) => img.id === imgId);
      if (target?.previewUrl && target.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((img) => img.id !== imgId);
    });
  };

  // Helper chuẩn hóa đường dẫn ảnh đính kèm
  const getAttachmentUrl = (url) => {
    if (!url) return "";
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("blob:") ||
      url.startsWith("data:")
    ) {
      return url;
    }
    const baseUrl = api.defaults?.baseURL || "";
    if (baseUrl && baseUrl.startsWith("http")) {
      try {
        const origin = new URL(baseUrl).origin;
        return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
      } catch {
        return url;
      }
    }
    return url;
  };

  // Gửi nhật ký kèm ảnh đã nén lên API T52
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (submitting || compressing) return;

    // Lọc các ảnh hợp lệ đã nén thành công và < 1.048.576 byte (AC2)
    const validImagesToUpload = selectedImages.filter(
      (img) =>
        (img.status === "ready" || img.status === "upload_failed") &&
        img.file &&
        isUnderSizeLimit(img.file)
    );

    const hasFailedImages = selectedImages.some(
      (img) => img.status === "error" || !img.file
    );

    if (!content.trim() && validImagesToUpload.length === 0) {
      if (hasFailedImages) {
        setSubmitError(
          "Các ảnh đã chọn bị lỗi nén hoặc vượt quá 1 MB. Vui lòng xóa ảnh lỗi hoặc chọn ảnh khác."
        );
      } else {
        setSubmitError(
          "Vui lòng nhập nội dung ghi chú hoặc đính kèm ít nhất 1 ảnh hợp lệ."
        );
      }
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const formData = new FormData();
    if (content.trim()) {
      formData.append("content", content.trim());
    }

    // Gửi đúng field name "images" của API T52
    validImagesToUpload.forEach((img) => {
      formData.append("images", img.file);
    });

    try {
      const res = await api.post(
        `/projects/${effectiveProjectId}/tasks/${effectiveTaskId}/logs`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      // Giải phóng preview URLs của ảnh đã upload thành công
      validImagesToUpload.forEach((img) => {
        if (img.previewUrl && img.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });

      // Nếu có ảnh bị lỗi trước đó thì giữ lại ảnh lỗi, xóa ảnh đã gửi thành công
      if (hasFailedImages) {
        setSelectedImages((prev) =>
          prev.filter((img) => !validImagesToUpload.includes(img))
        );
      } else {
        setSelectedImages([]);
      }

      setContent("");
      try {
        localStorage.removeItem(draftKey);
      } catch (e) {
        // ignore
      }

      // Thêm log mới vào danh sách đầu
      if (res.data?.log) {
        setLogs((prev) => [res.data.log, ...prev]);
        if (onLogAdded) onLogAdded(res.data.log);
      } else {
        await fetchLogs();
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.message ||
        err.message ||
        "Lỗi mạng khi tải ảnh lên. Dữ liệu và ảnh đã được giữ lại để thử lại.";
      setSubmitError(errMsg);
      // Đánh dấu ảnh upload_failed để có thể bấm Thử lại mà không làm mất file
      setSelectedImages((prev) =>
        prev.map((img) =>
          img.file && isUnderSizeLimit(img.file)
            ? { ...img, status: "upload_failed", error: errMsg }
            : img
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-md">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">
                Nhật ký & Ảnh hiện trường
              </h2>
              <p className="text-xs text-blue-100 truncate max-w-md mt-0.5">
                {taskName || `Công việc #${taskId}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-colors"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {/* Form thêm nhật ký mới */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Ghi nhận hiện trường mới
              </span>
              <span className="text-xs text-slate-500">
                Tối đa 10 ảnh / nén &lt; 1 MB
              </span>
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập mô tả tình hình thi công, chất lượng hoặc vướng mắc tại công trường..."
              rows={3}
              className="w-full text-sm p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            />

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />

            {/* Action buttons for Image upload / Camera */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={
                  compressing || submitting || selectedImages.length >= 10
                }
                className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 flex items-center gap-1.5 transition-colors disabled:opacity-50 min-h-[38px] cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Chụp ảnh ngay
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  compressing || submitting || selectedImages.length >= 10
                }
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors disabled:opacity-50 min-h-[38px] cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                Chọn từ thư viện ({selectedImages.length}/10)
              </button>

              {compressing && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Đang nén ảnh &lt; 1MB...
                </span>
              )}
            </div>

            {/* Selected Images Preview Grid */}
            {selectedImages.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <div className="text-xs font-medium text-slate-600 mb-2 flex items-center justify-between">
                  <span>Ảnh đã chọn ({selectedImages.length}):</span>
                  <span className="text-green-600 font-medium">
                    Đã nén tự động phía client
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {selectedImages.map((img) => (
                    <div
                      key={img.id}
                      className={`relative group bg-white rounded-lg border overflow-hidden shadow-sm transition-all ${
                        img.status === "error"
                          ? "border-red-400 ring-2 ring-red-200"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="aspect-square w-full bg-slate-100 overflow-hidden relative">
                        {img.previewUrl ? (
                          <img
                            src={img.previewUrl}
                            alt={img.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-red-500 p-2 text-center text-[10px]">
                            <AlertTriangle className="w-5 h-5 mb-1" />
                            <span>Lỗi nén ảnh</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full hover:bg-red-600 transition-colors"
                          title="Xóa ảnh này"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="p-1.5 text-[11px] leading-tight text-slate-600 bg-white">
                        <div className="truncate font-medium" title={img.name}>
                          {img.name}
                        </div>
                        {img.status === "ready" && img.file && (
                          <div className="flex items-center justify-between text-slate-400 mt-0.5">
                            <span>{formatFileSize(img.compressedSize)}</span>
                            {img.compressionRatio > 0 && (
                              <span className="text-green-600">
                                -{img.compressionRatio}%
                              </span>
                            )}
                          </div>
                        )}
                        {img.status === "upload_failed" && (
                          <div
                            className="text-amber-600 font-semibold mt-0.5 text-[10px] truncate"
                            title={img.error || "Tải lên chưa thành công"}
                          >
                            {img.error || "Chưa tải lên được"}
                          </div>
                        )}
                        {img.status === "error" && (
                          <div
                            className="text-red-500 font-semibold mt-0.5 text-[10px] truncate"
                            title={img.error || "Nén thất bại"}
                          >
                            {img.error || "Nén thất bại"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message & Retry */}
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Thử lại
                </button>
              </div>
            )}

            {/* Submit button */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  compressing ||
                  (!content.trim() && selectedImages.length === 0)
                }
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md flex items-center gap-2 transition-all disabled:opacity-50 disabled:shadow-none min-h-[42px] cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tải lên...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Lưu nhật ký & Gửi ảnh</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Logs List Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Lịch sử nhật ký & Hình ảnh</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                  {logs.length}
                </span>
              </h3>
              <button
                onClick={fetchLogs}
                disabled={loading}
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors text-xs flex items-center gap-1 cursor-pointer"
                title="Làm mới"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Làm mới
              </button>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs">Đang tải nhật ký...</span>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={fetchLogs}
                  className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Tải lại
                </button>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-10 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-50/50">
                <Camera className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-medium">
                  Chưa có nhật ký hoặc hình ảnh nào cho công việc này.
                </p>
                <p className="text-[11px] text-slate-400">
                  Hãy chụp ảnh hoặc ghi nhận tiến độ đầu tiên ở phía trên.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => {
                  let formattedDate = "";
                  try {
                    formattedDate = format(
                      parseISO(log.created_at),
                      "dd/MM/yyyy HH:mm"
                    );
                  } catch {
                    formattedDate = log.created_at;
                  }

                  return (
                    <div
                      key={log.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-all space-y-3"
                    >
                      {/* Log Header */}
                      <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                          <span>
                            {log.user_name ||
                              log.user_email ||
                              `Người dùng #${log.user_id}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formattedDate}</span>
                        </div>
                      </div>

                      {/* Log Content */}
                      {log.content && (
                        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {log.content}
                        </p>
                      )}

                      {/* Attachments (T54 / AC1 & AC2) */}
                      {log.attachments && log.attachments.length > 0 && (
                        <div className="pt-1">
                          <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>
                              Hình ảnh đính kèm ({log.attachments.length}):
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                            {log.attachments.map((att) => {
                              const currentGlobalIndex = globalAttachmentCounter++;
                              return (
                                <AttachmentThumbnail
                                  key={att.id}
                                  attachment={att}
                                  globalIndex={currentGlobalIndex}
                                  onView={(selectedAtt) => {
                                    const foundIdx = allAttachments.findIndex(
                                      (a) => a.id === selectedAtt.id
                                    );
                                    setViewingImageIndex(
                                      foundIdx >= 0 ? foundIdx : 0
                                    );
                                  }}
                                  getAttachmentUrl={getAttachmentUrl}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Tối đa 10 ảnh / mỗi ảnh dưới 1 MB
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors min-h-[36px] cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Full-size Image Viewer (T54 / AC2) */}
      {viewingImageIndex !== null && (
        <ImageViewerModal
          images={allAttachments}
          currentIndex={viewingImageIndex}
          onClose={() => setViewingImageIndex(null)}
          onSelectIndex={(idx) => setViewingImageIndex(idx)}
          getAttachmentUrl={getAttachmentUrl}
        />
      )}
    </div>
  );
}

/**
 * AttachmentThumbnail (T54 / AC1)
 * Hiển thị thumbnail với ưu tiên tải trước cho 10 ảnh đầu tiên,
 * lazy-loading cho các ảnh còn lại, có placeholder và nút thử lại khi lỗi.
 */
export function AttachmentThumbnail({
  attachment,
  globalIndex = 0,
  onView,
  getAttachmentUrl,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const isPriority = globalIndex < 10;
  const rawUrl = getAttachmentUrl ? getAttachmentUrl(attachment.url) : attachment.url;
  const imageUrl =
    retryCount > 0
      ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}retry=${retryCount}`
      : rawUrl;

  const handleRetry = (e) => {
    e.stopPropagation();
    setError(false);
    setLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView && onView(attachment, globalIndex)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (onView) onView(attachment, globalIndex);
        }
      }}
      className="group relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
      title={`Bấm để xem ảnh gốc: ${attachment.file_name}`}
      data-testid={`thumbnail-item-${attachment.id}`}
    >
      {/* Loading Skeleton */}
      {loading && !error && (
        <div
          data-testid="thumbnail-loading"
          className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center text-slate-400 z-10"
        >
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      )}

      {/* Error State */}
      {error ? (
        <div
          data-testid="thumbnail-error"
          className="absolute inset-0 bg-red-50 text-red-600 flex flex-col items-center justify-center p-2 text-center z-10"
        >
          <AlertTriangle className="w-5 h-5 mb-1 text-red-500" />
          <span className="text-[10px] font-semibold mb-1 truncate max-w-full">
            Lỗi tải ảnh
          </span>
          <button
            type="button"
            data-testid="thumbnail-retry-btn"
            onClick={handleRetry}
            className="px-2 py-0.5 bg-white border border-red-200 text-red-700 text-[10px] font-medium rounded hover:bg-red-100 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Thử lại
          </button>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={attachment.file_name}
          loading={isPriority ? "eager" : "lazy"}
          fetchPriority={isPriority ? "high" : "auto"}
          data-priority={isPriority ? "true" : "false"}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
            loading ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      {/* Zoom overlay on hover */}
      {!error && !loading && (
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <div className="p-2 bg-white/90 backdrop-blur-sm rounded-full text-slate-800 shadow-md">
            <ZoomIn className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Caption bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-[10px] text-white flex items-center justify-between pointer-events-none">
        <span className="truncate max-w-[70%]" title={attachment.file_name}>
          {attachment.file_name}
        </span>
        {attachment.file_size && (
          <span className="text-[9px] text-slate-300 font-mono">
            {formatFileSize(attachment.file_size)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * ImageViewerModal (T54 / AC2)
 * Trình xem ảnh gốc chất lượng cao chỉ tải theo yêu cầu khi người dùng click vào thumbnail.
 */
export function ImageViewerModal({
  images = [],
  currentIndex = 0,
  onClose,
  onSelectIndex,
  getAttachmentUrl,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const currentImage = images[currentIndex];

  useEffect(() => {
    setLoading(true);
    setError(false);
    setRetryCount(0);
  }, [currentIndex]);

  // Phím tắt bàn phím: Escape để đóng, Trái/Phải để chuyển ảnh
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (onClose) onClose();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        if (onSelectIndex) onSelectIndex(currentIndex - 1);
      } else if (e.key === "ArrowRight" && currentIndex < images.length - 1) {
        if (onSelectIndex) onSelectIndex(currentIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images.length, onClose, onSelectIndex]);

  if (!currentImage) return null;

  const rawUrl = getAttachmentUrl ? getAttachmentUrl(currentImage.url) : currentImage.url;
  const fullImageUrl =
    retryCount > 0
      ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}retry=${retryCount}`
      : rawUrl;

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Xem ảnh: ${currentImage.file_name}`}
      data-testid="image-viewer-modal"
    >
      <div
        className="relative w-full max-w-5xl max-h-[95vh] flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar controls */}
        <div className="w-full flex items-center justify-between text-white pb-3 px-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold truncate max-w-xs sm:max-w-md">
              {currentImage.file_name}
            </span>
            {currentImage.file_size && (
              <span className="text-xs text-slate-400 font-mono bg-white/10 px-2 py-0.5 rounded">
                {formatFileSize(currentImage.file_size)}
              </span>
            )}
            <span className="text-xs text-slate-400">
              ({currentIndex + 1} / {images.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors cursor-pointer"
              title="Đóng (Esc)"
              aria-label="Đóng xem ảnh"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Main Image Stage */}
        <div className="relative w-full flex items-center justify-center min-h-[300px] max-h-[80vh] overflow-hidden rounded-2xl bg-black/50 border border-white/10">
          {/* Loading Indicator */}
          {loading && !error && (
            <div
              data-testid="full-image-loading"
              className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-3 z-10"
            >
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-xs font-medium">Đang tải ảnh gốc...</span>
            </div>
          )}

          {/* Error State */}
          {error ? (
            <div
              data-testid="full-image-error"
              className="flex flex-col items-center justify-center text-white p-6 text-center gap-3 z-10"
            >
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <p className="text-sm font-semibold text-red-300">
                Không thể tải ảnh gốc
              </p>
              <p className="text-xs text-slate-400">
                Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow"
              >
                <RefreshCw className="w-4 h-4" />
                Thử lại tải ảnh
              </button>
            </div>
          ) : (
            <img
              src={fullImageUrl}
              alt={currentImage.file_name}
              data-testid="full-size-image"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              className={`max-h-[80vh] max-w-full object-contain transition-opacity duration-300 ${
                loading ? "opacity-0" : "opacity-100"
              }`}
            />
          )}

          {/* Navigation Prev/Next buttons */}
          {images.length > 1 && (
            <>
              {currentIndex > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectIndex && onSelectIndex(currentIndex - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all backdrop-blur-sm z-20 cursor-pointer shadow-lg"
                  title="Ảnh trước (Mũi tên trái)"
                  aria-label="Ảnh trước"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              {currentIndex < images.length - 1 && (
                <button
                  type="button"
                  onClick={() => onSelectIndex && onSelectIndex(currentIndex + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all backdrop-blur-sm z-20 cursor-pointer shadow-lg"
                  title="Ảnh tiếp theo (Mũi tên phải)"
                  aria-label="Ảnh tiếp theo"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
