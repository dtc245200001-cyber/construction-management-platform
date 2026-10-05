import { useMemo, useState } from "react";
// import api ... (copy từ WBSPage)

const TYPES = [
  { value: "FS", label: "FS – Kết thúc → Bắt đầu" },
  { value: "SS", label: "SS – Bắt đầu → Bắt đầu" },
  { value: "FF", label: "FF – Kết thúc → Kết thúc" },
  { value: "SF", label: "SF – Bắt đầu → Kết thúc" },
];

export default function DependencySection({
  projectId, taskId, tasks, dependencies, onChanged,
}) {
  const [query, setQuery] = useState("");
  const [predId, setPredId] = useState(null);
  const [type, setType] = useState("FS");
  const [lag, setLag] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Ô chọn việc trước: lọc theo tên khi gõ, bỏ chính nó
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(
      (t) => t.task_id !== taskId && t.name.toLowerCase().includes(q)
    );
  }, [tasks, taskId, query]);

  const handleAdd = async () => {
    setError("");
    if (!predId) return setError("Hãy chọn công việc trước.");
    if (!Number.isInteger(Number(lag)))
      return setError("Độ trễ phải là số nguyên (được âm).");
    // báo trùng cặp ngay, không đợi server
    if (dependencies.some((d) => d.predecessor_id === predId))
      return setError("Quan hệ giữa hai công việc này đã có.");

    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/dependencies`, {
        predecessor_id: predId,
        successor_id: taskId,
        dependency_type: type,
        lead_lag_days: Number(lag),
      });
      setPredId(null); setQuery(""); setLag("0"); setType("FS");
      onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Không thể thêm quan hệ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="task-form-group">
      <label>Công việc phải làm trước</label>

      <ul>
        {dependencies.map((d) => (
          <li key={d.id}>
            {d.predecessor_name} · {d.dependency_type} · {d.lead_lag_days} ngày
          </li>
        ))}
      </ul>

      <input
        placeholder="Gõ để tìm công việc..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPredId(null); }}
      />
      <select
        size={5}
        value={predId ?? ""}
        onChange={(e) => setPredId(Number(e.target.value))}
      >
        {candidates.map((t) => (
          <option key={t.task_id} value={t.task_id}>{t.name}</option>
        ))}
      </select>

      <select value={type} onChange={(e) => setType(e.target.value)}>
        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      <input type="number" step="1" value={lag}
             onChange={(e) => setLag(e.target.value)} />

      {error && <div className="task-form-error">{error}</div>}
      <button type="button" onClick={handleAdd} disabled={saving}>
        {saving ? "Đang thêm..." : "Thêm quan hệ"}
      </button>
    </div>
  );
}