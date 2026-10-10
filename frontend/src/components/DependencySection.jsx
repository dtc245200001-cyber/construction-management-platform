import { useMemo, useState } from "react";
import api from "../lib/api";

const TYPES = [
  { value: "FS", label: "FS – Kết thúc → Bắt đầu" },
  { value: "SS", label: "SS – Bắt đầu → Bắt đầu" },
  { value: "FF", label: "FF – Kết thúc → Kết thúc" },
  { value: "SF", label: "SF – Bắt đầu → Kết thúc" },
];

export default function DependencySection({
  projectId, taskId, tasks, dependencies, onChanged,
  isCreateMode, onAddPendingDependency, onRemovePendingDependency
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

    if (isCreateMode) {
      onAddPendingDependency({
        id: Date.now(), // Fake ID
        predecessor_id: predId,
        predecessor_name: candidates.find((c) => c.task_id === predId)?.name || "",
        dependency_type: type,
        lead_lag_days: Number(lag),
      });
      setPredId(null); setQuery(""); setLag("0"); setType("FS");
      return;
    }

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
          <li key={d.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {d.predecessor_name} · {d.dependency_type} · {d.lead_lag_days} ngày
            {isCreateMode && (
              <button 
                type="button" 
                onClick={() => onRemovePendingDependency(d.id)}
                style={{ color: 'red', cursor: 'pointer', border: 'none', background: 'none', fontSize: '12px', padding: 0 }}
              >
                (Xóa)
              </button>
            )}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
        <input
          placeholder="Gõ để tìm công việc..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPredId(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          style={{ width: '100%', height: '40px', padding: '0 14px', borderRadius: '8px', border: '1px solid #E6EBF3', fontSize: '14px' }}
        />
        <select
          size={5}
          value={predId ?? ""}
          onChange={(e) => setPredId(Number(e.target.value))}
          style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #E6EBF3', fontSize: '14px', backgroundColor: '#fff', minHeight: '120px' }}
        >
          {candidates.map((t) => (
            <option key={t.task_id} value={t.task_id} style={{ padding: '6px 8px', cursor: 'pointer' }}>{t.name}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value)}
            style={{ flex: 1, minWidth: '180px', height: '40px', padding: '0 14px', borderRadius: '8px', border: '1px solid #E6EBF3', fontSize: '14px', backgroundColor: '#fff' }}
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '14px', color: '#475569', whiteSpace: 'nowrap', margin: 0 }}>Độ trễ:</label>
            <input
              type="number"
              step="1"
              value={lag}
              onChange={(e) => setLag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              style={{ width: '80px', height: '40px', padding: '0 10px', borderRadius: '8px', border: '1px solid #E6EBF3', fontSize: '14px' }}
            />
            <span style={{ fontSize: '14px', color: '#475569' }}>ngày</span>
          </div>
        </div>

        {error && <div className="task-form-error">{error}</div>}
        
        <button 
          type="button" 
          onClick={handleAdd} 
          disabled={saving}
          style={{ 
            alignSelf: 'flex-start',
            padding: '0 20px', 
            height: '40px',
            backgroundColor: '#1F63E0', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px', 
            fontSize: '14px', 
            fontWeight: '600', 
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'background-color 0.2s'
          }}
        >
          {saving ? "Đang thêm..." : "+ Thêm quan hệ"}
        </button>
      </div>
    </div>
  );
}