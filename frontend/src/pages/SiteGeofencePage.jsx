import React, { useState, useEffect, useCallback } from "react";
import PageHeroBanner from "../components/PageHeroBanner";
import api from "../lib/api";
import { usePermission } from "../hooks/usePermission";
import {
  MapPin,
  Save,
  Trash2,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  RefreshCw,
  Info,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import { toast } from "sonner";

export default function SiteGeofencePage() {
  const { can, role } = usePermission();
  const canManage = can("site_geofence.manage");

  const [projectId, setProjectId] = useState(() => {
    return (
      localStorage.getItem("currentProjectId") ||
      localStorage.getItem("current_project_id") ||
      "1"
    );
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);

  // Form fields
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusM, setRadiusM] = useState("");

  // Server state
  const [currentConfig, setCurrentConfig] = useState(null);
  const [recalculatedStats, setRecalculatedStats] = useState(null);
  const [errors, setErrors] = useState([]);

  // Lắng nghe thay đổi project ID từ localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const storedId = localStorage.getItem("current_project_id");
      if (storedId && storedId !== projectId) {
        setProjectId(storedId);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [projectId]);

  // Tải cấu hình hiện tại của dự án
  const fetchConfig = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErrors([]);
    setRecalculatedStats(null);
    try {
      const res = await api.get(`/projects/${projectId}/site-geofence`);
      const data = res.data;
      setCurrentConfig(data);
      if (data.site_latitude !== null && data.site_longitude !== null) {
        setLatitude(String(data.site_latitude));
        setLongitude(String(data.site_longitude));
        setRadiusM(String(data.site_radius_m || ""));
      } else {
        setLatitude("");
        setLongitude("");
        setRadiusM("");
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Không thể tải cấu hình phạm vi công trường";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Lấy vị trí GPS hiện tại từ trình duyệt
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị GPS");
      return;
    }

    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setLatitude(lat);
        setLongitude(lng);
        setDetectingGps(false);
        toast.success(`Đã lấy toạ độ hiện tại: ${lat}, ${lng}`);
      },
      (err) => {
        setDetectingGps(false);
        let msg = "Không thể lấy toạ độ hiện tại";
        if (err.code === 1) msg = "Người dùng từ chối quyền truy cập vị trí";
        else if (err.code === 2) msg = "Không thể xác định vị trí vệ tinh";
        else if (err.code === 3) msg = "Quá thời gian lấy vị trí GPS";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Xác thực đầu vào phía client
  const validateForm = () => {
    const errs = [];
    const numLat = Number(latitude);
    const numLng = Number(longitude);
    const numRad = Number(radiusM);

    if (!latitude.trim()) errs.push("Vĩ độ không được để trống");
    else if (Number.isNaN(numLat) || numLat < -90 || numLat > 90) {
      errs.push("Vĩ độ phải nằm trong khoảng từ -90 đến 90");
    } else if (latitude.includes(".") && latitude.split(".")[1].length > 6) {
      errs.push("Vĩ độ tối đa 6 chữ số thập phân");
    }

    if (!longitude.trim()) errs.push("Kinh độ không được để trống");
    else if (Number.isNaN(numLng) || numLng < -180 || numLng > 180) {
      errs.push("Kinh độ phải nằm trong khoảng từ -180 đến 180");
    } else if (longitude.includes(".") && longitude.split(".")[1].length > 6) {
      errs.push("Kinh độ tối đa 6 chữ số thập phân");
    }

    if (!errs.length && numLat === 0 && numLng === 0) {
      errs.push("Toạ độ (0, 0) không hợp lệ (Null Island)");
    }

    if (!radiusM.trim()) errs.push("Bán kính không được để trống");
    else if (Number.isNaN(numRad) || !Number.isInteger(numRad) || numRad < 1 || numRad > 20000) {
      errs.push("Bán kính phải là số nguyên từ 1 đến 20.000 mét");
    }

    setErrors(errs);
    return errs.length === 0;
  };

  // Lưu cấu hình
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) {
      toast.error("Bạn không có quyền thay đổi cấu hình phạm vi công trường");
      return;
    }
    if (!validateForm()) return;

    setSubmitting(true);
    setErrors([]);
    setRecalculatedStats(null);
    try {
      const res = await api.put(`/projects/${projectId}/site-geofence`, {
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius_m: parseInt(radiusM, 10),
      });

      toast.success("Cập nhật phạm vi công trường thành công!");
      setCurrentConfig(res.data.data);
      setRecalculatedStats(res.data.recalculated);
    } catch (err) {
      const responseErrors = err?.response?.data?.errors;
      if (Array.isArray(responseErrors) && responseErrors.length > 0) {
        setErrors(responseErrors);
      } else {
        const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Lỗi khi lưu phạm vi công trường";
        setErrors([msg]);
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Xóa cấu hình
  const handleDeleteConfig = async () => {
    setSubmitting(true);
    try {
      const res = await api.delete(`/projects/${projectId}/site-geofence`);
      toast.success("Đã xóa cấu hình phạm vi công trường");
      setConfirmDeleteDialogOpen(false);
      setCurrentConfig({
        site_latitude: null,
        site_longitude: null,
        site_radius_m: null,
        site_geofence_updated_at: null,
      });
      setLatitude("");
      setLongitude("");
      setRadiusM("");
      setRecalculatedStats(res.data.recalculated);
    } catch (err) {
      const msg = err?.response?.data?.message || "Không thể xóa cấu hình";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const hasConfig =
    currentConfig &&
    currentConfig.site_latitude !== null &&
    currentConfig.site_longitude !== null;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      {/* ── HEADER ── */}
      <PageHeroBanner
        icon={<MapPin className="size-6 sm:size-8" />}
        title="Phạm vi công trường (Geofence)"
        subtitle="Thiết lập toạ độ tâm và bán kính công trường để phát hiện ảnh hiện trường chụp ngoài phạm vi quy định."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchConfig}
          disabled={loading || submitting}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-xs transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Tải lại
        </Button>
      </PageHeroBanner>

      {!canManage && (
        <div
          data-testid="readonly-permission-notice"
          className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-amber-900 text-xs"
        >
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Chế độ xem: </span>
            Chỉ Chủ đầu tư và Ban quản lý dự án mới có quyền cập nhật toạ độ tâm và bán kính công trường.
          </div>
        </div>
      )}

      {/* Thông báo kết quả tính lại ảnh */}
      {recalculatedStats && (
        <div
          data-testid="recalculated-banner"
          className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-emerald-900 text-xs"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Đã tự động tính lại trạng thái ảnh: </span>
            {recalculatedStats.acceptance_photos} ảnh nghiệm thu, {recalculatedStats.diary_photos} ảnh nhật ký đã được đối chiếu với phạm vi mới.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Form thiết lập toạ độ */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              Thiết lập toạ độ và bán kính
            </CardTitle>
            <CardDescription className="text-xs">
              Nhập toạ độ thập phân GPS (WGS84) và bán kính cho phép (mét).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errors.length > 0 && (
                <div
                  data-testid="form-errors-box"
                  className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs space-y-1"
                >
                  <div className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                    Dữ liệu chưa hợp lệ:
                  </div>
                  <ul className="list-disc list-inside pl-1 space-y-0.5">
                    {errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="input-lat" className="text-xs font-semibold text-slate-700 block mb-1">
                    Vĩ độ tâm (Latitude) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="input-lat"
                    data-testid="input-latitude"
                    type="text"
                    placeholder="VD: 20.845000"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    disabled={!canManage || submitting}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Từ -90.000000 đến 90.000000</p>
                </div>

                <div>
                  <label htmlFor="input-lng" className="text-xs font-semibold text-slate-700 block mb-1">
                    Kinh độ tâm (Longitude) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="input-lng"
                    data-testid="input-longitude"
                    type="text"
                    placeholder="VD: 106.688000"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    disabled={!canManage || submitting}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Từ -180.000000 đến 180.000000</p>
                </div>
              </div>

              <div>
                <label htmlFor="input-radius" className="text-xs font-semibold text-slate-700 block mb-1">
                  Bán kính công trường (mét) <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="input-radius"
                    data-testid="input-radius"
                    type="number"
                    min="1"
                    max="20000"
                    step="1"
                    placeholder="VD: 200"
                    value={radiusM}
                    onChange={(e) => setRadiusM(e.target.value)}
                    disabled={!canManage || submitting}
                    className="max-w-xs"
                  />
                  <span className="text-xs text-slate-600 font-medium">mét</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Từ 1 m đến 20.000 m (20 km)</p>
              </div>

              {/* Nút dùng vị trí GPS hiện tại */}
              {canManage && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="btn-get-current-location"
                    onClick={handleGetCurrentLocation}
                    disabled={detectingGps || submitting}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <Navigation className={`h-3.5 w-3.5 ${detectingGps ? "animate-spin" : "text-blue-600"}`} />
                    {detectingGps ? "Đang lấy toạ độ..." : "Lấy vị trí GPS hiện tại của tôi"}
                  </Button>
                </div>
              )}

              {/* Giải thích dung sai định vị */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-700">Cơ chế tính dung sai tự động: </span>
                  Hệ thống tự động cộng thêm sai số định vị GPS của điện thoại (tối thiểu 30m, tối đa 500m) vào bán kính công trường khi đánh giá tính hợp lệ của ảnh.
                </div>
              </div>

              {/* Nút hành động */}
              {canManage && (
                <div className="flex items-center gap-2.5 pt-3 border-t">
                  <Button
                    type="submit"
                    data-testid="btn-save-geofence"
                    disabled={submitting || loading}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Save className="h-4 w-4" />
                    {submitting ? "Đang lưu..." : "Lưu cấu hình"}
                  </Button>

                  {hasConfig && (
                    <Button
                      type="button"
                      variant="destructive"
                      data-testid="btn-open-delete-dialog"
                      onClick={() => setConfirmDeleteDialogOpen(true)}
                      disabled={submitting || loading}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Trash2 className="h-4 w-4" />
                      Xóa cấu hình
                    </Button>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Cột hiển thị trạng thái hiện tại */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-800">
                Trạng thái cấu hình hiện tại
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {hasConfig ? (
                <>
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold" data-testid="status-badge-active">
                      Đã kích hoạt phạm vi
                    </span>
                  </div>

                  <div className="space-y-1.5 text-slate-700">
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-slate-500">Vĩ độ (Lat):</span>
                      <span className="font-mono font-medium">{Number(currentConfig.site_latitude).toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-slate-500">Kinh độ (Lon):</span>
                      <span className="font-mono font-medium">{Number(currentConfig.site_longitude).toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-slate-500">Bán kính:</span>
                      <span className="font-semibold text-blue-600">{currentConfig.site_radius_m} mét</span>
                    </div>
                    {currentConfig.site_geofence_updated_at && (
                      <div className="flex justify-between border-b pb-1 text-[11px] text-slate-500">
                        <span>Cập nhật lúc:</span>
                        <span>{new Date(currentConfig.site_geofence_updated_at).toLocaleString("vi-VN")}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <a
                      href={`https://www.google.com/maps?q=${currentConfig.site_latitude},${currentConfig.site_longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Xem tâm công trường trên Google Maps ↗
                    </a>
                  </div>
                </>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-center italic">
                  Dự án chưa thiết lập toạ độ tâm và bán kính công trường.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hộp thoại xác nhận xóa cấu hình */}
      <Dialog open={confirmDeleteDialogOpen} onOpenChange={setConfirmDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Xóa cấu hình phạm vi công trường
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa cấu hình toạ độ tâm và bán kính công trường này không?
              Toàn bộ ảnh hiện trường sẽ được cập nhật lại trạng thái thành "Chưa cấu hình tâm" và ghi nhật ký thao tác (audit log).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteDialogOpen(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="btn-confirm-delete-geofence"
              onClick={handleDeleteConfig}
              disabled={submitting}
            >
              {submitting ? "Đang xóa..." : "Xác nhận xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
