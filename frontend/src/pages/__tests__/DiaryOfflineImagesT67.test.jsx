import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import api from "../../lib/api";
import DiaryPage from "../DiaryPage";
import TaskLogModal from "../../components/TaskLogModal";
import DiaryEntryForm from "../../components/DiaryEntryForm";
import {
  openDiaryDB,
  closeDiaryDB,
  clearDiaryDB,
  createDiaryEntry,
  getDiaryAttachmentsByLog,
  getDiaryEntryWithImages,
  saveDiaryAttachment,
  saveDiaryAttachments,
  deleteDiaryEntry,
  deleteDiaryAttachment,
  cleanOrphanAttachments,
  validateImage,
} from "../../lib/diaryDb";

vi.mock("../../lib/api");

const mockUser = { id: 1, role: "ky_su_giam_sat", name: "Kỹ sư Giám sát" };
const mockCategories = [
  { id: 101, name: "Móng bê tông", code: "W-01" },
  { id: 102, name: "Thân cột dầm", code: "W-02" },
];

describe("T67 — Lưu ảnh offline và phục hồi khi mở lại (S-29)", () => {
  const originalOnLine = navigator.onLine;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("currentProjectId", "13");

    // Tạo DB sạch trước mỗi test
    await clearDiaryDB();

    // Mock API mặc định
    api.get.mockImplementation((url) => {
      if (url.includes("/projects/") && !url.includes("/diary-entries") && !url.includes("/diary-locks") && !url.includes("/tasks/")) {
        return Promise.resolve({ data: { membership: "ky_su_giam_sat" } });
      }
      if (url.includes("/tree/all")) {
        return Promise.resolve({ data: mockCategories });
      }
      if (url.includes("/diary-entries")) {
        return Promise.resolve({ data: { data: [], total: 0 } });
      }
      if (url.includes("/diary-locks/")) {
        return Promise.resolve({ data: { is_locked: false } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error("not mocked"));
    });

    // Mock URL.createObjectURL và revokeObjectURL
    let objectUrlCounter = 0;
    globalThis.URL.createObjectURL = vi.fn((blob) => `blob:http://localhost/image-test-${++objectUrlCounter}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(async () => {
    cleanup();
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    await closeDiaryDB();
  });

  it("1, 2 & 3. Chọn ảnh, lưu Blob thực tế vào IndexedDB và đọc lại liên kết đúng theo clientId", async () => {
    const clientId = "uuid-t67-client-001";
    const sampleBlob = new Blob(["binary-image-data-offline"], { type: "image/jpeg" });

    // Lưu nhật ký kèm ảnh dưới dạng Blob thực tế
    const saved = await createDiaryEntry(
      {
        id: clientId,
        clientId,
        projectId: 13,
        taskId: 101,
        content: "Kiểm tra nghiệm thu móng kèm ảnh hiện trường",
      },
      [
        {
          id: "img-001",
          blob: sampleBlob,
          fileName: "hien-truong-mong.jpg",
          mimeType: "image/jpeg",
          size: sampleBlob.size,
        },
      ]
    );

    expect(saved.clientId).toBe(clientId);
    expect(saved.attachments).toHaveLength(1);

    // Đọc lại từ IndexedDB bằng clientId
    const attachments = await getDiaryAttachmentsByLog(clientId);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].id).toBe("img-001");
    expect(attachments[0].logId).toBe(clientId);
    expect(attachments[0].fileName).toBe("hien-truong-mong.jpg");

    // Đảm bảo dữ liệu lưu là Blob thực tế, không phải URL chuỗi blob: tạm thời
    expect(attachments[0].blob).toBeInstanceOf(Blob);
    expect(attachments[0].blob.size).toBe(sampleBlob.size);
    expect(attachments[0].url).toBeUndefined();
  });

  it("4 & 5. Ảnh vẫn tồn tại và đọc lại chính xác sau khi đóng/mở lại database (giả lập reload / mở lại ứng dụng)", async () => {
    const clientId = "uuid-t67-reload-002";
    const blob1 = new Blob(["image-1-reload"], { type: "image/jpeg" });
    const blob2 = new Blob(["image-2-reload"], { type: "image/png" });

    await createDiaryEntry(
      {
        id: clientId,
        clientId,
        projectId: 13,
        content: "Nhật ký trước khi reload",
      },
      [
        { id: "img-r1", blob: blob1, fileName: "anh1.jpg" },
        { id: "img-r2", blob: blob2, fileName: "anh2.png" },
      ]
    );

    // Đóng kết nối IndexedDB (mô phỏng người dùng đóng tab / ứng dụng)
    await closeDiaryDB();

    // Mở lại kết nối IndexedDB (mô phỏng mở lại ứng dụng)
    const reopened = await getDiaryEntryWithImages(clientId);
    expect(reopened).not.toBeNull();
    expect(reopened.content).toBe("Nhật ký trước khi reload");
    expect(reopened.attachments).toHaveLength(2);

    const names = reopened.attachments.map((a) => a.fileName);
    expect(names).toContain("anh1.jpg");
    expect(names).toContain("anh2.png");
    expect(reopened.attachments[0].blob).toBeInstanceOf(Blob);
  });

  it("6. Tạo Object URL mới khi hiển thị ảnh offline trên giao diện DiaryPage sau reload", async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const blob = new Blob(["offline-photo-render"], { type: "image/jpeg" });

    await createDiaryEntry(
      {
        id: "log-offline-page",
        clientId: "log-offline-page",
        projectId: 13,
        work_item_id: 101,
        work_item_name: "Móng bê tông",
        content: "Nhật ký offline có ảnh",
        entry_at: new Date().toISOString(),
        entry_date: today,
        syncStatus: "pending",
        isOffline: true,
      },
      [
        {
          id: "att-offline-render",
          blob,
          fileName: "cot-thep.jpg",
          mimeType: "image/jpeg",
        },
      ]
    );

    render(
      <MemoryRouter initialEntries={["/diary"]}>
        <DiaryPage user={mockUser} />
      </MemoryRouter>
    );

    // Chờ nhật ký và ảnh xuất hiện trên UI
    await waitFor(() => {
      expect(screen.getByText("Nhật ký offline có ảnh")).toBeInTheDocument();
      expect(screen.getByText(/Hình ảnh đính kèm \(1\):/i)).toBeInTheDocument();
    });

    // Kiểm tra URL.createObjectURL được gọi để tạo URL hiển thị từ Blob
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    // Ảnh phải có thẻ img với alt là tên tệp và có badge Offline
    const renderedImg = screen.getByAltText("cot-thep.jpg");
    expect(renderedImg).toBeInTheDocument();
    expect(renderedImg.src).toContain("blob:http://localhost/");
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("7. Không tạo bản ghi ảnh trùng khi lưu lại cùng một nhật ký", async () => {
    const logId = "uuid-idempotent-test";
    const blobA = new Blob(["photo-original"], { type: "image/jpeg" });

    // Lưu lần 1: 1 ảnh
    await createDiaryEntry(
      { id: logId, clientId: logId, projectId: 13, content: "Lưu lần 1" },
      [{ id: "stable-img-1", blob: blobA, fileName: "anh1.jpg" }]
    );

    const atts1 = await getDiaryAttachmentsByLog(logId);
    expect(atts1).toHaveLength(1);

    // Lưu lần 2: cùng clientId và cùng imgId nhưng cập nhật nội dung
    await createDiaryEntry(
      { id: logId, clientId: logId, projectId: 13, content: "Lưu lần 2 chỉnh sửa" },
      [{ id: "stable-img-1", blob: blobA, fileName: "anh1.jpg" }]
    );

    const atts2 = await getDiaryAttachmentsByLog(logId);
    // Không được tăng lên 2 ảnh trùng lặp
    expect(atts2).toHaveLength(1);
    expect(atts2[0].id).toBe("stable-img-1");
  });

  it("8. Xử lý đúng lỗi dung lượng lưu trữ (QuotaExceededError) và validate ảnh không hợp lệ", async () => {
    // 1. Validate ảnh rỗng hoặc không phải Blob
    expect(() => validateImage(null)).toThrow("Dữ liệu ảnh không được để trống");
    expect(() => validateImage({ blob: "invalid-string" })).toThrow("phải có dữ liệu Blob hợp lệ");

    // 2. Định dạng không hợp lệ
    const invalidTypeBlob = new Blob(["xyz"], { type: "text/plain" });
    expect(() => validateImage({ blob: invalidTypeBlob, mimeType: "text/plain" })).toThrow(
      "không được hỗ trợ"
    );

    // 3. Giả lập QuotaExceededError khi ghi IndexedDB
    const db = await openDiaryDB();
    const origTx = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce((stores, mode) => {
      const tx = origTx(stores, mode);
      const quotaError = new DOMException("Quota exceeded", "QuotaExceededError");
      return new Proxy(tx, {
        get(target, property) {
          if (property === "objectStore") {
            return (storeName) => {
              const store = target.objectStore(storeName);
              if (storeName !== "diaryAttachments") return store;
              return new Proxy(store, {
                get(targetStore, storeProperty) {
                  if (storeProperty === "put") {
                    return () => {
                      throw quotaError;
                    };
                  }
                  const value = Reflect.get(targetStore, storeProperty, targetStore);
                  return typeof value === "function" ? value.bind(targetStore) : value;
                },
              });
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });

    const testBlob = new Blob(["data"], { type: "image/jpeg" });
    await expect(
      createDiaryEntry(
        { id: "quota-test", projectId: 13, content: "Test quota" },
        [{ blob: testBlob, fileName: "quota.jpg" }]
      )
      ).rejects.toThrow(/không đủ dung lượng lưu trữ/i);
      expect(await getDiaryAttachmentsByLog("quota-test")).toHaveLength(0);

    await closeDiaryDB();
  });

  it("9. Ảnh cục bộ trong IndexedDB không bị xóa khi API upload thất bại trong TaskLogModal", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    // Mock API GET ban đầu trả rỗng
    api.get.mockResolvedValueOnce({ data: { data: [] } });

    // Mock API POST upload thất bại (lỗi mạng)
    const netErr = new Error("Network Error");
    netErr.code = "ERR_NETWORK";
    netErr.name = "AxiosError";
    api.post.mockRejectedValueOnce(netErr);

    const testFile = new File(["binary-image-field"], "hien-truong.gif", {
      type: "image/gif",
    });

    render(
      <TaskLogModal
        projectId={13}
        taskId={101}
        taskName="Đổ bê tông sàn tầng 2"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Nhập mô tả tình hình thi công/i)).toBeInTheDocument();
    });

    // Nhập nội dung
    fireEvent.change(screen.getByPlaceholderText(/Nhập mô tả tình hình thi công/i), {
      target: { value: "Báo cáo tiến độ kèm ảnh khi mạng chập chờn" },
    });

    // Chọn ảnh
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [testFile] } });
    }

    // Chờ ảnh nén xong và hiển thị trong danh sách ảnh chờ gửi
    await waitFor(() => {
      expect(screen.getByText("hien-truong.gif")).toBeInTheDocument();
    });

    // Bấm lưu nhật ký
    const submitBtn = screen.getByRole("button", { name: /Lưu nhật ký/i });
    fireEvent.click(submitBtn);

    // Chờ xử lý lỗi mạng và lưu offline
    await waitFor(() => {
      expect(
        screen.getByText(/Mất kết nối mạng. Nhật ký và ảnh đã được lưu trên thiết bị/i)
      ).toBeInTheDocument();
    });

    // Dữ liệu ảnh và nhật ký vẫn tồn tại an toàn trong IndexedDB, KHÔNG bị xóa
    const logs = await getDiaryAttachmentsByLog("uuid-t67-stable-001");
    // Kiểm tra có ít nhất 1 ảnh đính kèm được lưu trong DB
    const db = await openDiaryDB();
    const tx = db.transaction("diaryAttachments", "readonly");
    const countReq = tx.objectStore("diaryAttachments").count();
    const count = await new Promise((res) => {
      countReq.onsuccess = () => res(countReq.result);
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("10. Chức năng xem ảnh online hiện có vẫn hoạt động song song", async () => {
    const onlineLogWithPhoto = {
      id: 88,
      task_id: 101,
      user_name: "Kỹ sư Online",
      content: "Nhật ký trên server đã có ảnh",
      created_at: new Date().toISOString(),
      attachments: [
        {
          id: 501,
          file_name: "anh-server.jpg",
          file_size: 250000,
          mime_type: "image/jpeg",
          url: "https://example.com/uploads/anh-server.jpg",
        },
      ],
    };

    api.get.mockResolvedValueOnce({ data: { data: [onlineLogWithPhoto] } });

    render(
      <TaskLogModal
        projectId={13}
        taskId={101}
        taskName="Đổ bê tông sàn tầng 2"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Thumbnail ảnh online phải hiển thị bình thường với URL server
    await waitFor(() => {
      expect(screen.getByText("Nhật ký trên server đã có ảnh")).toBeInTheDocument();
      expect(screen.getByAltText("anh-server.jpg")).toBeInTheDocument();
    });

    const onlineImg = screen.getByAltText("anh-server.jpg");
    expect(onlineImg.src).toContain("https://example.com/uploads/anh-server.jpg");
  });

  it("11. Khôi phục đồng thời nhật ký T66 và ảnh T67 mà không làm hỏng dữ liệu nhật ký", async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const photoBlob = new Blob(["t66-t67-integrated"], { type: "image/webp" });

    // Tạo bản ghi đầy đủ gồm cả nội dung T66 và ảnh T67
    await createDiaryEntry(
      {
        id: "integrated-log-01",
        clientId: "integrated-log-01",
        projectId: 13,
        work_item_id: 101,
        work_item_name: "Móng bê tông",
        content: "Nội dung T66 đầy đủ kèm ảnh T67",
        entry_at: new Date().toISOString(),
        entry_date: today,
        syncStatus: "pending",
        created_by_name: "Kỹ sư T67",
        isOffline: true,
      },
      [
        {
          id: "photo-t67",
          blob: photoBlob,
          fileName: "hinh-anh-t67.webp",
          mimeType: "image/webp",
        },
      ]
    );

    render(
      <MemoryRouter initialEntries={["/diary"]}>
        <DiaryPage user={mockUser} />
      </MemoryRouter>
    );

    // Xác nhận cả nội dung nhật ký T66 và ảnh T67 đều hiển thị cùng lúc
    await waitFor(() => {
      expect(screen.getByText("Nội dung T66 đầy đủ kèm ảnh T67")).toBeInTheDocument();
      expect(screen.getByText(/Kỹ sư T67/i)).toBeInTheDocument();
      expect(screen.getByAltText("hinh-anh-t67.webp")).toBeInTheDocument();
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
  });

  it("12. Thu hồi Object URL (URL.revokeObjectURL) đúng cách khi unmount component", async () => {
    const blob = new Blob(["unmount-test-image"], { type: "image/jpeg" });
    await createDiaryEntry(
      {
        id: "unmount-log",
        clientId: "unmount-log",
        projectId: 13,
        work_item_id: 101,
        content: "Kiểm tra thu hồi URL",
        entry_date: format(new Date(), "yyyy-MM-dd"),
        syncStatus: "pending",
      },
      [{ id: "att-unmount", blob, fileName: "unmount.jpg" }]
    );

    const { unmount } = render(
      <MemoryRouter initialEntries={["/diary"]}>
        <DiaryPage user={mockUser} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByAltText("unmount.jpg")).toBeInTheDocument();
    });

    // Unmount component
    unmount();

    // URL.revokeObjectURL phải được gọi để giải phóng bộ nhớ
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("13. Dọn dẹp ảnh mồ côi (cleanOrphanAttachments) và cascade delete khi xóa nhật ký", async () => {
    const logId = "log-to-delete";
    const blob = new Blob(["orphan-test"], { type: "image/jpeg" });

    await createDiaryEntry(
      { id: logId, clientId: logId, projectId: 13, content: "Sắp bị xóa" },
      [{ id: "att-orphan-1", blob, fileName: "orphan.jpg" }]
    );

    expect((await getDiaryAttachmentsByLog(logId)).length).toBe(1);

    // Xóa nhật ký qua deleteDiaryEntry
    await deleteDiaryEntry(logId);

    // Ảnh liên quan phải bị xóa theo
    const attsAfterDelete = await getDiaryAttachmentsByLog(logId);
    expect(attsAfterDelete).toHaveLength(0);

    // Thử tạo một ảnh mồ côi nhân tạo (không có log tương ứng)
    await saveDiaryAttachment({
      id: "orphan-lonely",
      logId: "non-existent-log-id",
      blob,
      fileName: "lonely.jpg",
      syncStatus: "synced",
    });

    // Chạy dọn dẹp ảnh mồ côi
    await cleanOrphanAttachments();

    // Ảnh mồ côi không có log cha phải bị dọn dẹp
    const checkOrphan = await getDiaryAttachmentsByLog("non-existent-log-id");
    expect(checkOrphan).toHaveLength(0);
  });
});
