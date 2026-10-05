import { useEffect, useState } from "react";
import "./TaskForm.css";
import api from "../lib/api";
import DependencySection from "./DependencySection";
// import api ... (giống WBSPage)
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deps, setDeps] = useState([]);

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

    // Kiểm tra thời lượng
    if (!Number.isInteger(duration) || duration <= 0) {
      setError("Thời lượng phải là số nguyên lớn hơn 0.");
      return;
    }

    setLoading(true);

    try {
      const url = isEdit
        ? `/api/projects/${projectId}/tasks/${task.id}`
        : `/api/projects/${projectId}/tasks`;

      const response = await fetch(url, {
        method: isEdit ? "PUT" : "POST",

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify({
          ...(isEdit
            ? {}
            : {
                work_item_id: Number(workItemId),
              }),

          name: name.trim(),

          duration_days: duration,
        }),
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            "Không thể lưu công việc."
        );
      }

      // Thành công
      if (onSuccess) {
        onSuccess(data);
      }
    } catch (err) {
      console.error("Task form error:", err);

      setError(
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
            />

            <span>ngày</span>

          </div>

          <small>
            Nhập số ngày dự kiến hoàn thành công việc.
          </small>

        </div>
                {isEdit && (
          <DependencySection
            projectId={projectId}
            taskId={task.id}
            tasks={allTasks}
            dependencies={deps}
            onChanged={loadDeps}
          />
        )}

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
            disabled={loading || (!isEdit && !workItemId)}
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