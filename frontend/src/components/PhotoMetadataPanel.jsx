import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import api from '../lib/api';

/**
 * Component hiển thị thông tin siêu dữ liệu ảnh hiện trường (EXIF/GPS)
 * và kết quả kiểm tra dấu hiệu bất thường (Story S-40, S-41, S-42 / T-106, T-108, T-110)
 *
 * Tiêu chí:
 * - Hiển thị thời điểm và toạ độ khi xem ảnh trong nhật ký và phiếu nghiệm thu.
 * - Ảnh không có siêu dữ liệu thì ghi rõ trạng thái.
 * - Giới hạn vai trò xem toạ độ thô: chỉ CHU_DAU_TU, BAN_QUAN_LY được xem toạ độ chi tiết.
 * - T-110: Hiển thị trạng thái kiểm tra bất thường (clean, warning, incomplete_data, error).
 * - T-110: Hiển thị danh sách cảnh báo cùng lý do cụ thể, thông số kỹ thuật (kích thước, tỷ lệ, phần cứng).
 * - T-110: Xử lý loading, error kèm nút thử lại (retry), responsive dialog.
 */
export default function PhotoMetadataPanel({
  projectId,
  photoId,
  kind,
  isOpen,
  onClose,
}) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMetadata = useCallback(() => {
    if (!isOpen || !projectId || !photoId || !kind) {
      setMetadata(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    api
      .get(`/projects/${projectId}/photo-metadata/${kind}/${photoId}`)
      .then((res) => {
        setMetadata(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err.response?.data?.message ||
            'Không thể tải thông tin siêu dữ liệu ảnh.'
        );
        setLoading(false);
      });
  }, [isOpen, projectId, photoId, kind]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  if (!isOpen) return null;

  // Format thời gian hiển thị theo giờ Việt Nam
  const formatCapturedTime = (isoString) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getTimeSourceLabel = (src) => {
    switch (src) {
      case 'exif_offset':
        return 'EXIF gốc (kèm múi giờ)';
      case 'gps_utc':
        return 'Đồng hồ vệ tinh GPS (UTC)';
      case 'assumed_local':
        return 'EXIF gốc (quy ước giờ Việt Nam)';
      case 'client_reported':
        return 'Thiết bị ghi nhận tại thời điểm gửi';
      default:
        return 'Không xác định';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'time_only':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'gps_only':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'unreadable':
      case 'unsupported':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'none':
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getInspectionBadgeClass = (status) => {
    switch (status) {
      case 'clean':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'warning':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'incomplete_data':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'error':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getInspectionBadgeLabel = (inspection) => {
    if (!inspection) return 'Chưa kiểm tra';
    switch (inspection.status) {
      case 'clean':
        return '✓ Hợp lệ / Bình thường';
      case 'warning': {
        const count = inspection.warnings_count || inspection.warnings?.length || 1;
        return `⚠️ Cần xác minh (${count} dấu hiệu)`;
      }
      case 'incomplete_data':
        return 'ℹ️ Dữ liệu không đầy đủ';
      case 'error':
        return '❌ Lỗi kiểm tra tệp';
      default:
        return inspection.status_label || inspection.status;
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'high':
        return (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 border border-rose-200">
            Nghi vấn cao
          </span>
        );
      case 'medium':
        return (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
            Cần kiểm tra
          </span>
        );
      case 'low':
      default:
        return (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 border border-blue-200">
            Lưu ý
          </span>
        );
    }
  };

  const inspection = metadata?.inspection;
  const techMeta = inspection?.metadata;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-metadata-title"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl transition-all">
        {/* Header - Fixed top */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📸</span>
            <h3
              id="photo-metadata-title"
              className="text-lg font-semibold text-gray-900"
            >
              Thông tin ảnh & kiểm tra bằng chứng
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-x-btn"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="mt-2 text-sm">Đang đọc siêu dữ liệu...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200 space-y-2">
              <p>{error}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid="retry-metadata-btn"
                  onClick={fetchMetadata}
                  className="inline-flex items-center gap-1 rounded bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 transition"
                >
                  🔄 Thử lại
                </button>
              </div>
            </div>
          )}

          {!loading && !error && metadata && (
            <div className="space-y-4">
              {/* PHẦN 1: KẾT QUẢ KIỂM TRA BẤT THƯỜNG (Story S-42 / T-110) */}
              <div
                data-testid="photo-inspection-section"
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🛡️</span>
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Kiểm tra quy tắc bằng chứng (S-42)
                    </span>
                  </div>
                  <div>
                    <span
                      data-testid="inspection-status-badge"
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getInspectionBadgeClass(
                        inspection?.status
                      )}`}
                    >
                      {getInspectionBadgeLabel(inspection)}
                    </span>
                  </div>
                </div>

                {/* Trạng thái clean */}
                {inspection?.status === 'clean' && (
                  <div
                    data-testid="inspection-clean-state"
                    className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1"
                  >
                    <div className="font-semibold flex items-center gap-1 text-emerald-800">
                      <span>✓</span> Bằng chứng hợp lệ / bình thường
                    </div>
                    <p className="text-emerald-700">
                      Tệp ảnh có cấu trúc toàn vẹn, không phát hiện kích thước chụp lại màn hình. Thông tin thời gian chụp nhất quán với thời điểm lập phiếu.
                    </p>
                  </div>
                )}

                {/* Trạng thái warning: Hiển thị danh sách cảnh báo */}
                {inspection?.status === 'warning' && (
                  <div className="space-y-2">
                    <div
                      data-testid="inspection-warnings-list"
                      className="space-y-2"
                    >
                      {inspection.warnings?.map((w, idx) => (
                        <div
                          key={w.code || idx}
                          data-testid={`inspection-warning-${w.code || idx}`}
                          className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-amber-950 flex items-center gap-1">
                              <span>⚠️</span> {w.title}
                            </span>
                            {getSeverityBadge(w.severity)}
                          </div>
                          <p className="text-slate-700 leading-relaxed text-[11px]">
                            {w.reason}
                          </p>
                          {w.confidence && (
                            <div className="text-[10px] text-amber-800 pt-0.5">
                              Độ tin cậy dấu hiệu:{' '}
                              <span className="font-medium">
                                {w.confidence === 'high'
                                  ? 'Cao'
                                  : w.confidence === 'medium'
                                  ? 'Trung bình'
                                  : 'Thấp'}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg bg-amber-100/70 p-2 text-[11px] text-amber-900 border border-amber-200/60 leading-relaxed">
                      💡 <strong>Khuyến nghị đối chiếu:</strong> Dấu hiệu nghi vấn nhằm giúp kỹ sư giám sát kiểm tra lại bằng chứng thực tế tại hiện trường. Không tự động kết luận gian lận và không tự ý chặn duyệt phiếu.
                    </div>
                  </div>
                )}

                {/* Trạng thái incomplete_data */}
                {inspection?.status === 'incomplete_data' && (
                  <div
                    data-testid="inspection-incomplete-state"
                    className="rounded-lg bg-slate-100 border border-slate-200 p-3 text-xs text-slate-800 space-y-1"
                  >
                    <div className="font-semibold text-slate-900">
                      ℹ️ Dữ liệu không đầy đủ để đánh giá toàn diện
                    </div>
                    <p className="text-slate-600">
                      Tệp ảnh không chứa các thẻ EXIF phần cứng của máy ảnh (Make/Model) hoặc không có thời gian chụp gốc. Kỹ sư có thể đối chiếu thêm thời điểm ghi nhận thực tế trên công trường.
                    </p>
                  </div>
                )}

                {/* Trạng thái error */}
                {inspection?.status === 'error' && (
                  <div
                    data-testid="inspection-error-state"
                    className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 space-y-1"
                  >
                    <div className="font-semibold text-rose-900">
                      ❌ Lỗi phân tích tệp ảnh
                    </div>
                    <p className="text-rose-700">
                      Không thể trích xuất hoặc phân tích tệp ảnh do tệp bị hỏng hoặc định dạng không hỗ trợ.
                    </p>
                  </div>
                )}

                {/* Thông số kỹ thuật metadata trích xuất được */}
                {techMeta && (
                  <div
                    data-testid="inspection-metadata-details"
                    className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs space-y-1.5"
                  >
                    <span className="text-[11px] font-semibold text-slate-700 block border-b border-slate-100 pb-1">
                      Thông số kỹ thuật tệp ảnh:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500">Độ phân giải: </span>
                        <span className="font-mono font-medium text-slate-800">
                          {techMeta.width && techMeta.height
                            ? `${techMeta.width} × ${techMeta.height} px`
                            : 'Không xác định'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Tỷ lệ khung hình: </span>
                        <span className="font-medium text-slate-800">
                          {techMeta.aspect_ratio || '—'}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500">Thiết bị chụp: </span>
                        <span className="font-medium text-slate-800">
                          {techMeta.make
                            ? `${techMeta.make} ${techMeta.model || ''}`.trim()
                            : 'Không có thông tin phần cứng máy ảnh'}
                        </span>
                      </div>
                      {techMeta.screenshot_evaluation && (
                        <div className="col-span-2">
                          <span className="text-slate-500">Dấu hiệu màn hình: </span>
                          <span
                            className={
                              techMeta.screenshot_evaluation.is_screenshot_likely
                                ? 'font-semibold text-amber-700'
                                : 'text-slate-700'
                            }
                          >
                            {techMeta.screenshot_evaluation.is_screenshot_likely
                              ? `Trùng tỷ lệ smartphone (${techMeta.screenshot_evaluation.matched_ratio || 'chuẩn'})`
                              : 'Không phát hiện'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* PHẦN 2: THỜI ĐIỂM CHỤP & TRẠNG THÁI EXIF GỐC (S-40 / T-106) */}
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái dữ liệu EXIF
                </span>
                <div className="mt-1">
                  <span
                    data-testid="metadata-status-badge"
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeClass(
                      metadata.status
                    )}`}
                  >
                    {metadata.status_label || metadata.status}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                  Thời điểm chụp
                </span>
                {metadata.captured_at ? (
                  <div className="mt-1">
                    <p
                      data-testid="captured-at-text"
                      className="text-sm font-semibold text-gray-800"
                    >
                      {formatCapturedTime(metadata.captured_at)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Nguồn: {getTimeSourceLabel(metadata.captured_at_source)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm italic text-gray-500">
                    Ảnh không ghi nhận thời gian chụp gốc
                  </p>
                )}
              </div>

              {/* PHẦN 3: TOẠ ĐỘ GPS (S-40) */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                  Vị trí địa lý (GPS)
                </span>

                {metadata.gps ? (
                  <div className="mt-1 space-y-1.5" data-testid="gps-coordinates-section">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Vĩ độ (Lat):</span>
                      <span className="font-mono font-medium text-gray-900">
                        {metadata.gps.latitude.toFixed(6)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Kinh độ (Lon):</span>
                      <span className="font-mono font-medium text-gray-900">
                        {metadata.gps.longitude.toFixed(6)}
                      </span>
                    </div>
                    {metadata.gps.accuracy_m !== null && (
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Bán kính sai số:</span>
                        <span>±{metadata.gps.accuracy_m} m</span>
                      </div>
                    )}
                    <div className="pt-2">
                      <a
                        href={`https://www.google.com/maps?q=${metadata.gps.latitude},${metadata.gps.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        📍 Xem trên bản đồ (Google Maps) ↗
                      </a>
                    </div>
                  </div>
                ) : metadata.has_gps ? (
                  <div
                    data-testid="gps-restricted-section"
                    className="mt-1 rounded-md bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200"
                  >
                    <p className="font-medium">Đã ghi nhận toạ độ hiện trường</p>
                    <p className="mt-0.5 text-amber-700">
                      Để bảo vệ quyền riêng tư vị trí của người lao động, chỉ Ban quản lý và Chủ đầu tư mới được xem toạ độ chi tiết.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm italic text-gray-500">
                    Ảnh không có thông tin toạ độ GPS
                  </p>
                )}
              </div>

              {/* PHẦN 4: ĐỐI CHIẾU PHẠM VI CÔNG TRƯỜNG (S-41 / T-108) */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3" data-testid="geofence-evaluation-section">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                  Đối chiếu phạm vi công trường
                </span>
                {metadata.geofence?.status === 'inside' ? (
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      data-testid="geofence-status-inside"
                      className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 border border-green-200"
                    >
                      ✓ Trong phạm vi công trường
                    </span>
                    {metadata.geofence.distance_m !== null && (
                      <span className="text-xs text-gray-600">
                        (cách tâm {Number(metadata.geofence.distance_m).toLocaleString('vi-VN')} m)
                      </span>
                    )}
                  </div>
                ) : metadata.geofence?.status === 'outside' ? (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        data-testid="geofence-status-outside"
                        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 border border-red-200"
                      >
                        ⚠️ Ngoài phạm vi công trường
                      </span>
                      {metadata.geofence.distance_m !== null && (
                        <span className="text-xs font-semibold text-red-700">
                          (cách tâm {Number(metadata.geofence.distance_m).toLocaleString('vi-VN')} m)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-red-600">
                      Ảnh được chụp ngoài bán kính công trường quy định, cần kiểm tra đối chiếu khi nghiệm thu.
                    </p>
                  </div>
                ) : metadata.geofence?.status === 'no_site_config' ? (
                  <p className="mt-1 text-sm italic text-gray-500">
                    Dự án chưa cấu hình toạ độ tâm và bán kính công trường
                  </p>
                ) : (
                  <p className="mt-1 text-sm italic text-gray-500">
                    Không có toạ độ GPS để đối chiếu với phạm vi công trường
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Fixed bottom */}
        <div className="border-t border-gray-100 px-6 py-3 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            data-testid="close-panel-btn"
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

PhotoMetadataPanel.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
  .isRequired,
  photoId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  kind: PropTypes.oneOf(['diary', 'acceptance']).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
