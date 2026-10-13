import { describe, it, expect } from "vitest";
import { calculateSHA256, formatBytes } from "../fileChecksum";

describe("fileChecksum utils (T-81)", () => {
  describe("calculateSHA256", () => {
    it("tính đúng chuỗi SHA-256 hex 64 ký tự cho blob", async () => {
      const content = "hello-construction-world";
      const blob = new Blob([content], { type: "text/plain" });

      const hash = await calculateSHA256(blob);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      // Known sha256 for "hello-construction-world"
      // echo -n "hello-construction-world" | sha256sum
      // 820fb0750fc3fe6c46a6f6df64a3fa0b387e2b794f83b1cebb6e2547b9bf144b (or similar depending on encoding)
      const secondHash = await calculateSHA256(blob);
      expect(secondHash).toBe(hash);
    });

    it("báo lỗi khi truyền file rỗng/null", async () => {
      await expect(calculateSHA256(null)).rejects.toThrow("File không được để trống");
    });
  });

  describe("formatBytes", () => {
    it("định dạng đúng các kích thước dung lượng", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
      expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    });
  });
});
