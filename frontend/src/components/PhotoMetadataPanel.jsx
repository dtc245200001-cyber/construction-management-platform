import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import api from '../lib/api';

/**
 * Component hiển thị thông tin siêu dữ liệu ảnh hiện trường (EXIF/GPS)
 * Story S-40: T-106
 *
 * Tiêu chí:
 * - Hiển thị thời điểm và toạ độ khi xem ảnh trong nhật ký và phiếu nghiệm thu.
 * - Ảnh không có siêu dữ liệu thì ghi rõ trạng thái.
 * - Giới hạn vai trò xem toạ độ thô: chỉ CHU_DAU_TU, BAN_QUAN_LY được xem toạ độ chi tiết.
 * - Các vai trò khác chỉ biết ảnh có toạ độ nhưng không thấy toạ độ thô.
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

  useEffect(() => {
    if (!isOpen || !projectId || !photoId || !kind) {
      setMetadata(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .get(`/projects/${projectId}/photo-metadata/${kind}/${photoId}`)
      .then((res) => {
        if (isMounted) {
          setMetadata(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err.response?.data?.message ||
              'Không thể tải thông tin siêu dữ liệu ảnh.'
          );
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectId, photoId, kind]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-metadata-title"
    >
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📸</span>
            <h3
              id="photo-metadata-title"
              className="text-lg font-semibold text-gray-900"
            >
              Thông tin ảnh hiện trường
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

        {/* Content Body */}
        <div className="mt-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="mt-2 text-sm">Đang đọc siêu dữ liệu...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {!loading && !error && metadata && (
            <div className="space-y-4">
              {/* Trạng thái metadata */}
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái dữ liệu
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

              {/* Thời điểm chụp */}
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

              {/* Toạ độ GPS & Quyền riêng tư */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                  Vị trí địa lý (GPS)
                </span>

                {metadata.has_gps && (
                  <p className="text-xs font-medium mt-1 mb-2 text-slate-700" data-testid="gps-source-text">
                    {metadata.gps_source === 'client_reported' || metadata.source === 'client'
                      ? 'Toạ độ do thiết bị báo, chưa xác thực từ ảnh gốc'
                      : 'Toạ độ từ ảnh gốc'}
                  </p>
                )}

                {metadata.gps ? (
                  /* Có quyền xem toạ độ thô */
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
                  /* Có toạ độ nhưng không có quyền xem toạ độ thô */
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
                  /* Không có GPS */
                  <div>
                    <p className="mt-1 text-sm italic text-gray-500">
                      Ảnh không có thông tin toạ độ GPS
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      (Không có dữ liệu)
                    </p>
                  </div>
                )}
              </div>

              {/* Đối chiếu phạm vi công trường (Geofence - S-41 / T-108) */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3" data-testid="geofence-evaluation-section">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                  Đối chiếu phạm vi công trường
                </span>
                {metadata.geofence?.status === 'inside' ? (
                  metadata.geofence?.basis === 'client_reported' || metadata.gps_source === 'client_reported' ? (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          data-testid="geofence-status-inside"
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 border border-amber-300"
                        >
                          ✓ Trong phạm vi (chưa xác thực)
                        </span>
                        {metadata.geofence.distance_m !== null && (
                          <span className="text-xs text-gray-600">
                            (cách tâm {Number(metadata.geofence.distance_m).toLocaleString('vi-VN')} m)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-amber-700">
                        Toạ độ do thiết bị báo, chưa xác thực từ ảnh gốc.
                      </p>
                    </div>
                  ) : (
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
                  )
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

        {/* Footer */}
        <div className="mt-6 flex justify-end">
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
