import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../lib/api";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Save,
  Clock,
  Info,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";

const DAYS_CONFIG = [
  { key: "monday", label: "Thứ Hai" },
  { key: "tuesday", label: "Thứ Ba" },
  { key: "wednesday", label: "Thứ Tư" },
  { key: "thursday", label: "Thứ Năm" },
  { key: "friday", label: "Thứ Sáu" },
  { key: "saturday", label: "Thứ Bảy" },
  { key: "sunday", label: "Chủ Nhật" },
];

export default function ProjectCalendarPage() {
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const currentProjectId = localStorage.getItem("currentProjectId") || 1;

  // Calendar State
  const [calendar, setCalendar] = useState({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: false,
  });
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [calendarSuccess, setCalendarSuccess] = useState("");
  const [calendarError, setCalendarError] = useState("");

  // Holidays State
  const [holidays, setHolidays] = useState([]);
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [holidaySuccess, setHolidaySuccess] = useState("");
  const [holidayError, setHolidayError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // Fetch Calendar
  const fetchCalendar = async () => {
    try {
      setCalendarLoading(true);
      setCalendarError("");
      const res = await api.get(`/projects/${currentProjectId}/calendar`);
      if (res.data?.calendar) {
        setCalendar({
          monday: Boolean(res.data.calendar.monday),
          tuesday: Boolean(res.data.calendar.tuesday),
          wednesday: Boolean(res.data.calendar.wednesday),
          thursday: Boolean(res.data.calendar.thursday),
          friday: Boolean(res.data.calendar.friday),
          saturday: Boolean(res.data.calendar.saturday),
          sunday: Boolean(res.data.calendar.sunday),
        });
      }
    } catch (err) {
      console.error("Lỗi tải lịch làm việc:", err);
      setCalendarError(
        err.response?.data?.message || "Không thể tải cấu hình lịch làm việc."
      );
    } finally {
      setCalendarLoading(false);
    }
  };

  // Fetch Holidays
  const fetchHolidays = async () => {
    try {
      setHolidaysLoading(true);
      setHolidayError("");
      const res = await api.get(`/projects/${currentProjectId}/holidays`);
      setHolidays(res.data?.holidays || []);
    } catch (err) {
      console.error("Lỗi tải ngày nghỉ:", err);
      setHolidayError(
        err.response?.data?.message || "Không thể tải danh sách ngày nghỉ."
      );
    } finally {
      setHolidaysLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
    fetchHolidays();
  }, [currentProjectId]);

  // Handle Save Calendar
  const handleSaveCalendar = async (e) => {
    e.preventDefault();
    setSavingCalendar(true);
    setCalendarSuccess("");
    setCalendarError("");

    try {
      const res = await api.put(`/projects/${currentProjectId}/calendar`, calendar);
      setCalendarSuccess(
        res.data?.message || "Cập nhật lịch làm việc thành công. Tiến độ dự án đã được đánh dấu cần tính toán lại."
      );
    } catch (err) {
      console.error("Lỗi cập nhật lịch làm việc:", err);
      setCalendarError(
        err.response?.data?.message || "Không thể lưu lịch làm việc."
      );
    } finally {
      setSavingCalendar(false);
    }
  };

  // Handle Add Holiday
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    setHolidaySuccess("");
    setHolidayError("");

    if (!newDate.trim()) {
      setHolidayError("Vui lòng chọn ngày nghỉ.");
      return;
    }

    if (!newName.trim()) {
      setHolidayError("Vui lòng nhập tên ngày nghỉ.");
      return;
    }

    setAddingHoliday(true);

    try {
      const res = await api.post(`/projects/${currentProjectId}/holidays`, {
        holiday_date: newDate.trim(),
        name: newName.trim(),
      });

      setHolidaySuccess(
        res.data?.message || "Thêm ngày nghỉ thành công. Tiến độ dự án đã được đánh dấu cần tính toán lại."
      );
      setNewDate("");
      setNewName("");
      await fetchHolidays();
    } catch (err) {
      console.error("Lỗi thêm ngày nghỉ:", err);
      setHolidayError(
        err.response?.data?.message || "Không thể thêm ngày nghỉ."
      );
    } finally {
      setAddingHoliday(false);
    }
  };

  // Handle Delete Holiday
  const handleDeleteHoliday = async (holidayId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa ngày nghỉ này không?")) {
      return;
    }

    setHolidaySuccess("");
    setHolidayError("");
    setDeletingId(holidayId);

    try {
      const res = await api.delete(
        `/projects/${currentProjectId}/holidays/${holidayId}`
      );
      setHolidaySuccess(
        res.data?.message || "Đã xóa ngày nghỉ thành công. Tiến độ dự án đã được đánh dấu cần tính toán lại."
      );
      await fetchHolidays();
    } catch (err) {
      console.error("Lỗi xóa ngày nghỉ:", err);
      setHolidayError(
        err.response?.data?.message || "Không thể xóa ngày nghỉ."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatHolidayDate = (dateStr) => {
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy (EEEE)", { locale: vi });
    } catch {
      return dateStr;
    }
  };

  const countWorkingDaysInWeek = Object.values(calendar).filter(Boolean).length;

  return (
    <div className="flex-1 min-h-screen bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-auto">
      <div className="flex-1 flex flex-col p-6 gap-6 max-w-[1200px] mx-auto w-full">
        {/* Header Hero Banner */}
        <div className="relative h-[115px] rounded-2xl overflow-hidden shrink-0 flex items-center p-6 shadow-sm">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80')",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] to-transparent opacity-95" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-5">
              <div className="size-[60px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg border border-white/20">
                <CalendarDays className="size-8 text-white" />
              </div>
              <div>
                <h1 className="text-white text-[28px] font-bold leading-tight">
                  Lịch làm việc & Ngày nghỉ
                </h1>
                <p className="text-white/90 text-[16px] font-medium mt-1">
                  {currentProject
                    ? `Dự án: ${currentProject.name}`
                    : "Cấu hình lịch làm việc và ngày lễ theo dự án"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Informational Banner */}
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-sm">
          <Info className="size-5 shrink-0 text-blue-600" />
          <span>
            Thời lượng công việc được tính dựa trên số ngày làm việc thực tế của công trường.
            Khi thay đổi lịch làm việc hoặc danh sách ngày lễ, hệ thống sẽ đánh dấu tiến độ cần tính toán lại (CPM).
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* SECTION 1: LỊCH LÀM VIỆC TUẦN */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E6EBF3] p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  CẤU HÌNH TUẦN
                </span>
                <h2 className="text-xl font-bold text-gray-900 mt-1">
                  Lịch làm việc tuần
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Chọn các ngày trong tuần công trường hoạt động
                </p>
              </div>
              <div className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                {countWorkingDaysInWeek} ngày / tuần
              </div>
            </div>

            {calendarError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs mb-4">
                <AlertCircle className="size-4 shrink-0" />
                <span>{calendarError}</span>
              </div>
            )}

            {calendarSuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs mb-4">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{calendarSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveCalendar} className="flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                {DAYS_CONFIG.map(({ key, label }) => {
                  const isChecked = calendar[key];
                  return (
                    <label
                      key={key}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? "bg-blue-50/50 border-blue-200 text-gray-900"
                          : "bg-gray-50/70 border-gray-200 text-gray-500"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setCalendar((prev) => ({
                              ...prev,
                              [key]: e.target.checked,
                            }))
                          }
                          disabled={calendarLoading || savingCalendar}
                          className="size-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-semibold">{label}</span>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          isChecked
                            ? "bg-blue-100 text-blue-800 font-semibold"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {isChecked ? "Ngày làm việc" : "Nghỉ"}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="pt-6 mt-4 border-t border-gray-100 flex justify-end">
                <button
                  type="submit"
                  disabled={calendarLoading || savingCalendar}
                  className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Save className="size-4" />
                  {savingCalendar ? "Đang lưu..." : "Lưu lịch làm việc"}
                </button>
              </div>
            </form>
          </div>

          {/* SECTION 2: DANH SÁCH NGÀY LỄ */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E6EBF3] p-6 shadow-sm flex flex-col">
            <div className="border-b border-gray-100 pb-4 mb-5">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                NGÀY NGHỈ ĐẶC BIỆT
              </span>
              <h2 className="text-xl font-bold text-gray-900 mt-1">
                Danh sách ngày nghỉ / ngày lễ
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Khai báo các ngày nghỉ lễ, tết hoặc tạm dừng thi công của dự án
              </p>
            </div>

            {holidayError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs mb-4">
                <AlertCircle className="size-4 shrink-0" />
                <span>{holidayError}</span>
              </div>
            )}

            {holidaySuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs mb-4">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{holidaySuccess}</span>
              </div>
            )}

            {/* Form Thêm Ngày Lễ (Bố cục theo T-12) */}
            <form
              onSubmit={handleAddHoliday}
              className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-5"
            >
              <h3 className="text-xs font-bold text-gray-700 uppercase mb-3 flex items-center gap-1.5">
                <Plus className="size-3.5 text-blue-600" />
                Thêm ngày nghỉ mới
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Ngày nghỉ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    disabled={addingHoliday}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Tên ngày nghỉ / lễ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nghỉ Tết Dương Lịch"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={addingHoliday}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <button
                  type="submit"
                  disabled={addingHoliday || !newDate || !newName.trim()}
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Plus className="size-3.5" />
                  {addingHoliday ? "Đang thêm..." : "Thêm ngày nghỉ"}
                </button>
              </div>
            </form>

            {/* Bảng Danh sách ngày nghỉ */}
            <div className="flex-1 flex flex-col">
              <h3 className="text-xs font-bold text-gray-700 uppercase mb-2">
                Các ngày nghỉ đã khai báo ({holidays.length})
              </h3>

              <div className="overflow-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs font-semibold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Ngày nghỉ</th>
                      <th className="px-4 py-3">Tên ngày nghỉ</th>
                      <th className="px-4 py-3 text-center w-[90px]">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {holidaysLoading ? (
                      <tr>
                        <td colSpan="3" className="p-8 text-center text-gray-400">
                          Đang tải danh sách ngày nghỉ...
                        </td>
                      </tr>
                    ) : holidays.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="p-8 text-center text-gray-400">
                          Chưa có ngày nghỉ nào được khai báo cho dự án này.
                        </td>
                      </tr>
                    ) : (
                      holidays.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                            {formatHolidayDate(item.holiday_date)}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700">
                            {item.name}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => handleDeleteHoliday(item.id)}
                              disabled={deletingId === item.id}
                              title="Xóa ngày nghỉ"
                              className="size-8 rounded-lg text-red-500 hover:bg-red-50 inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
