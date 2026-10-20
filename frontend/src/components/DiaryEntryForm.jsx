import React, { useState, useEffect, useRef } from "react";

import api from "../lib/api";

import {
  createDiaryEntry,
  getDiaryEntryById,
  getDiaryEntryWithImages,
  validateImage,
  isBlob,
} from "../lib/diaryDb";
import { requestDiarySync } from "../services/diarySync";

import { X, AlertCircle, Save, RotateCcw, Camera, Image as ImageIcon } from "lucide-react";

import { format, parseISO, isAfter, addMinutes } from "date-fns";
import { resolveWorkItemId } from "../utils/diaryUtils";

const ALLOWED_ROLES = [
  "ky_su_giam_sat",
  "chi_huy_truong",
  "ban_quan_ly",
  "doi_truong",
  "system_admin",
];

function draftMatchesDiaryEntry(draft, entry) {
  if (
    !draft?.client_id ||
    String(draft.client_id) !== String(entry?.client_id || entry?.id)
  ) {
    return false;
  }
  const draftContent =
    typeof draft.content === "string" ? draft.content.trim() : "";
  const entryContent =
    typeof entry?.content === "string" ? entry.content.trim() : "";
  if (draftContent !== entryContent) {
    return false;
  }

  const draftWorkItemId = Number(draft.work_item_id);
  const entryWorkItemId = Number(entry.work_item_id ?? entry.workItemId);
  if (
    Number.isInteger(draftWorkItemId) &&
    Number.isInteger(entryWorkItemId) &&
    draftWorkItemId !== entryWorkItemId
  ) {
    return false;
  }

  const draftEntryAt = Date.parse(draft.entry_at || "");
  const entryAt = Date.parse(entry.entry_at || entry.entryAt || "");
  return (
    !Number.isFinite(draftEntryAt) ||
    !Number.isFinite(entryAt) ||
    draftEntryAt === entryAt
  );
}

function removeDraftIfMatchesEntry(draftKey, entry) {
  try {
    const savedDraft = JSON.parse(localStorage.getItem(draftKey) || "null");
    if (draftMatchesDiaryEntry(savedDraft, entry)) {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore unavailable local storage.
  }
}

export default function DiaryEntryForm({
  projectId,
  user,
  projectRole: projectRoleProp = null,
  initialCategories = [],
  onClose,
  onSuccess,
}) {
  // Ưu tiên vai trò trong dự án (membership). Nếu chưa truyền thì fallback về vai trò
  // hệ thống của user (nếu là 'khach' thì tự động bị từ chối vì không nằm trong ALLOWED_ROLES).
  const effectiveRole = projectRoleProp != null ? projectRoleProp : user?.role;
  const canWrite = ALLOWED_ROLES.includes(effectiveRole);

  const draftKey = `diary_draft_${projectId}`;

  const [categories, setCategories] = useState(
    Array.isArray(initialCategories) && initialCategories.length > 0
      ? initialCategories
      : () => {
          try {
            const cached = JSON.parse(
              localStorage.getItem(`categories_${projectId}`) || "[]"
            );
            return Array.isArray(cached) ? cached : [];
          } catch {
            return [];
          }
        }
  );

  const [categoriesLoading, setCategoriesLoading] = useState(
    categories.length === 0
  );

  const [clientId, setClientId] = useState("");

  const [workItemId, setWorkItemId] = useState("");

  const [entryAt, setEntryAt] = useState("");

  const [content, setContent] = useState("");

  const [search, setSearch] = useState("");

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef(null);

  const [errors, setErrors] = useState({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitMessage, setSubmitMessage] = useState(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const savedClientIdsRef = useRef(new Set());

  const [selectedImages, setSelectedImages] = useState([]);
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    return () => {
      selectedImages.forEach((img) => {
        if (img.previewUrl && img.previewUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(img.previewUrl);
          } catch {
            /* ignore */
          }
        }
      });
    };
  }, [selectedImages]);

  const handleImageChange = (e) => {
    setImageError("");
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (selectedImages.length + files.length > 10) {
      setImageError("Chỉ được đính kèm tối đa 10 ảnh.");
      return;
    }

    const newImages = [];
    for (const f of files) {
      try {
        validateImage({ blob: f });
        const previewUrl = URL.createObjectURL(f);
        newImages.push({
          id: crypto.randomUUID(),
          file: f,
          name: f.name,
          size: f.size,
          previewUrl,
        });
      } catch (valErr) {
        setImageError(valErr.message || "Ảnh không hợp lệ.");
        return;
      }
    }

    setSelectedImages((prev) => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (imgId) => {
    setSelectedImages((prev) => {
      const target = prev.find((img) => img.id === imgId);
      if (target?.previewUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return prev.filter((img) => img.id !== imgId);
    });
  };

  useEffect(() => {
    if (!canWrite) return;

    api
      .get(`/categories/${projectId}/tree/all`)
      .then((res) => {
        const data = res.data || [];
        setCategories(data);
        setCategoriesLoading(false);
        try {
          localStorage.setItem(`categories_${projectId}`, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      })
      .catch((err) => {
        console.warn("Không thể tải cây hạng mục (có thể đang ngoại tuyến):", err?.message || err);
        setCategoriesLoading(false);
        // Fallback đọc từ cache nếu hiện tại chưa có
        try {
          const cached = JSON.parse(
            localStorage.getItem(`categories_${projectId}`) || "[]"
          );
          if (Array.isArray(cached) && cached.length > 0) {
            setCategories(cached);
          }
        } catch {
          /* ignore */
        }
      });

    let cancelled = false;
    setDraftLoaded(false);
    const initializeDraft = async () => {
      let draft = null;
      try {
        draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      } catch {
        draft = null;
      }

      const hasDraftContent = Boolean(
        draft?.work_item_id || draft?.content?.trim(),
      );
      let savedEntry = null;
      if (hasDraftContent && draft?.client_id) {
        try {
          savedEntry = await getDiaryEntryById(draft.client_id);
        } catch (error) {
          console.warn("Không thể đối chiếu bản nháp với nhật ký cục bộ:", error);
        }
      }

      if (cancelled) return;
      const isAlreadySaved =
        savedEntry && draftMatchesDiaryEntry(draft, savedEntry);
      if (hasDraftContent && !isAlreadySaved) {
        setWorkItemId(draft.work_item_id || "");
        setEntryAt(draft.entry_at || format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setContent(draft.content || "");
        setClientId(draft.client_id || crypto.randomUUID());
        setSubmitMessage({
          type: "warning",
          text: "Đang có bản nháp chưa gửi.",
        });
      } else {
        if (isAlreadySaved) {
          removeDraftIfMatchesEntry(draftKey, savedEntry);
        }
        setWorkItemId("");
        setEntryAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setContent("");
        setClientId(crypto.randomUUID());
        setSubmitMessage(null);
      }
      setDraftLoaded(true);
    };
    initializeDraft();

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [projectId, canWrite, draftKey]);

  useEffect(() => {
    if (!canWrite || !draftLoaded) return;

    const draft = {
      work_item_id: workItemId,

      entry_at: entryAt,

      content,

      client_id: clientId,
    };

    try {
      if (workItemId || content) {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch (e) {
      // ignore
    }
  }, [workItemId, entryAt, content, clientId, draftKey, canWrite, draftLoaded]);

  useEffect(() => {
    const handleSyncUpdate = async () => {
      const savedIds = [...savedClientIdsRef.current];
      if (savedIds.length === 0) return;
      let entries;
      try {
        entries = (await Promise.all(savedIds.map(getDiaryEntryById))).filter(Boolean);
      } catch (error) {
        console.error("Không thể xác nhận trạng thái nhật ký đã lưu:", error);
        return;
      }
      if (entries.some((entry) => entry.syncStatus === "failed")) {
        const failedEntry = entries.find((entry) => entry.syncStatus === "failed");
        setSubmitMessage({
          type: "warning",
          text: `Đồng bộ chưa hoàn tất; hệ thống sẽ tự thử lại. ${failedEntry.syncError || ""}`.trim(),
        });
      } else if (entries.length > 0 && entries.every((entry) => entry.syncStatus === "synced")) {
        setSubmitMessage({
          type: "success",
          text: "Nhật ký đã được đồng bộ thành công.",
        });
      } else {
        setSubmitMessage({
          type: "warning",
          text: "Đã lưu trên thiết bị — chờ đồng bộ. Dữ liệu vẫn được giữ để thử lại.",
        });
      }
    };
    window.addEventListener("diary-sync-updated", handleSyncUpdate);
    return () => window.removeEventListener("diary-sync-updated", handleSyncUpdate);
  }, [draftKey]);

  const validate = (field, value) => {
    let err = "";

    if (field === "workItemId") {
      if (value === null || value === undefined || value === "") {
        err = "Vui lòng chọn hạng mục";
      } else {
        const resolved = resolveWorkItemId(value, categories);
        if (!resolved) {
          err = "Hạng mục hoặc công việc không hợp lệ";
        }
      }
    }

    if (field === "content") {
      const trimmed = (value || "").trim();

      if (!trimmed) err = "Vui lòng nhập nội dung";
      else if (trimmed.length > 5000) err = "Nội dung tối đa 5000 ký tự";
    }

    if (field === "entryAt") {
      if (!value) {
        err = "Vui lòng chọn thời gian";
      } else {
        const dt = parseISO(value);

        if (isAfter(dt, addMinutes(new Date(), 10))) {
          err = "Thời gian không vượt quá 10 phút trong tương lai";
        }
      }
    }

    return err;
  };

  const handleBlur = (field, value) => {
    const err = validate(field, value);

    setErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    const wErr = validate("workItemId", workItemId);
    const cErr = validate("content", content);
    const dErr = validate("entryAt", entryAt);

    setErrors({ workItemId: wErr, content: cErr, entryAt: dErr });
    if (wErr || cErr || dErr) return;

    const resolvedWorkItemId = resolveWorkItemId(workItemId, categories);
    if (!resolvedWorkItemId || !Number.isInteger(resolvedWorkItemId) || resolvedWorkItemId <= 0) {
      setErrors((prev) => ({
        ...prev,
        workItemId: !workItemId ? "Vui lòng chọn hạng mục" : "Hạng mục hoặc công việc không hợp lệ",
      }));
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);
    let serverRequestCompleted = false;

    const clientUuid = clientId || crypto.randomUUID();
    if (!clientId) setClientId(clientUuid);

    const payload = {
      work_item_id: resolvedWorkItemId,
      content: content.trim(),
      client_id: clientUuid,
      entry_at: new Date(entryAt).toISOString(),
    };

    const selectedCategory = categories.find(
      (c) => String(c.id) === String(workItemId),
    );
    const parentCategory =
      selectedCategory?.type === "task" ||
      String(selectedCategory?.id).startsWith("task-")
        ? categories.find(
            (c) =>
              Number(c.id) ===
              Number(
                selectedCategory.parent_id !== undefined
                  ? selectedCategory.parent_id
                  : selectedCategory.work_item_id,
              ),
          )
        : selectedCategory;

    const handleOfflineStorage = async ({ startNextEntry = false } = {}) => {
      try {
        const imagesToStore = selectedImages.map((img) => ({
          id: img.id,
          blob: img.file,
          fileName: img.name || img.file.name,
          mimeType: img.file.type || "image/jpeg",
          size: img.file.size,
          syncStatus: "pending",
        }));

        await createDiaryEntry({
          id: clientUuid,
          client_id: clientUuid,
          clientId: clientUuid,
          projectId: Number(projectId),
          project_id: Number(projectId),
          entryType: "diaryEntry",
          work_item_id: resolvedWorkItemId,
          workItemId: resolvedWorkItemId,
          work_item_name:
            parentCategory?.name ||
            selectedCategory?.name ||
            `Hạng mục #${resolvedWorkItemId}`,
          work_item_code: parentCategory?.code || selectedCategory?.code || "",
          content: content.trim(),
          entry_at: new Date(entryAt).toISOString(),
          entry_date: format(parseISO(entryAt), "yyyy-MM-dd"),
          created_by_name: user?.name || user?.full_name || user?.email || "Tôi",
          syncStatus: "pending",
          isOffline: true,
        }, imagesToStore);
        savedClientIdsRef.current.add(clientUuid);
        removeDraftIfMatchesEntry(draftKey, {
          client_id: clientUuid,
          work_item_id: resolvedWorkItemId,
          content: content.trim(),
          entry_at: payload.entry_at,
        });

        try {
          await requestDiarySync();
        } catch (syncError) {
          console.error("Nhật ký đã lưu cục bộ nhưng chưa thể bắt đầu đồng bộ:", syncError);
        }
        let storedEntry = null;
        let syncStatusVerified = true;
        try {
          storedEntry = await getDiaryEntryById(clientUuid);
          if (!storedEntry) {
            throw new Error("Không tìm thấy nhật ký vừa lưu trong IndexedDB.");
          }
        } catch (readError) {
          syncStatusVerified = false;
          console.error("Không thể đọc lại trạng thái nhật ký vừa lưu:", readError);
        }
        setSubmitMessage({
          type: storedEntry?.syncStatus === "synced" ? "success" : "warning",
          text:
            storedEntry?.syncStatus === "synced"
              ? "Nhật ký đã được đồng bộ thành công."
              : syncStatusVerified
                ? "Đã lưu trên thiết bị — chờ đồng bộ. Chưa gửi được, nội dung vẫn được giữ."
                : "Đã lưu trên thiết bị nhưng chưa xác nhận được trạng thái đồng bộ. Dữ liệu vẫn được giữ.",
        });
        const offlineEntryWithImages = {
          id: clientUuid,
          client_id: clientUuid,
          clientId: clientUuid,
          projectId: Number(projectId),
          project_id: Number(projectId),
          entryType: "diaryEntry",
          work_item_id: resolvedWorkItemId,
          workItemId: resolvedWorkItemId,
          work_item_name:
            parentCategory?.name ||
            selectedCategory?.name ||
            `Hạng mục #${resolvedWorkItemId}`,
          work_item_code: parentCategory?.code || selectedCategory?.code || "",
          content: content.trim(),
          entry_at: new Date(entryAt).toISOString(),
          entry_date: format(parseISO(entryAt), "yyyy-MM-dd"),
          created_by_name: user?.name || user?.full_name || user?.email || "Tôi",
          syncStatus: storedEntry?.syncStatus || "pending",
          isOffline: true,
          attachments: imagesToStore.map((img) => {
            let previewUrl = "";
            try {
              if (isBlob(img.blob)) {
                previewUrl = URL.createObjectURL(img.blob);
              }
            } catch {
              /* ignore */
            }
            return {
              id: img.id,
              url: previewUrl,
              fileName: img.fileName,
              file_name: img.fileName,
              fileSize: img.size,
              file_size: img.size,
              isOffline: true,
            };
          }),
        };

        if (startNextEntry) {
          selectedImages.forEach((img) => {
            if (img.previewUrl?.startsWith("blob:")) {
              URL.revokeObjectURL(img.previewUrl);
            }
          });
          setSelectedImages([]);
          setWorkItemId("");
          setContent("");
          setEntryAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
          setClientId(crypto.randomUUID());
          setErrors({});
          if (onSuccess) {
            onSuccess(offlineEntryWithImages);
          }
        }
      } catch (storageError) {
        console.error("Không thể lưu nhật ký ngoại tuyến:", storageError);
        setSubmitMessage({
          type: "error",
          text: `${storageError.message || "Không thể lưu cục bộ trên thiết bị."} Nhật ký và ảnh chưa được lưu; dữ liệu vẫn còn trong biểu mẫu để bạn thử lại.`,
        });
      }
    };

    // Nếu trình duyệt đang offline, lưu trực tiếp IndexedDB, không gọi API
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await handleOfflineStorage({ startNextEntry: true });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await api.post(
        `/projects/${projectId}/diary-entries`,
        payload,
      );
      serverRequestCompleted = true;

      const serverEntry = res.data.entry || res.data;
      let successEntry = serverEntry;

      if (selectedImages.length > 0) {
        const imagesToStore = selectedImages.map((img) => ({
          id: img.id,
          blob: img.file,
          fileName: img.name || img.file.name,
          mimeType: img.file.type || "image/jpeg",
          size: img.file.size,
          syncStatus: "pending",
        }));
        const persistedEntry = await createDiaryEntry(
          {
            id: clientUuid,
            clientId: clientUuid,
            client_id: clientUuid,
            projectId: Number(projectId),
            project_id: Number(projectId),
            work_item_id: resolvedWorkItemId,
            workItemId: resolvedWorkItemId,
            work_item_name:
              parentCategory?.name ||
              selectedCategory?.name ||
              `Hạng mục #${resolvedWorkItemId}`,
            work_item_code: parentCategory?.code || selectedCategory?.code || "",
            content: content.trim(),
            entry_at: payload.entry_at,
            entry_date: format(parseISO(entryAt), "yyyy-MM-dd"),
            created_by_name: user?.name || user?.full_name || user?.email || "Tôi",
            entryType: "diaryEntry",
            serverId: serverEntry.id,
            syncStatus: "pending",
            isOffline: true,
          },
          imagesToStore,
        );
        try {
          await requestDiarySync();
        } catch (syncError) {
          console.error("Ảnh đã lưu cục bộ nhưng chưa thể xác nhận đồng bộ:", syncError);
        }

        let localEntry = {
          ...persistedEntry,
          attachments: persistedEntry.attachments,
        };
        let syncStatusVerified = true;
        try {
          const reloadedEntry = await getDiaryEntryWithImages(clientUuid);
          if (!reloadedEntry) {
            throw new Error("Không tìm thấy nhật ký vừa lưu trong IndexedDB.");
          }
          localEntry = reloadedEntry;
        } catch (readError) {
          syncStatusVerified = false;
          console.error("Không thể xác nhận trạng thái nhật ký và ảnh vừa lưu:", readError);
        }
        if (!syncStatusVerified) {
          setSubmitMessage({
            type: "warning",
            text: "Nhật ký và ảnh đã được lưu trên thiết bị nhưng chưa xác nhận được trạng thái đồng bộ. Dữ liệu vẫn được giữ.",
          });
        }
        successEntry = {
          ...serverEntry,
          syncStatus: localEntry.syncStatus,
          isOffline: localEntry.syncStatus !== "synced",
          attachments: localEntry.attachments.map((attachment) => ({
            ...attachment,
            id: attachment.id,
            file_name: attachment.fileName || attachment.file_name,
            file_size: attachment.size || attachment.file_size,
            isOffline: localEntry.syncStatus !== "synced",
          })),
        };
      }

      try {
        localStorage.removeItem(draftKey);
      } catch (e) {
        /* ignore */
      }

      selectedImages.forEach((img) => {
        if (img.previewUrl?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(img.previewUrl);
          } catch {
            /* ignore */
          }
        }
      });
      setSelectedImages([]);

      onSuccess(successEntry);
    } catch (err) {
      const isNetworkError =
        !serverRequestCompleted &&
        !err.response &&
        ((typeof navigator !== "undefined" && !navigator.onLine) ||
          err.isAxiosError === true ||
          ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(err.code) ||
          ["Network Error", "Network error"].includes(err.message));

      if (isNetworkError) {
        await handleOfflineStorage();
      } else if (serverRequestCompleted) {
        setSubmitMessage({
          type: "error",
          text: `Máy chủ đã xác nhận nhật ký nhưng không thể lưu đầy đủ dữ liệu cục bộ: ${err.message || "Lỗi IndexedDB."} Ảnh vẫn còn trong biểu mẫu; hãy xử lý lỗi lưu trữ rồi thử lại.`,
        });
      } else {
        const status = err.response?.status;
        const code = err.response?.data?.code;

        if (status === 403) {
          setSubmitMessage({
            type: "error",
            text: "Bạn không có quyền ghi nhật ký.",
          });
        } else if (status === 422 && code === "INVALID_WORK_ITEM") {
          setSubmitMessage({
            type: "error",
            text: "Hạng mục không hợp lệ hoặc không thuộc dự án.",
          });
        } else if (status === 400) {
          setSubmitMessage({
            type: "error",
            text: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.",
          });
        } else {
          setSubmitMessage({
            type: "error",
            text: err.response?.data?.message || "Có lỗi xảy ra khi lưu.",
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter((c) => {
    const norm = (s) =>
      (s || "")

        .normalize("NFD")

        .replace(/[\u0300-\u036f]/g, "")

        .toLowerCase();

    const q = norm(search);

    return norm(c.name).includes(q) || norm(c.code).includes(q);
  });

  const selectedCategory = categories.find(
    (c) => c.id.toString() === workItemId.toString(),
  );

  if (!canWrite) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm transition-all">
      <div className="bg-white w-full sm:max-w-[540px] sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] safe-pb">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">
            Ghi nhật ký thi công
          </h2>

          <button
            onClick={onClose}

            className="p-2 -mr-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}

          className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5"
        >
          {submitMessage && (
            <div
              className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${submitMessage.type === "warning" ? "bg-orange-50 text-orange-700 border border-orange-200" : submitMessage.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
            >
              <AlertCircle className="size-5 shrink-0 mt-0.5" />

              <div className="flex-1">{submitMessage.text}</div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-gray-700">
              Hạng mục <span className="text-red-500">*</span>
            </label>

            <select
              value={workItemId}

              onChange={(e) => {
                setWorkItemId(e.target.value);

                setErrors((prev) => ({ ...prev, workItemId: "" }));
              }}

              data-testid="category-dropdown"

              className={`w-full min-h-[44px] px-3.5 py-2.5 text-[15px] bg-white border rounded-xl outline-none transition-colors ${errors.workItemId ? "border-red-500 ring-1 ring-red-500/20" : "border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"}`}
            >
              <option value="">Chọn hạng mục...</option>

              {categories.map((c) => {
                const isTask = c.type === "task" || String(c.id).startsWith("task-");
                const label = isTask
                  ? `[Công việc] ${c.name}`
                  : (c.code ? `${c.code} - ${c.name}` : c.name);
                return (
                  <option
                    key={c.id}
                    value={c.id}
                    data-testid={`category-option-${c.id}`}
                  >
                    {label}
                  </option>
                );
              })}
            </select>

            {errors.workItemId && (
              <span className="text-[12px] text-red-500 font-medium">
                {errors.workItemId}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-gray-700">
              Thời gian <span className="text-red-500">*</span>
            </label>

            <input
              type="datetime-local"

              value={entryAt}

              onChange={(e) => {
                setEntryAt(e.target.value);

                setErrors((prev) => ({ ...prev, entryAt: "" }));
              }}

              onBlur={(e) => handleBlur("entryAt", e.target.value)}

              className={`w-full min-h-[44px] px-3.5 py-2.5 border rounded-xl bg-white text-[15px] outline-none transition-colors ${errors.entryAt ? "border-red-500 ring-1 ring-red-500/20" : "border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"}`}
            />

            {errors.entryAt && (
              <span className="text-[12px] text-red-500 font-medium">
                {errors.entryAt}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-bold text-gray-700">
                Nội dung <span className="text-red-500">*</span>
              </label>

              <span
                className={`text-[12px] font-medium ${content.length > 5000 ? "text-red-500" : "text-gray-400"}`}
              >
                {content.length}/5000
              </span>
            </div>

            <textarea
              value={content}

              onChange={(e) => {
                setContent(e.target.value);

                setErrors((prev) => ({ ...prev, content: "" }));
              }}

              onBlur={(e) => handleBlur("content", e.target.value)}

              placeholder="Nhập nội dung công việc đã thực hiện..."

              className={`w-full min-h-[120px] px-3.5 py-3 border rounded-xl bg-white text-[15px] resize-none outline-none transition-colors ${errors.content ? "border-red-500 ring-1 ring-red-500/20" : "border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"}`}
            />

            {errors.content && (
              <span className="text-[12px] text-red-500 font-medium">
                {errors.content}
              </span>
            )}
          </div>

          {/* Đính kèm hình ảnh (T67) */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[13px] font-bold text-gray-700 flex items-center gap-1.5">
                <ImageIcon className="size-4 text-blue-600" />
                <span>Hình ảnh đính kèm (tối đa 10 ảnh)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={selectedImages.length >= 10}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50 cursor-pointer px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors touch-target"
                  title="Chụp ảnh trực tiếp bằng camera"
                >
                  <Camera className="size-3.5" />
                  <span>Chụp ảnh</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={selectedImages.length >= 10}
                  className="text-xs font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-1 disabled:opacity-50 cursor-pointer px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors touch-target"
                  title="Chọn ảnh từ thư viện"
                >
                  <span>+ Chọn tệp</span>
                </button>
              </div>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              className="hidden"
              data-testid="diary-camera-input"
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,image/*"
              onChange={handleImageChange}
              className="hidden"
              data-testid="diary-image-input"
            />

            {imageError && (
              <span className="text-[12px] text-red-500 font-medium">
                {imageError}
              </span>
            )}

            {selectedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1" data-testid="selected-images-preview">
                {selectedImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative group size-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 shadow-xs"
                  >
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(img.id)}
                      className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors cursor-pointer"
                      title="Xóa ảnh"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 pb-6 sm:pb-0 shrink-0">
            <button
              type="submit"

              data-testid="submit-diary-btn"

              disabled={
                isSubmitting ||
                !!errors.workItemId ||
                !!errors.content ||
                !!errors.entryAt
              }

              className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold text-[15px] transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>Đang lưu...</>
              ) : submitMessage?.type === "warning" && content.trim() ? (
                <>
                  <RotateCcw className="size-5" /> Gửi lại
                </>
              ) : (
                <>
                  <Save className="size-5" /> Lưu nhật ký
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
