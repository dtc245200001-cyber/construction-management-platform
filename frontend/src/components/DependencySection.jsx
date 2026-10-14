import { useMemo, useState } from "react";
import api from "../lib/api";

const TYPES = [
  { value: "FS", label: "FS – Xong việc trước mới bắt đầu việc này (Tuần tự)" },
  { value: "SS", label: "SS – Cùng bắt đầu với việc trước (Song song)" },
  { value: "FF", label: "FF – Cùng kết thúc với việc trước" },
  { value: "SF", label: "SF – Việc trước bắt đầu thì việc này kết thúc (Hiếm dùng)" },
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
  const [successMsg, setSuccessMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Ô chọn việc trước: lọc theo tên khi gõ, bỏ chính nó
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => {
        const tId = t.task_id ?? (typeof t.id === "string" && t.id.startsWith("task-") ? Number(t.id.replace("task-", "")) : Number(t.id));
        return tId !== taskId && t.name.toLowerCase().includes(q);
      })
      .map((t) => ({
        ...t,
        task_id: t.task_id ?? (typeof t.id === "string" && t.id.startsWith("task-") ? Number(t.id.replace("task-", "")) : Number(t.id))
      }));
  }, [tasks, taskId, query]);

  const selectedCandidate = useMemo(() => {
    return candidates.find((c) => c.task_id === predId);
  }, [candidates, predId]);

  const handleAdd = async () => {
    setError("");
    setSuccessMsg("");
    if (!predId) return setError("Hãy chọn một công việc trước khi thêm quan hệ.");
    if (!Number.isInteger(Number(lag)))
      return setError("Độ trễ phải là số nguyên (được âm).");
    // báo trùng cặp ngay, không đợi server
    if (dependencies.some((d) => d.predecessor_id === predId))
      return setError("Quan hệ giữa hai công việc này đã có.");

    const predName = selectedCandidate?.name || "công việc";
    const lagText = Number(lag) === 0 ? "không độ trễ" : `độ trễ ${lag} ngày`;

    if (isCreateMode) {
      onAddPendingDependency({
        id: Date.now(), // Fake ID
        predecessor_id: predId,
        predecessor_name: predName,
        dependency_type: type,
        lead_lag_days: Number(lag),
      });
      setSuccessMsg(`Đã thêm quan hệ: "${predName}" (${type}, ${lagText})`);
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
      setSuccessMsg(`Đã thêm quan hệ: "${predName}" (${type}, ${lagText})`);
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
      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#0F1B3D' }}>
        Công việc phải làm trước (Ràng buộc phụ thuộc)
      </label>

      {/* THÔNG BÁO THÀNH CÔNG NGAY TRÊN VỀ MỐI QUAN HỆ VỪA LƯU */}
      {successMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ECFDF5',
          border: '1.5px solid #10B981',
          color: '#065F46',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '13.5px',
          fontWeight: '500',
          marginBottom: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px', color: '#10B981', fontWeight: 'bold' }}>✓</span>
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg("")}
            style={{ background: 'none', border: 'none', color: '#065F46', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: 0 }}
            title="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

      {/* DANH SÁCH QUAN HỆ HIỆN CÓ */}
      {dependencies.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {dependencies.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: '600', color: '#0F1B3D' }}>{d.predecessor_name}</span>
                <span style={{
                  backgroundColor: '#E0E7FF',
                  color: '#3730A3',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {d.dependency_type}
                </span>
                <span style={{ color: '#64748B', fontSize: '12px' }}>
                  {Number(d.lead_lag_days) === 0 ? "không độ trễ" : `độ trễ ${d.lead_lag_days} ngày`}
                </span>
              </div>
              {isCreateMode && (
                <button
                  type="button"
                  onClick={() => onRemovePendingDependency(d.id)}
                  style={{ color: '#EF4444', cursor: 'pointer', border: 'none', background: 'none', fontSize: '12px', fontWeight: '500', padding: 0 }}
                >
                  Xóa
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '12.5px', color: '#94A3B8', marginBottom: '8px', fontStyle: 'italic' }}>
          (Chưa có quan hệ công việc nào được gán)
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
        {/* Ô TÌM KIẾM */}
        <input
          placeholder="Gõ để tìm công việc trước..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPredId(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13.5px' }}
        />

        {/* THÔNG BÁO CÔNG VIỆC ĐANG ĐƯỢC CHỌN */}
        {selectedCandidate && (
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#EFF6FF',
            border: '1.5px solid #3B82F6',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: '#1D4ED8'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: '700' }}>Đang chọn việc:</span>
              <span style={{ fontWeight: '600' }}>{selectedCandidate.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setPredId(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#DC2626',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                padding: 0
              }}
            >
              (Bỏ chọn)
            </button>
          </div>
        )}

        {/* DANH SÁCH CHỌN CÔNG VIỆC TRƯỚC VỚI MÀU NỔI BẬT RÕ RÀNG */}
        <div
          style={{
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            maxHeight: '150px',
            overflowY: 'auto',
            backgroundColor: '#F8FAFC',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          {candidates.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
              {query ? "Không tìm thấy công việc phù hợp với từ khóa" : "Chưa có công việc nào khác trong dự án"}
            </div>
          ) : (
            candidates.map((t) => {
              const isSelected = predId === t.task_id;
              return (
                <div
                  key={t.task_id}
                  onClick={() => {
                    setPredId(isSelected ? null : t.task_id);
                    setError("");
                    setSuccessMsg("");
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    color: isSelected ? '#1D4ED8' : '#1E293B',
                    fontWeight: isSelected ? '700' : '400',
                    transition: 'all 0.15s ease-in-out',
                    boxShadow: isSelected ? '0 1px 3px rgba(37,99,235,0.15)' : 'none'
                  }}
                >
                  <span style={{ fontSize: '13.5px' }}>{t.name}</span>
                  {isSelected ? (
                    <span style={{
                      fontSize: '11.5px',
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: '700',
                      letterSpacing: '0.2px'
                    }}>
                      ✓ Đã chọn
                    </span>
                  ) : (
                    <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>Bấm để chọn</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* LOẠI QUAN HỆ VÀ ĐỘ TRỄ */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ flex: 1, minWidth: '220px', height: '38px', padding: '0 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#fff' }}
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '13px', color: '#475569', whiteSpace: 'nowrap', margin: 0 }}>Độ trễ:</label>
            <input
              type="number"
              step="1"
              value={lag}
              onChange={(e) => setLag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              style={{ width: '70px', height: '38px', padding: '0 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13.5px' }}
            />
            <span style={{ fontSize: '13px', color: '#475569' }}>ngày</span>
          </div>
        </div>

        {/* LỖI NẾU CÓ */}
        {error && <div className="task-form-error">{error}</div>}

        {/* NÚT THÊM QUAN HỆ */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          style={{
            alignSelf: 'flex-start',
            padding: '0 18px',
            height: '38px',
            backgroundColor: '#1F63E0',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13.5px',
            fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'background-color 0.2s',
            marginTop: '2px'
          }}
        >
          {saving ? "Đang thêm..." : "+ Thêm quan hệ"}
        </button>
      </div>
    </div>
  );
}