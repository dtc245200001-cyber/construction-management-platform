
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Plus, Upload, RefreshCw, Coins } from "lucide-react";

const money = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const initialForm = {
  work_item_id: "",
  amount: "",
  description: "",
  expense_date: new Date().toLocaleDateString("en-CA"),
};

export default function ActualCostsPanel({ projectId }) {
  const [workItems, setWorkItems] = useState([]);

  const [costs, setCosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(
        `/projects/${projectId}/actual-costs`
      );
      setCosts(response.data?.actual_costs || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Không thể tải danh sách chi phí thực tế."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) fetchCosts();
  }, [projectId, fetchCosts]);

  const total = useMemo(
    () => costs.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [costs]
  );

  useEffect(() => {
  if (!projectId) {
    setWorkItems([]);
    return;
  }

  let cancelled = false;

  const fetchWorkItems = async () => {
    try {
      const response = await api.get(
        `/categories/${projectId}/tree/all`
      );

      if (!cancelled) {
        setWorkItems(
          Array.isArray(response.data) ? response.data : []
        );
      }
    } catch (err) {
      if (!cancelled) {
        setWorkItems([]);
        toast.error("Không thể tải danh sách hạng mục WBS");
      }
    }
  };

  fetchWorkItems();

  return () => {
    cancelled = true;
  };
}, [projectId]);
  const eligibleItems = useMemo(() => {
  const parentIds = new Set(
    workItems
      .filter((item) => item.parent_id != null)
      .map((item) => Number(item.parent_id))
  );

  return workItems.filter(
    (item) => !parentIds.has(Number(item.id))
  );
}, [workItems]);

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const saveCost = async (event) => {
    event.preventDefault();

    if (!form.work_item_id || !form.amount || !form.description.trim()) {
      toast.error("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/actual-costs`, {
        work_item_id: Number(form.work_item_id),
        amount: form.amount.trim(),
        description: form.description.trim(),
        expense_date: form.expense_date,
      });

      toast.success("Ghi nhận chi phí thành công.");
      setForm(initialForm);
      await fetchCosts();
    } catch (err) {
      const details = err.response?.data;
      toast.error(
        details?.message || "Không thể ghi nhận chi phí."
      );
    } finally {
      setSaving(false);
    }
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Vui lòng chọn file CSV.");
      event.target.value = "";
      return;
    }

    const payload = new FormData();
    payload.append("file", file);

    setUploading(true);
    try {
      const response = await api.post(
        `/projects/${projectId}/actual-costs/import`,
        payload
      );

      toast.success(
        `Đã nhập ${response.data?.imported ?? 0} khoản chi phí.`
      );
      await fetchCosts();
    } catch (err) {
      const details = err.response?.data;
      const rowErrors = details?.errors;

      const message = Array.isArray(rowErrors)
        ? rowErrors
            .slice(0, 3)
            .map((item) => `Dòng ${item.line}: ${JSON.stringify(item.errors)}`)
            .join("; ")
        : details?.message || "Không thể nhập file CSV.";

      toast.error(message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Chi phí thực tế theo hạng mục WBS
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              S-47 · Ghi nhận chi phí và nhập CSV hàng loạt
            </p>
          </div>

          <button
            type="button"
            onClick={fetchCosts}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Làm mới
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Coins size={18} />
              Tổng chi phí thực tế
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-900">
              {money(total)}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">Số khoản chi</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {costs.length}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form
          onSubmit={saveCost}
          className="space-y-4 rounded-xl border bg-white p-5 shadow-sm"
        >
          <h3 className="flex items-center gap-2 font-semibold">
            <Plus size={18} />
            Ghi nhận chi phí mới
          </h3>

          <label className="block text-sm">
            Hạng mục WBS
            <select
              value={form.work_item_id}
              onChange={(event) =>
                updateField("work_item_id", event.target.value)
              }
              required
              className="mt-1 w-full rounded-lg border p-2"
            >
              <option value="">Chọn hạng mục</option>
              {eligibleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code ? `${item.code} - ` : ""}
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Số tiền (VND)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) =>
                updateField("amount", event.target.value)
              }
              className="mt-1 w-full rounded-lg border p-2"
            />
          </label>

          <label className="block text-sm">
            Nội dung chi phí
            <textarea
              required
              maxLength={2000}
              value={form.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              className="mt-1 w-full rounded-lg border p-2"
              rows={3}
            />
          </label>

          <label className="block text-sm">
            Ngày phát sinh
            <input
              type="date"
              required
              value={form.expense_date}
              onChange={(event) =>
                updateField("expense_date", event.target.value)
              }
              className="mt-1 w-full rounded-lg border p-2"
            />
          </label>

          <button
            type="submit"
            disabled={saving || eligibleItems.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Ghi nhận chi phí"}
          </button>

          {eligibleItems.length === 0 && (
            <p className="text-sm text-amber-700">
              Chưa có hạng mục WBS lá để lựa chọn.
            </p>
          )}
        </form>

        <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold">
            <Upload size={18} />
            Nhập chi phí từ CSV
          </h3>

          <p className="text-sm text-slate-600">
            File CSV cần có các cột:
          </p>

          <code className="block overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">
            work_item_id,amount,description,expense_date
          </code>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={importCsv}
            disabled={uploading}
            className="block w-full text-sm"
          />

          <p className="text-sm text-slate-500">
            Nếu CSV có dữ liệu không hợp lệ, hệ thống sẽ báo lỗi
            và không lưu các dòng trong lần nhập đó.
          </p>

          {uploading && (
            <p className="text-sm text-blue-600">
              Đang nhập dữ liệu...
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <h3 className="font-semibold">Danh sách chi phí thực tế</h3>
        </div>

        {error && (
          <p className="p-4 text-sm text-red-600">{error}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">Hạng mục</th>
                <th className="p-3">Nội dung</th>
                <th className="p-3">Ngày</th>
                <th className="p-3 text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">
                      {item.work_item_name || item.work_item_id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.work_item_code}
                    </div>
                  </td>
                  <td className="p-3">{item.description}</td>
                  <td className="p-3">{item.expense_date}</td>
                  <td className="p-3 text-right font-semibold">
                    {money(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && costs.length === 0 && !error && (
            <p className="p-6 text-center text-sm text-slate-500">
              Chưa có khoản chi phí thực tế.
            </p>
          )}

          {loading && (
            <p className="p-4 text-sm text-slate-500">
              Đang tải dữ liệu...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
