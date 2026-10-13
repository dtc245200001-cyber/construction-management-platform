import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DiaryConflictDialog from "../DiaryConflictDialog";
import api from "../../lib/api";
import { updateDiaryEntryByServerId } from "../../lib/diaryDb";

vi.mock("../../lib/api");
vi.mock("../../lib/diaryDb", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    updateDiaryEntryByServerId: vi.fn(),
  };
});

const conflict = {
  id: 55,
  project_id: 1,
  diary_entry_id: 101,
  client_version: 1,
  server_version: 2,
  status: "pending",
  source: "offline_sync",
  server_snapshot: {
    content: "Server content",
    work_item_name: "Hạng mục A",
    entry_at: "2026-10-13T08:00:00.000Z",
    updated_by_name: "Kỹ sư A",
  },
  client_snapshot: {
    content: "Client content",
    work_item_name: "Hạng mục A",
    entry_at: "2026-10-13T08:00:00.000Z",
    client_updated_at: "2026-10-13T08:05:00.000Z",
    updated_by_name: "Kỹ sư B",
    source: "offline_sync",
  },
};

describe("DiaryConflictDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows both server and device snapshots", () => {
    render(
      <DiaryConflictDialog
        isOpen
        conflicts={[conflict]}
        projectId={1}
        canResolve
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Bản trên máy chủ")).toBeInTheDocument();
    expect(screen.getByText("Bản trên thiết bị")).toBeInTheDocument();
    expect(screen.getByText("Server content")).toBeInTheDocument();
    expect(screen.getByText("Client content")).toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("Dựa trên v1")).toBeInTheDocument();
  });

  it("disables resolution actions when the user lacks permission", () => {
    render(
      <DiaryConflictDialog
        isOpen
        conflicts={[conflict]}
        projectId={1}
        canResolve={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/không có quyền giải quyết xung đột/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Giữ bản máy chủ/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Dùng bản thiết bị/i })).toBeDisabled();
  });

  it("resolves on the server and clears the matching local conflict by server id", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        resolution: "server",
        resulting_version: 2,
        diary_entry: {
          id: 101,
          version: 2,
          content: "Server content",
          work_item_id: 10,
          entry_at: "2026-10-13T08:00:00.000Z",
        },
      },
    });
    updateDiaryEntryByServerId.mockResolvedValueOnce(true);
    const onResolved = vi.fn();

    render(
      <DiaryConflictDialog
        isOpen
        conflicts={[conflict]}
        projectId={1}
        canResolve
        onClose={vi.fn()}
        onResolved={onResolved}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Giữ bản máy chủ/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/1/diary-conflicts/55/resolve",
        { resolution: "server" },
      );
    });
    await waitFor(() => {
      expect(updateDiaryEntryByServerId).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          version: 2,
          serverVersion: 2,
          syncStatus: "synced",
          pendingOperation: null,
          conflictId: null,
          content: "Server content",
          work_item_id: 10,
          workItemId: 10,
        }),
      );
    });
    expect(onResolved).toHaveBeenCalledWith(
      expect.objectContaining({ conflictId: 55, resolution: "server", resultingVersion: 2 }),
    );
  });

  it("sends the client resolution option", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        resolution: "client",
        resulting_version: 3,
        diary_entry: { id: 101, version: 3 },
      },
    });
    updateDiaryEntryByServerId.mockResolvedValueOnce(true);

    render(
      <DiaryConflictDialog
        isOpen
        conflicts={[conflict]}
        projectId={1}
        canResolve
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dùng bản thiết bị/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/1/diary-conflicts/55/resolve",
        { resolution: "client" },
      );
    });
    expect(updateDiaryEntryByServerId).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ version: 3, serverVersion: 3, conflictId: null }),
    );
  });
});
