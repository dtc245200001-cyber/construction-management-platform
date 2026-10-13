import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DiaryConflictDialog from "../DiaryConflictDialog";
import api from "../../lib/api";

vi.mock("../../lib/api");

describe("DiaryConflictDialog Component (T-78)", () => {
  const sampleConflicts = [
    {
      id: 55,
      project_id: 1,
      diary_entry_id: 10,
      client_version: 1,
      server_version: 2,
      source: "offline_sync",
      status: "pending",
      server_snapshot: {
        id: 10,
        content: "Nội dung cập nhật từ Thiết bị A (trên Server)",
        work_item_name: "Thi công cọc nhồi",
        version: 2,
        updated_by_name: "Kỹ sư Nguyễn Văn A",
        entry_at: "2026-10-13T08:00:00.000Z",
      },
      client_snapshot: {
        content: "Nội dung ghi chép từ Thiết bị B (ngoại tuyến)",
        work_item_name: "Thi công cọc nhồi",
        version: 1,
        source: "offline_sync",
        updated_by_name: "Giám sát Trần Văn B",
        entry_at: "2026-10-13T08:00:00.000Z",
        client_updated_at: "2026-10-13T08:15:00.000Z",
      },
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("1. Renders nothing when isOpen is false", () => {
    const { container } = render(
      <DiaryConflictDialog
        isOpen={false}
        conflicts={sampleConflicts}
        projectId={1}
        canResolve={true}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("2. Renders server and client snapshots side-by-side with both versions", () => {
    render(
      <DiaryConflictDialog
        isOpen={true}
        conflicts={sampleConflicts}
        projectId={1}
        canResolve={true}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Giải quyết xung đột phiên bản nhật ký/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Bản trên máy chủ")).toBeInTheDocument();
    expect(screen.getByText("Bản trên thiết bị")).toBeInTheDocument();

    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("Dựa trên v1")).toBeInTheDocument();

    expect(
      screen.getByText("Nội dung cập nhật từ Thiết bị A (trên Server)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nội dung ghi chép từ Thiết bị B (ngoại tuyến)")
    ).toBeInTheDocument();
  });

  it("3. Calls api.post with resolution 'server' when user clicks 'Giữ bản máy chủ'", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 55,
        status: "resolved",
        resolution: "server",
        resolved_version: 2,
      },
    });

    const onResolved = vi.fn();
    render(
      <DiaryConflictDialog
        isOpen={true}
        conflicts={sampleConflicts}
        projectId={1}
        canResolve={true}
        onResolved={onResolved}
        onClose={vi.fn()}
      />
    );

    const serverButton = screen.getByRole("button", { name: /Giữ bản máy chủ/i });
    expect(serverButton).not.toBeDisabled();
    fireEvent.click(serverButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/1/diary-conflicts/55/resolve",
        { resolution: "server" }
      );
    });

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalled();
    });
  });

  it("4. Calls api.post with resolution 'client' when user clicks 'Dùng bản thiết bị'", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 55,
        status: "resolved",
        resolution: "client",
        resolved_version: 3,
      },
    });

    const onResolved = vi.fn();
    render(
      <DiaryConflictDialog
        isOpen={true}
        conflicts={sampleConflicts}
        projectId={1}
        canResolve={true}
        onResolved={onResolved}
        onClose={vi.fn()}
      />
    );

    const clientButton = screen.getByRole("button", { name: /Dùng bản thiết bị/i });
    expect(clientButton).not.toBeDisabled();
    fireEvent.click(clientButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/1/diary-conflicts/55/resolve",
        { resolution: "client" }
      );
    });

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalled();
    });
  });

  it("5. Disables buttons and shows warning when canResolve is false", () => {
    render(
      <DiaryConflictDialog
        isOpen={true}
        conflicts={sampleConflicts}
        projectId={1}
        canResolve={false}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Bạn không có quyền giải quyết xung đột/i)
    ).toBeInTheDocument();

    const serverButton = screen.getByRole("button", { name: /Giữ bản máy chủ/i });
    const clientButton = screen.getByRole("button", { name: /Dùng bản thiết bị/i });

    expect(serverButton).toBeDisabled();
    expect(clientButton).toBeDisabled();
  });
});
