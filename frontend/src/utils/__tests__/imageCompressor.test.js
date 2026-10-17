import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MAX_COMPRESSED_IMAGE_BYTES,
  isUnderSizeLimit,
  formatFileSize,
  isAllowedImageType,
  compressImage,
  processAndCompressImages,
} from "../imageCompressor";

describe("imageCompressor utility (S-23 / T-53)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(
      () => "blob:http://localhost/mock-thumb"
    );
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("1. MAX_COMPRESSED_IMAGE_BYTES is strictly 1_048_576 bytes (1 MB)", () => {
    expect(MAX_COMPRESSED_IMAGE_BYTES).toBe(1048576);
  });

  it("2. isUnderSizeLimit strictly checks size < 1_048_576 bytes", () => {
    expect(isUnderSizeLimit({ size: 1048575 })).toBe(true);
    // 3. File có kích thước đúng bằng 1.048.576 byte bị từ chối
    expect(isUnderSizeLimit({ size: 1048576 })).toBe(false);
    // 4. File sau nén vượt giới hạn bị từ chối
    expect(isUnderSizeLimit({ size: 1048577 })).toBe(false);
    expect(isUnderSizeLimit({ size: 2 * 1048576 })).toBe(false);
    expect(isUnderSizeLimit(null)).toBe(false);
  });

  it("formatFileSize formats bytes to human-readable strings correctly", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(512 * 1024)).toBe("512.0 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
  });

  it("isAllowedImageType checks supported image MIME types", () => {
    expect(isAllowedImageType({ type: "image/jpeg" })).toBe(true);
    expect(isAllowedImageType({ type: "image/png" })).toBe(true);
    expect(isAllowedImageType({ type: "image/webp" })).toBe(true);
    expect(isAllowedImageType({ type: "image/gif" })).toBe(true);
    expect(isAllowedImageType({ type: "application/pdf" })).toBe(false);
    expect(isAllowedImageType({ type: "text/plain" })).toBe(false);
    expect(isAllowedImageType(null)).toBe(false);
  });

  it("6. rejects unsupported file types with a clear error", async () => {
    const invalidFile = new File(["fake-pdf-content"], "doc.pdf", {
      type: "application/pdf",
    });

    await expect(compressImage(invalidFile)).rejects.toThrow(
      /không được hỗ trợ/i
    );
  });

  it("handles valid GIF under 1 MB without canvas re-compression", async () => {
    const validGif = new File(["fake-gif"], "anim.gif", {
      type: "image/gif",
    });

    const result = await compressImage(validGif);
    expect(result.file).toBe(validGif);
    expect(result.compressedSize).toBe(validGif.size);
    expect(isUnderSizeLimit(result.file)).toBe(true);
  });

  it("rejects GIF larger than or equal to 1 MB", async () => {
    // Create dummy GIF of 1_048_576 bytes
    const largeGif = new File(
      [new Uint8Array(MAX_COMPRESSED_IMAGE_BYTES)],
      "large.gif",
      { type: "image/gif" }
    );

    await expect(compressImage(largeGif)).rejects.toThrow(
      /vượt quá giới hạn 1 MB/i
    );
  });

  it("2 & 5 & 9. processAndCompressImages compresses multiple images independently without sending raw files on failure", async () => {
    const validGif1 = new File(["gif1"], "site1.gif", {
      type: "image/gif",
    });
    const invalidFile = new File(["doc"], "plan.pdf", {
      type: "application/pdf",
    });
    const validGif2 = new File(["gif2"], "site2.gif", {
      type: "image/gif",
    });

    const results = await processAndCompressImages([
      validGif1,
      invalidFile,
      validGif2,
    ]);

    expect(results).toHaveLength(3);

    // Image 1: Success
    expect(results[0].name).toBe("site1.gif");
    expect(results[0].status).toBe("ready");
    expect(results[0].file).not.toBeNull();
    expect(results[0].error).toBeNull();

    // Image 2 (PDF): Failed compression - file must be null so it is NEVER uploaded
    expect(results[1].name).toBe("plan.pdf");
    expect(results[1].status).toBe("error");
    expect(results[1].file).toBeNull();
    expect(results[1].error).toMatch(/không được hỗ trợ/i);

    // Image 3: Success despite Image 2 failing
    expect(results[2].name).toBe("site2.gif");
    expect(results[2].status).toBe("ready");
    expect(results[2].file).not.toBeNull();
    expect(results[2].error).toBeNull();
  });
});
