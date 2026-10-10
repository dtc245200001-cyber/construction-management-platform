import { useEffect, useState } from "react";
import "./TaskForm.css";
import api from "../lib/api";
import DependencySection from "./DependencySection";

const DURATION_ERROR = "Thời lượng phải là số nguyên lớn hơn 0.";

// Thời lượng hợp lệ: số nguyên dương (> 0)
const isValidDuration = (value) =>
  String(value).trim() !== "" &&
  Number.isInteger(Number(value)) &&
  Number(value) > 0;
function TaskForm({
  projectId,
  workItem = null,
  task = null,
  allTasks = [], 
  onSuccess,
  onClose,
}) {
  const isEdit = Boolean(task);

  const [workItemId, setWorkItemId] = useState(
    task?.work_item_id
      ? String(task.work_item_id)
      : workItem?.id
        ? String(workItem.id)
        : ""
  );

  const [name, setName] = useState(task?.name || "");

  const [durationDays, setDurationDays] = useState(
    task?.duration_days ? String(task.duration_days) : "1"
  );

  const [schedulingMode, setSchedulingMode] = useState(
    task?.scheduling_mode || "auto"
  );

  const [manualStartDate, setManualStartDate] = useState(
    task?.manual_start_date ? String(task.manual_start_date).substring(0, 10) : ""
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deps, setDeps] = useState([]);
  const [pendingDeps, setPendingDeps] = useState([]);

  // Kiểm tra tức thì mỗi lần gõ, không đợi bấm Lưu
  const durationInvalid = !isValidDuration(durationDays);

  const loadDeps = async () => {
    if (!task?.id) return;
    try {
      const res = await api.get(
        `/projects/${projectId}/tasks/${task.id}/dependencies`
      );
      setDeps(res.data.dependencies);
    } catch (err) {
      console.error("Không tải được quan hệ:", err);
    }
  };

  useEffect(() => {
    if (isEdit) loadDeps();
  }, [isEdit, task?.id]);

  // Khi người dùng bấm dấu + ở hạng mục khác
  // thì cập nhật lại hạng mục cho form.
  useEffect(() => {
    if (!isEdit && workItem?.id) {
      setWorkItemId(String(workItem.id));
    }
  }, [workItem, isEdit]);

  // Khi sửa công việc
  useEffect(() => {
    if (task) {
      setWorkItemId(
        task.work_item_id ? String(task.work_item_id) : ""
      );

      setName(task.name || "");

      setDurationDays(
        task.duration_days ? String(task.duration_days) : "1"
      );

      setSchedulingMode(task.scheduling_mode || "auto");
      setManualStartDate(task.manual_start_date ? String(task.manual_start_date).substring(0, 10) : "");
    }
  }, [task]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    const duration = Number(durationDays);

    // Kiểm tra hạng mục khi tạo mới
    if (!isEdit && !workItemId) {
      setError("Vui lòng chọn hạng mục.");
      return;
    }

    // Kiểm tra tên
    if (!name.trim()) {
      setError("Vui lòng nhập tên công việc.");
      return;
    }

    if (schedulingMode === 'manual' && !manualStartDate) {
      setError("Vui lòng chọn ngày bắt đầu khi dùng chế độ thủ công.");
      return;
    }

    // Kiểm tra thời lượng (lỗi đã hiển thị tức thì dưới ô nhập)
    if (durationInvalid) {
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...(isEdit ? {} : { work_item_id: Number(workItemId) }),
        name: name.trim(),
        duration_days: duration,
        scheduling_mode: schedulingMode,
        ...(schedulingMode === 'manual' ? { manual_start_date: manualStartDate } : {}),
      };

      const response = isEdit
        ? await api.put(`/projects/${projectId}/tasks/${task.id}`, payload)
        : await api.post(`/projects/${projectId}/tasks`, payload);

      if (!isEdit && pendingDeps.length > 0) {
        const newTaskId = response.data.task.id;
        for (const dep of pendingDeps) {
          try {
            await api.post(`/projects/${projectId}/dependencies`, {
              predecessor_id: dep.predecessor_id,
              successor_id: newTaskId,
              dependency_type: dep.dependency_type,
              lead_lag_days: dep.lead_lag_days,
            });
          } catch (depErr) {
            console.error("Failed to add dependency:", depErr);
          }
        }
      }

      // Thành công
      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      console.error("Task form error:", err);

      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Đã xảy ra lỗi khi lưu công việc."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="task-form-card">

      {/* HEADER */}
      <div className="task-form-header">

        <div>
          <span className="task-form-label">
            {isEdit
              ? "CHỈNH SỬA CÔNG VIỆC"
              : "CÔNG VIỆC MỚI"}
          </span>

          <h2>
            {isEdit
              ? "Cập nhật công việc"
              : "Thêm công việc"}
          </h2>

          <p>
            {isEdit
              ? "Cập nhật thông tin công việc trong dự án."
              : "Nhập thông tin để tạo một công việc mới cho dự án."}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            className="task-form-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ×
          </button>
        )}

      </div>

      {/* FORM */}
      <form onSubmit={handleSubmit}>

        {/* HẠNG MỤC */}
        {!isEdit && (
          <div className="task-form-group">

            <label htmlFor="workItem">
              Hạng mục <span>*</span>
            </label>

            <select
              id="workItem"
              value={workItemId}
              disabled
            >
              {workItem?.id ? (
                <option value={String(workItem.id)}>
                  {workItem.name}
                </option>
              ) : (
                <option value="">
                  -- Chưa chọn hạng mục --
                </option>
              )}
            </select>

            {workItem?.name && (
              <small>
                Công việc sẽ được tạo trong hạng mục:{" "}
                <strong>{workItem.name}</strong>
              </small>
            )}

          </div>
        )}

        {/* TÊN CÔNG VIỆC */}
        <div className="task-form-group">

          <label htmlFor="taskName">
            Tên công việc <span>*</span>
          </label>

          <input
            id="taskName"
            type="text"
            maxLength={255}
            placeholder="Ví dụ: Thi công móng công trình"
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            disabled={loading}
            autoComplete="off"
          />

        </div>

        {/* THỜI LƯỢNG */}
        <div className="task-form-group">

          <label htmlFor="durationDays">
            Thời lượng <span>*</span>
          </label>

          <div className="task-duration-input">

            <input
              id="durationDays"
              type="number"
              min="1"
              step="1"
              placeholder="1"
              value={durationDays}
              onChange={(e) =>
                setDurationDays(e.target.value)
              }
              disabled={loading}
              aria-invalid={durationInvalid}
              aria-describedby="durationDaysHint"
              style={durationInvalid ? { borderColor: "#dc2626" } : undefined}
            />

            <span>ngày</span>

          </div>

          {durationInvalid ? (
            <small id="durationDaysHint" role="alert" style={{ color: "#dc2626" }}>
              {DURATION_ERROR}
            </small>
          ) : (
            <small id="durationDaysHint">
              Nhập số ngày dự kiến hoàn thành công việc.
            </small>
          )}

        </div>

        {/* LÊN LỊCH */}
        <div className="task-form-group">
          <label>Chế độ xếp lịch</label>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>
              <input type="radio" name="schedulingMode" value="auto" checked={schedulingMode === 'auto'} onChange={(e) => setSchedulingMode(e.target.value)} disabled={loading} style={{ margin: 0 }} />
              Tự động (CPM)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>
              <input type="radio" name="schedulingMode" value="manual" checked={schedulingMode === 'manual'} onChange={(e) => setSchedulingMode(e.target.value)} disabled={loading} style={{ margin: 0 }} />
              Thủ công (Cố định ngày)
            </label>
          </div>
          {schedulingMode === 'manual' && (
            <div style={{ marginTop: '12px' }}>
              <label htmlFor="manualStartDate">Ngày bắt đầu <span>*</span></label>
              <input type="date" id="manualStartDate" value={manualStartDate} onChange={(e) => setManualStartDate(e.target.value)} disabled={loading} style={{ width: '100%', height: '44px', padding: '0 14px', borderRadius: '12px', border: '1px solid #E6EBF3', fontSize: '14px' }} />
              <small style={{ marginTop: '4px', display: 'block' }}>Công việc này sẽ bị khóa ngày bắt đầu bất chấp các quan hệ trước đó.</small>
            </div>
          )}
        </div>

        <DependencySection
          projectId={projectId}
          taskId={isEdit ? task.id : null}
          tasks={allTasks}
          dependencies={isEdit ? deps : pendingDeps}
          onChanged={loadDeps}
          isCreateMode={!isEdit}
          onAddPendingDependency={(dep) => setPendingDeps(prev => [...prev, dep])}
          onRemovePendingDependency={(id) => setPendingDeps(prev => prev.filter(d => d.id !== id))}
        />

        {/* ERROR */}
        {error && (
          <div className="task-form-error">
            {error}
          </div>
        )}

        {/* BUTTONS */}
        <div className="task-form-actions">

          {onClose && (
            <button
              type="button"
              className="task-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Hủy
            </button>
          )}

          <button
            type="submit"
            className="task-btn-submit"
            disabled={loading || durationInvalid || (!isEdit && !workItemId)}
          >
            {loading
              ? "Đang lưu..."
              : isEdit
                ? "Lưu thay đổi"
                : "Thêm công việc"}
          </button>

        </div>

      </form>
    </div>
  );
}

export default TaskForm;