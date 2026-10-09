/**
 * imageCompressor.js (S-23 / T-53)
 * Utility client-side xử lý nén ảnh trước khi tải lên.
 * Tuân thủ nghiêm ngặt giới hạn MAX_COMPRESSED_IMAGE_BYTES = 1_048_576 bytes.
 */

export const MAX_COMPRESSED_IMAGE_BYTES = 1_048_576; // 1 MB (1.048.576 bytes)
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const INITIAL_MAX_DIMENSION = 1920;
const MAX_COMPRESSION_ATTEMPTS = 6;

/**
 * Kiểm tra xem kích thước file có nhỏ hơn giới hạn 1 MB hay không
 * Điều kiện AC2: compressedFile.size < MAX_COMPRESSED_IMAGE_BYTES
 * @param {File|Blob} file
 * @returns {boolean}
 */
export function isUnderSizeLimit(file) {
  if (!file) return false;
  return file.size < MAX_COMPRESSED_IMAGE_BYTES;
}

/**
 * Định dạng dung lượng byte sang chuỗi thân thiện (B, KB, MB)
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * Kiểm tra định dạng MIME của file
 * @param {File} file
 * @returns {boolean}
 */
export function isAllowedImageType(file) {
  if (!file || !file.type) return false;
  return ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());
}

/**
 * Nén một file ảnh tại client-side xuống kích thước < 1.048.576 byte
 * @param {File} file - File ảnh gốc từ người dùng
 * @param {Object} [options]
 * @param {number} [options.maxSizeBytes=MAX_COMPRESSED_IMAGE_BYTES]
 * @returns {Promise<{ file: File, originalSize: number, compressedSize: number, compressionRatio: number, previewUrl: string }>}
 */
export async function compressImage(file, options = {}) {
  const maxSizeBytes = options.maxSizeBytes || MAX_COMPRESSED_IMAGE_BYTES;

  if (!file) {
    throw new Error("Không có file để xử lý.");
  }

  // 1. Kiểm tra định dạng hỗ trợ
  if (!isAllowedImageType(file)) {
    throw new Error(
      `Định dạng file "${file.name}" không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, WebP và GIF.`
    );
  }

  // 2. Xử lý ảnh GIF (ảnh động không nén qua canvas để tránh mất animation)
  if (file.type === "image/gif") {
    if (file.size >= maxSizeBytes) {
      throw new Error(
        `Ảnh GIF "${file.name}" (${formatFileSize(file.size)}) vượt quá giới hạn 1 MB và không thể nén tự động.`
      );
    }
    const previewUrl = URL.createObjectURL(file);
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      compressionRatio: 0,
      previewUrl,
    };
  }

  // 3. Nén qua HTML5 Canvas với vòng lặp điều chỉnh chất lượng và kích thước
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error(`Không thể đọc file "${file.name}".`));
    };

    reader.onload = (e) => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error(`Không thể giải mã dữ liệu ảnh "${file.name}".`));
      };

      img.onload = async () => {
        try {
          let currentMaxDim = INITIAL_MAX_DIMENSION;
          let currentQuality = 0.85;
          let attempt = 0;
          let bestBlob = null;
          let bestMime = "image/jpeg";

          // Xác định MIME output (PNG nếu nhỏ, ngược lại dùng JPEG cho tối ưu nén)
          let targetMime = file.type === "image/webp" ? "image/webp" : "image/jpeg";

          while (attempt < MAX_COMPRESSION_ATTEMPTS) {
            attempt++;

            // Tính toán kích thước canvas theo tỷ lệ
            let width = img.width;
            let height = img.height;

            if (width > currentMaxDim || height > currentMaxDim) {
              if (width > height) {
                height = Math.round((height * currentMaxDim) / width);
                width = currentMaxDim;
              } else {
                width = Math.round((width * currentMaxDim) / height);
                height = currentMaxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, width);
            canvas.height = Math.max(1, height);
            const ctx = canvas.getContext("2d");

            if (!ctx) {
              throw new Error("Không thể khởi tạo môi trường đồ họa Canvas.");
            }

            // Fill nền trắng cho ảnh có kênh alpha khi chuyển sang JPEG
            if (targetMime === "image/jpeg") {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, width, height);
            }

            ctx.drawImage(img, 0, 0, width, height);

            const blob = await new Promise((res) =>
              canvas.toBlob(res, targetMime, currentQuality)
            );

            // Dọn dẹp canvas để giải phóng bộ nhớ
            canvas.width = 0;
            canvas.height = 0;

            if (blob && blob.size < maxSizeBytes) {
              bestBlob = blob;
              bestMime = targetMime;
              break; // Đạt yêu cầu < 1MB
            }

            // Nếu chưa đạt < 1MB, giảm dần kích thước và chất lượng cho lần thử kế
            bestBlob = blob;
            bestMime = targetMime;
            currentQuality = Math.max(0.2, currentQuality - 0.18);
            currentMaxDim = Math.max(640, Math.round(currentMaxDim * 0.75));
          }

          // Kiểm tra nghiêm ngặt điều kiện < 1.048.576 bytes (AC2)
          if (!bestBlob || bestBlob.size >= maxSizeBytes) {
            const actualSizeStr = bestBlob
              ? formatFileSize(bestBlob.size)
              : "không xác định";
            throw new Error(
              `Ảnh "${file.name}" không thể nén xuống dưới 1 MB (kích thước sau nén: ${actualSizeStr}).`
            );
          }

          // Đặt tên file xuất ra phù hợp với MIME đã nén
          let outputName = file.name;
          if (
            bestMime === "image/jpeg" &&
            !outputName.toLowerCase().endsWith(".jpg") &&
            !outputName.toLowerCase().endsWith(".jpeg")
          ) {
            outputName = outputName.replace(/\.[^/.]+$/, "") + ".jpg";
          } else if (
            bestMime === "image/webp" &&
            !outputName.toLowerCase().endsWith(".webp")
          ) {
            outputName = outputName.replace(/\.[^/.]+$/, "") + ".webp";
          }

          const compressedFile = new File([bestBlob], outputName, {
            type: bestMime,
            lastModified: Date.now(),
          });

          const originalSize = file.size;
          const compressedSize = compressedFile.size;
          const compressionRatio =
            originalSize > 0
              ? Math.max(
                  0,
                  Math.round(
                    ((originalSize - compressedSize) / originalSize) * 100
                  )
                )
              : 0;

          const previewUrl = URL.createObjectURL(compressedFile);

          resolve({
            file: compressedFile,
            originalSize,
            compressedSize,
            compressionRatio,
            previewUrl,
          });
        } catch (err) {
          reject(err);
        }
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Xử lý nén danh sách nhiều ảnh độc lập trước khi gửi tới API T52
 * Đảm bảo lỗi của 1 ảnh không làm ảnh hưởng ảnh khác.
 * Không tự động gửi ảnh gốc nếu nén thất bại.
 *
 * @param {FileList|File[]} files
 * @param {number} [maxCount=10]
 * @returns {Promise<Array<{ id: string, name: string, file: File|null, originalSize: number, compressedSize: number, compressionRatio: number, previewUrl: string|null, error: string|null, status: 'ready'|'error' }>>}
 */
export async function processAndCompressImages(files, maxCount = 10) {
  const fileArray = Array.from(files || []).slice(0, maxCount);
  const results = [];

  for (let i = 0; i < fileArray.length; i++) {
    const rawFile = fileArray[i];
    const uniqueId = `img_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`;

    try {
      const result = await compressImage(rawFile);
      results.push({
        id: uniqueId,
        name: rawFile.name,
        file: result.file,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: result.compressionRatio,
        previewUrl: result.previewUrl,
        error: null,
        status: "ready",
      });
    } catch (err) {
      results.push({
        id: uniqueId,
        name: rawFile.name,
        file: null, // KHÔNG gửi ảnh gốc nếu nén thất bại
        originalSize: rawFile.size,
        compressedSize: 0,
        compressionRatio: 0,
        previewUrl: null,
        error: err.message || "Nén ảnh thất bại",
        status: "error",
      });
    }
  }

  return results;
}
