/**
 * Tính mã băm SHA-256 của tệp sử dụng Web Crypto API (chuẩn trình duyệt)
 * Rất nhanh, an toàn và không phụ thuộc thư viện ngoài.
 *
 * @param {File|Blob} file
 * @returns {Promise<string>} Chuỗi hex 64 ký tự của SHA-256
 */
export async function calculateSHA256(file) {
  if (!file) throw new Error("File không được để trống");

  const subtle =
    (typeof crypto !== "undefined" && crypto.subtle) ||
    (typeof window !== "undefined" && window.crypto && window.crypto.subtle) ||
    (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle);

  if (!subtle) {
    throw new Error("Web Crypto API không được hỗ trợ trong trình duyệt này");
  }

  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Định dạng kích thước tệp
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
