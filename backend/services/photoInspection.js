/**
 * Service phân tích và phát hiện dấu hiệu bất thường của ảnh bằng chứng (EXIF / Metadata)
 * Story S-42: T-109 & T-110
 *
 * Tiêu chí:
 * - Trích xuất metadata máy ảnh, kích thước, thời gian chụp, toạ độ GPS.
 * - Phát hiện dấu hiệu chụp lại màn hình điện thoại (screenshot dimensions / aspect ratio + thiếu camera EXIF).
 * - Phát hiện thiếu EXIF hoặc metadata không đầy đủ.
 * - Phát hiện metadata không hợp lệ hoặc sai lệch thời gian quá xa so với ngày lập phiếu nghiệm thu.
 * - Phân biệt rõ: Dấu hiệu cần xác minh (warning), Dữ liệu không đầy đủ (incomplete_data), Lỗi kỹ thuật (error), Hợp lệ (clean).
 * - Ghi rõ mức độ tin cậy (confidence) của từng cảnh báo.
 * - Tuyệt đối KHÔNG log toạ độ hoặc thời gian chụp ra console/file log.
 */

'use strict';

const crypto = require('crypto');
const {
  extractPhotoMetadata,
  extractImageDimensions,
  calculateAspectRatio,
} = require('./photoMetadata');

// Danh sách các độ phân giải màn hình điện thoại phổ biến (pixels)
const KNOWN_SCREENSHOT_RESOLUTIONS = new Set([
  // 16:9
  '720x1280', '1280x720',
  '1080x1920', '1920x1080',
  '1440x2560', '2560x1440',
  // iPhone classic & modern
  '750x1334', '1334x750',
  '828x1792', '1792x828',
  '1125x2436', '2436x1125',
  '1242x2688', '2688x1242',
  '1170x2532', '2532x1170',
  '1179x2556', '2556x1179',
  '1284x2778', '2778x1284',
  '1290x2796', '2796x1290',
  // Android 18:9, 19:9, 19.5:9, 20:9
  '720x1440', '1440x720',
  '720x1560', '1560x720',
  '720x1600', '1600x720',
  '1080x2160', '2160x1080',
  '1080x2280', '2280x1080',
  '1080x2340', '2340x1080',
  '1080x2400', '2400x1080',
  '1080x2460', '2460x1080',
  '1220x2712', '2712x1220',
  '1440x3088', '3088x1440',
  '1440x3120', '3120x1440',
  '1440x3200', '3200x1440',
]);

const STANDARD_RATIOS = [
  { landscape: '1:1', portrait: '1:1', val: 1.0 },
  { landscape: '4:3', portrait: '3:4', val: 4 / 3 }, // 1.3333
  { landscape: '3:2', portrait: '2:3', val: 3 / 2 }, // 1.5000
  { landscape: '16:9', portrait: '9:16', val: 16 / 9 }, // 1.7778
  { landscape: '18:9', portrait: '9:18', val: 18 / 9 }, // 2.0000
  { landscape: '18.5:9', portrait: '9:18.5', val: 18.5 / 9 }, // 2.0556
  { landscape: '19:9', portrait: '9:19', val: 19 / 9 }, // 2.1111
  { landscape: '19.5:9', portrait: '9:19.5', val: 19.5 / 9 }, // 2.1667
  { landscape: '20:9', portrait: '9:20', val: 20 / 9 }, // 2.2222
  { landscape: '20.5:9', portrait: '9:20.5', val: 20.5 / 9 }, // 2.2778
  { landscape: '21:9', portrait: '9:21', val: 21 / 9 }, // 2.3333
];

/**
 * Cấu hình tập trung danh sách trường EXIF bắt buộc (Story S-42 / Mục II.2)
 * Mặc định:
 * - requireCaptureTime: bắt buộc DateTimeOriginal (thời gian chụp gốc)
 * - requireDevice: bắt buộc Make hoặc Model (thông tin thiết bị chụp)
 * - requireGps: false (GPS không bắt buộc mặc định vì không phải mọi khu vực thi công đều bắt được GPS, ví dụ hầm/trong nhà)
 */
const DEFAULT_REQUIRED_FIELDS_CONFIG = Object.freeze({
  requireCaptureTime: true,
  requireDevice: true,
  requireGps: false,
});

const PHOTO_DATA_STATUS = Object.freeze({
  FULL_DATA: 'full_data',
  INCOMPLETE_DATA: 'incomplete_data',
  INCOMPLETE_DATA_WARNING: 'incomplete_data_warning',
});

const PHOTO_DATA_STATUS_LABELS = Object.freeze({
  full_data: 'Dữ liệu đầy đủ',
  incomplete_data: 'Dữ liệu không đầy đủ',
  incomplete_data_warning: 'Dữ liệu không đầy đủ và cảnh báo',
});

/**
 * Kiểm tra các trường EXIF bắt buộc và trả về danh sách các trường bị thiếu
 *
 * @param {Object} metadata - Siêu dữ liệu ảnh đã trích xuất
 * @param {Object} [config] - Cấu hình trường bắt buộc
 * @returns {Array<{ field: string, label: string }>} Danh sách trường thiếu
 */
function getMissingRequiredFields(metadata = {}, config = DEFAULT_REQUIRED_FIELDS_CONFIG) {
  const cfg = { ...DEFAULT_REQUIRED_FIELDS_CONFIG, ...(config || {}) };
  const missing = [];

  // 1. Thời gian chụp (DateTimeOriginal)
  if (cfg.requireCaptureTime) {
    const capAt = metadata?.captured_at;
    const isValidDate =
      capAt &&
      !isNaN(new Date(capAt).getTime()) &&
      new Date(capAt).getUTCFullYear() >= 2000;
    if (!isValidDate) {
      missing.push({
        field: 'captured_at',
        label: 'Không có thời gian chụp',
      });
    }
  }

  // 2. Thông tin thiết bị (Make hoặc Model)
  if (cfg.requireDevice) {
    const make = metadata?.make ? String(metadata.make).trim() : '';
    const model = metadata?.model ? String(metadata.model).trim() : '';
    if (!make && !model) {
      missing.push({
        field: 'device',
        label: 'Không có thông tin thiết bị',
      });
    }
  }

  // 3. Toạ độ GPS (nếu được cấu hình bắt buộc)
  if (cfg.requireGps) {
    const lat = metadata?.gps_latitude ?? metadata?.gps?.latitude;
    const lng = metadata?.gps_longitude ?? metadata?.gps?.longitude;
    const hasGps =
      lat !== null &&
      lng !== null &&
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      !(lat === 0 && lng === 0) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    if (!hasGps) {
      missing.push({
        field: 'gps',
        label: 'Không có toạ độ GPS',
      });
    }
  }

  return missing;
}

/**
 * Hàm xác định thống nhất 3 trạng thái dữ liệu ảnh (Story S-42 / Mục III)
 *
 * 1. Dữ liệu đầy đủ: Đủ mọi trường bắt buộc theo cấu hình, đọc thành công, không có dấu hiệu cảnh báo.
 * 2. Dữ liệu không đầy đủ: Thiếu ít nhất 1 trường bắt buộc theo cấu hình, không có cảnh báo bất thường.
 * 3. Dữ liệu không đầy đủ và cảnh báo: Có ít nhất 1 dấu hiệu bất thường (kể cả khi EXIF đủ hay thiếu đều thuộc trạng thái này).
 *
 * @param {Object} params
 * @param {Array<Object>} params.missingFields - Danh sách trường thiếu
 * @param {Array<Object>} params.warnings - Danh sách cảnh báo
 * @param {boolean} [params.canEvaluate] - Đã kiểm tra thành công hay chưa
 * @returns {{ data_status: string|null, data_status_label: string|null, anomaly_warnings: Array<Object> }}
 */
function evaluatePhotoDataStatus({ missingFields = [], warnings = [], canEvaluate = true } = {}) {
  if (!canEvaluate) {
    return {
      data_status: null,
      data_status_label: null,
      anomaly_warnings: [],
    };
  }

  const hasMissing = Array.isArray(missingFields) && missingFields.length > 0;

  // Lọc các cảnh báo bất thường (loại trừ các thông báo chỉ đơn thuần nói thiếu trường bắt buộc để tránh đếm trùng)
  const anomalyWarnings = Array.isArray(warnings)
    ? warnings.filter(
        (w) =>
          w &&
          w.code !== 'MISSING_CAMERA_METADATA' &&
          w.code !== 'MISSING_CAPTURE_TIME' &&
          w.code !== 'MISSING_GPS'
      )
    : [];

  const hasAnomalies = anomalyWarnings.length > 0;

  if (hasAnomalies) {
    return {
      data_status: PHOTO_DATA_STATUS.INCOMPLETE_DATA_WARNING,
      data_status_label: PHOTO_DATA_STATUS_LABELS[PHOTO_DATA_STATUS.INCOMPLETE_DATA_WARNING],
      anomaly_warnings: anomalyWarnings,
    };
  }

  if (hasMissing) {
    return {
      data_status: PHOTO_DATA_STATUS.INCOMPLETE_DATA,
      data_status_label: PHOTO_DATA_STATUS_LABELS[PHOTO_DATA_STATUS.INCOMPLETE_DATA],
      anomaly_warnings: [],
    };
  }

  return {
    data_status: PHOTO_DATA_STATUS.FULL_DATA,
    data_status_label: PHOTO_DATA_STATUS_LABELS[PHOTO_DATA_STATUS.FULL_DATA],
    anomaly_warnings: [],
  };
}

/**
 * Tính tỷ lệ khung hình và format chuỗi tỷ lệ rút gọn
 */
function getAspectRatioInfo(width, height) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { ratio: null, ratioStr: null, isPortrait: false };
  }

  const isPortrait = height >= width;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const ratio = longSide / shortSide;

  // Sử dụng thuật toán GCD để tính tỷ lệ rút gọn chính xác nhất
  const gcdRatioStr = calculateAspectRatio(width, height);

  let closest = null;
  let minDiff = 0.035; // Ngưỡng nhận diện tỷ lệ chuẩn
  for (const item of STANDARD_RATIOS) {
    const diff = Math.abs(ratio - item.val);
    if (diff < minDiff) {
      minDiff = diff;
      closest = item;
    }
  }

  const ratioStr = closest
    ? isPortrait
      ? closest.portrait
      : closest.landscape
    : gcdRatioStr || `${ratio.toFixed(2)}:1`;

  return { ratio, ratioStr, isPortrait };
}

/**
 * Kiểm tra xem kích thước và đặc trưng ảnh có dấu hiệu chụp lại màn hình không
 */
function evaluateScreenshotSigns({ width, height, make, model, fileName }) {
  if (!width || !height) {
    return { isScreenshot: false, reason: null, confidence: 'low' };
  }

  const resKey = `${width}x${height}`;
  const isExactScreenRes = KNOWN_SCREENSHOT_RESOLUTIONS.has(resKey);
  const { ratio, ratioStr } = getAspectRatioInfo(width, height);

  // Tên file có chứa dấu hiệu chụp màn hình
  const hasScreenshotName =
    typeof fileName === 'string' &&
    /screenshot|screen_shot|screen-shot|chup[-_]?man[-_]?hinh/i.test(fileName);

  // Có thông tin máy ảnh phần cứng thật (Make / Model từ camera)
  const hasCameraHardware = !!(make || model);

  // Điều kiện nghi vấn chụp màn hình:
  // 1. Tỷ lệ màn hình điện thoại (1.75 <= ratio <= 2.45) hoặc trùng độ phân giải chuẩn
  // 2. VÀ không có thông tin máy ảnh phần cứng (Make, Model)
  // 3. HOẶC tên file chứa từ khoá screenshot
  const hasScreenAspectRatio = ratio !== null && ratio >= 1.75 && ratio <= 2.45;

  if (hasScreenshotName && !hasCameraHardware) {
    return {
      isScreenshot: true,
      confidence: 'high',
      reason: `Tên tệp "${fileName}" và kích thước ${width}x${height} (${ratioStr}) có dấu hiệu ảnh chụp màn hình thiết bị.`,
    };
  }

  if (isExactScreenRes && !hasCameraHardware) {
    return {
      isScreenshot: true,
      confidence: 'high',
      reason: `Độ phân giải ${width}x${height} trùng khớp chính xác với màn hình điện thoại phổ biến và không có thông tin máy ảnh gốc.`,
    };
  }

  if (hasScreenAspectRatio && !hasCameraHardware) {
    return {
      isScreenshot: true,
      confidence: 'medium',
      reason: `Kích thước ảnh ${width}x${height} (tỷ lệ ${ratioStr}) tương ứng với tỷ lệ màn hình điện thoại và thiếu siêu dữ liệu máy ảnh gốc.`,
    };
  }

  return { isScreenshot: false, reason: null, confidence: 'low' };
}

/**
 * Phân tích và phát hiện dấu hiệu bất thường của ảnh bằng chứng
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - Buffer file ảnh
 * @param {string} [params.mimeType] - MIME type
 * @param {string} [params.fileName] - Tên file gốc
 * @param {number} [params.fileSize] - Kích thước file
 * @param {Date|string} [params.capturedAt] - Thời gian chụp đã trích xuất (nếu có)
 * @param {Date|string} [params.voucherCreatedAt] - Thời điểm lập phiếu nghiệm thu để đối chiếu
 * @param {Object} [params.clientFallback] - Metadata client gửi kèm
 * @param {Array<Object>} [params.existingPhotos] - Danh sách ảnh đã có trong dự án để kiểm tra trùng lặp SHA-256
 * @param {Object} [params.options] - Tuỳ chọn kiểm tra ({ thresholdDays: 30 })
 * @param {Object} [params.photoMeta] - Kết quả trích xuất EXIF từ photoMetadata service nếu đã chạy
 * @returns {Promise<Object>} Kết quả kiểm tra quy tắc bất thường
 */
async function inspectPhotoMetadata({
  buffer,
  mimeType = null,
  fileName = null,
  fileSize = null,
  capturedAt = null,
  voucherCreatedAt = null,
  clientFallback = {},
  make = null,
  model = null,
  existingPhotos = [],
  options = {},
  photoMeta = null,
} = {}) {
  const inspectedAt = new Date().toISOString();
  const warnings = [];

  // Tính mã băm nội dung SHA-256 để phát hiện ảnh trùng lặp tuyệt đối
  const fileHash =
    buffer && Buffer.isBuffer(buffer) && buffer.length > 0
      ? crypto.createHash('sha256').update(buffer).digest('hex')
      : null;

  const result = {
    status: 'clean', // 'clean' | 'warning' | 'incomplete_data' | 'error'
    can_evaluate: true,
    has_sufficient_data: false,
    summary: 'Bằng chứng hợp lệ, không phát hiện dấu hiệu bất thường.',
    warnings: [],
    metadata: {
      width: null,
      height: null,
      aspect_ratio: null,
      file_size: fileSize || (buffer ? buffer.length : 0),
      file_hash: fileHash,
      mime_type: mimeType || 'unknown',
      make: null,
      model: null,
      software: null,
      iso: null,
      aperture: null,
      shutter_speed: null,
      captured_at: null,
      captured_at_source: null,
      gps_latitude: null,
      gps_longitude: null,
      gps_accuracy_m: null,
      has_exif: false,
      is_screenshot: false,
    },
    inspected_at: inspectedAt,
  };

  // 1. Kiểm tra Buffer & Tính hợp lệ nhị phân
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    result.status = 'error';
    result.can_evaluate = false;
    result.has_sufficient_data = false;
    result.summary = 'Không thể kiểm tra do tệp dữ liệu rỗng hoặc không tồn tại.';
    result.warnings.push({
      code: 'FILE_CORRUPTED_OR_UNREADABLE',
      severity: 'high',
      title: 'Tệp ảnh rỗng hoặc không hợp lệ',
      reason: 'Dữ liệu nhị phân của tệp không tồn tại hoặc có kích thước 0 byte.',
      confidence: 'high',
      actual_value: '0 bytes',
      comparison_value: '> 0 bytes',
      action_suggestion: 'Tải lại tệp ảnh hợp lệ.',
    });
    return result;
  }

  // 2. Trích xuất metadata bằng photoMetadata service nếu chưa có
  const meta =
    photoMeta ||
    (await extractPhotoMetadata(buffer, mimeType, clientFallback));

  // 3. Phân loại trạng thái lỗi kỹ thuật (unsupported / unreadable)
  if (meta.metadata_status === 'unsupported') {
    result.status = 'error';
    result.can_evaluate = false;
    result.has_sufficient_data = false;
    result.summary = 'Định dạng tệp không được hỗ trợ hoặc tệp ảnh không hợp lệ.';
    result.warnings.push({
      code: 'FORMAT_UNSUPPORTED',
      severity: 'high',
      title: 'Định dạng tệp không hỗ trợ',
      reason: `Định dạng tệp (${mimeType || 'không xác định'}) không hợp lệ hoặc không nằm trong danh sách hỗ trợ trích xuất EXIF.`,
      confidence: 'high',
      actual_value: mimeType || 'unknown',
      comparison_value: 'JPEG, PNG, WebP',
      action_suggestion: 'Sử dụng định dạng ảnh phổ biến (JPEG, PNG, WebP).',
    });
    return result;
  }

  if (meta.metadata_status === 'unreadable') {
    result.status = 'error';
    result.can_evaluate = false;
    result.has_sufficient_data = false;
    result.summary = 'Cấu trúc siêu dữ liệu EXIF bị lỗi hoặc không thể đọc.';
    result.warnings.push({
      code: 'METADATA_UNREADABLE',
      severity: 'high',
      title: 'Siêu dữ liệu bị hỏng hoặc không thể đọc',
      reason: 'Header EXIF trong tệp ảnh bị lỗi cấu trúc nhị phân không thể giải mã.',
      confidence: 'high',
      actual_value: 'EXIF parsing error',
      comparison_value: 'Hợp chuẩn TIFF/EXIF',
      action_suggestion: 'Kiểm tra tệp ảnh gốc xem có bị hỏng trong quá trình truyền tải.',
    });
    return result;
  }

  // 4. Đồng bộ dữ liệu tệp và thông số máy ảnh
  const width = meta.width;
  const height = meta.height;
  const ratioStr = meta.aspect_ratio || calculateAspectRatio(width, height);

  const finalMake =
    make ||
    meta.make ||
    (clientFallback?.make ? String(clientFallback.make).trim() : null);
  const finalModel =
    model ||
    meta.model ||
    (clientFallback?.model ? String(clientFallback.model).trim() : null);
  const software = meta.software;
  const hasExif = meta.has_exif;

  // Thời gian chụp
  let finalCapturedAt = null;
  if (capturedAt) {
    finalCapturedAt = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
    if (isNaN(finalCapturedAt.getTime()) || finalCapturedAt.getUTCFullYear() < 2000) finalCapturedAt = null;
  } else if (meta.captured_at) {
    finalCapturedAt = new Date(meta.captured_at);
    if (isNaN(finalCapturedAt.getTime()) || finalCapturedAt.getUTCFullYear() < 2000) finalCapturedAt = null;
  }

  result.metadata = {
    width: width || null,
    height: height || null,
    aspect_ratio: ratioStr || null,
    file_size: fileSize || buffer.length,
    file_hash: fileHash,
    mime_type: mimeType || 'image/jpeg',
    make: finalMake,
    model: finalModel,
    software,
    iso: meta.iso,
    aperture: meta.aperture,
    shutter_speed: meta.shutter_speed,
    captured_at: finalCapturedAt ? finalCapturedAt.toISOString() : null,
    captured_at_source: capturedAt ? 'provided' : meta.captured_at_source,
    gps_latitude: meta.gps_latitude,
    gps_longitude: meta.gps_longitude,
    gps_accuracy_m: meta.gps_accuracy_m,
    has_exif: hasExif,
    is_screenshot: false,
  };

  // 5. KIỂM TRA QUY TẮC BẤT THƯỜNG

  // Quy tắc 0: Phát hiện ảnh trùng lặp nội bộ (cùng mã băm SHA-256)
  if (fileHash && Array.isArray(existingPhotos) && existingPhotos.length > 0) {
    const duplicate = existingPhotos.find(
      (p) => p && p.file_hash === fileHash && String(p.id) !== String(clientFallback?.photoId)
    );
    if (duplicate) {
      warnings.push({
        code: 'DUPLICATE_PHOTO_DETECTED',
        severity: 'high',
        title: 'Ảnh trùng lặp với bằng chứng đã có trong hệ thống',
        reason: `Tệp ảnh có mã băm SHA-256 trùng khớp 100% với ảnh #${duplicate.id} ("${duplicate.file_name || 'ảnh đã lưu'}")${
          duplicate.batch_name ? ` thuộc đợt "${duplicate.batch_name}"` : ''
        }.`,
        confidence: 'high',
        actual_value: `${fileHash.slice(0, 16)}...`,
        comparison_value: `Ảnh #${duplicate.id} (${duplicate.file_name || 'N/A'})`,
        action_suggestion: 'Đối chiếu xem ảnh có bị gửi lặp hoặc tái sử dụng từ đợt nghiệm thu khác hay không.',
      });
    }
  }

  // Quy tắc 1: Dấu hiệu chụp lại màn hình
  const screenshotEval = evaluateScreenshotSigns({
    width,
    height,
    make: finalMake,
    model: finalModel,
    fileName,
  });

  if (screenshotEval.isScreenshot) {
    result.metadata.is_screenshot = true;
    warnings.push({
      code: 'SCREENSHOT_SUSPECTED',
      severity: 'high',
      title: 'Dấu hiệu ảnh chụp lại màn hình',
      reason: screenshotEval.reason,
      confidence: screenshotEval.confidence,
      actual_value: width && height ? `${width}×${height} px (${ratioStr || 'N/A'})` : fileName,
      comparison_value: 'Màn hình thiết bị chuẩn',
      action_suggestion: 'Yêu cầu kỹ sư cung cấp tệp ảnh gốc chụp trực tiếp từ máy ảnh hiện trường thay vì ảnh chụp lại màn hình.',
    });
  }

  // Quy tắc 2: Thiếu siêu dữ liệu máy ảnh gốc (Make, Model)
  if (!finalMake && !finalModel) {
    if (!screenshotEval.isScreenshot) {
      warnings.push({
        code: 'MISSING_CAMERA_METADATA',
        severity: 'medium',
        title: 'Thiếu siêu dữ liệu thiết bị chụp',
        reason:
          'Tệp ảnh không chứa thông tin thiết bị (Make, Model), thường do ảnh qua ứng dụng nhắn tin nén hoặc bị xoá siêu dữ liệu.',
        confidence: 'medium',
        actual_value: 'Không có thông tin Make/Model',
        comparison_value: 'Yêu cầu máy ảnh gốc',
        action_suggestion: 'Ảnh có thể đã được chia sẻ qua ứng dụng nhắn tin làm mất EXIF gốc. Nhắc nhở người chụp gửi file gốc chất lượng cao.',
      });
    }
  }

  // Quy tắc 3: Thiếu thời gian chụp gốc
  if (!finalCapturedAt) {
    warnings.push({
      code: 'MISSING_CAPTURE_TIME',
      severity: 'medium',
      title: 'Thiếu thời gian chụp gốc',
      reason: 'Tệp ảnh không ghi nhận thời gian chụp DateTimeOriginal trong EXIF.',
      confidence: 'high',
      actual_value: 'Thiếu thẻ DateTimeOriginal',
      comparison_value: 'Thời gian chụp gốc',
      action_suggestion: 'Kiểm tra nhật ký thi công cùng ngày để đối chiếu tiến độ thực hiện.',
    });
  }

  // Quy tắc 4: Đối chiếu thời gian chụp với ngày lập phiếu nghiệm thu
  const thresholdDays = Number(options.thresholdDays) > 0 ? Number(options.thresholdDays) : 30;
  if (finalCapturedAt && voucherCreatedAt) {
    const vDate = voucherCreatedAt instanceof Date ? voucherCreatedAt : new Date(voucherCreatedAt);
    if (!isNaN(vDate.getTime())) {
      const diffMs = vDate.getTime() - finalCapturedAt.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // Ảnh chụp cách ngày lập phiếu quá xa (> thresholdDays ngày)
      if (diffDays > thresholdDays) {
        warnings.push({
          code: 'DATE_TOO_FAR',
          severity: 'high',
          title: 'Thời điểm chụp cách xa ngày lập phiếu',
          reason: `Ảnh được chụp trước ngày lập phiếu ${Math.round(diffDays)} ngày (vượt ngưỡng đề xuất ${thresholdDays} ngày), cần kiểm tra đối chiếu tính thời sự của bằng chứng.`,
          confidence: 'high',
          actual_value: finalCapturedAt.toISOString().slice(0, 10),
          comparison_value: vDate.toISOString().slice(0, 10),
          action_suggestion: 'Đối chiếu với nhật ký thi công xem hạng mục có được thi công tại thời điểm chụp này hay không.',
        });
      } else if (diffDays < -1) {
        // Thời điểm chụp trong tương lai so với ngày lập phiếu (> 1 ngày)
        warnings.push({
          code: 'DATE_IN_FUTURE',
          severity: 'high',
          title: 'Thời điểm chụp sau ngày lập phiếu',
          reason: 'Thời điểm chụp ghi nhận trong ảnh muộn hơn ngày tạo phiếu nghiệm thu, có dấu hiệu sai lệch đồng hồ thiết bị.',
          confidence: 'high',
          actual_value: finalCapturedAt.toISOString().slice(0, 10),
          comparison_value: vDate.toISOString().slice(0, 10),
          action_suggestion: 'Kiểm tra thiết lập ngày giờ trên thiết bị chụp của người gửi bằng chứng.',
        });
      }
    }
  }

  // 6. Xác định danh sách trường bắt buộc bị thiếu & 3 trạng thái chuẩn (Mục III)
  const missingFields = getMissingRequiredFields(result.metadata, options.requiredFieldsConfig);
  const dataStatusInfo = evaluatePhotoDataStatus({
    missingFields,
    warnings,
    canEvaluate: result.can_evaluate,
  });

  result.warnings = warnings;
  result.missing_fields = missingFields;
  result.data_status = dataStatusInfo.data_status;
  result.data_status_label = dataStatusInfo.data_status_label;
  result.has_sufficient_data = missingFields.length === 0;

  if (dataStatusInfo.data_status === PHOTO_DATA_STATUS.INCOMPLETE_DATA_WARNING) {
    result.status = 'warning';
    result.summary = `Phát hiện dấu hiệu bất thường cần xem xét.${missingFields.length > 0 ? ` Đồng thời thiếu: ${missingFields.map((f) => f.label).join(', ')}.` : ''}`;
  } else if (dataStatusInfo.data_status === PHOTO_DATA_STATUS.INCOMPLETE_DATA) {
    result.status = 'incomplete_data';
    result.summary = `Dữ liệu không đầy đủ (thiếu một số siêu dữ liệu gốc: ${missingFields.map((f) => f.label).join(', ')}).`;
  } else if (dataStatusInfo.data_status === PHOTO_DATA_STATUS.FULL_DATA) {
    result.status = 'clean';
    result.summary = 'Bằng chứng hợp lệ: Dữ liệu đầy đủ, không phát hiện dấu hiệu bất thường.';
  } else {
    result.status = 'error';
    result.summary = 'Không thể kiểm tra do tệp dữ liệu không hợp lệ.';
  }

  return result;
}

/**
 * Đánh giá nhanh bản ghi ảnh trong cơ sở dữ liệu (khi không có buffer trực tiếp)
 */
function inspectVoucherPhotoRecord(photoRow, voucherRow = null) {
  if (!photoRow) {
    return {
      status: 'error',
      can_evaluate: false,
      has_sufficient_data: false,
      summary: 'Không có dữ liệu ảnh',
      warnings: [],
      metadata: {},
      inspected_at: new Date().toISOString(),
    };
  }

  // Nếu bản ghi đã có kết quả kiểm tra được lưu sẵn trong exif_metadata
  let savedInspection = photoRow.exif_metadata;
  if (typeof savedInspection === 'string') {
    try {
      savedInspection = JSON.parse(savedInspection);
    } catch {
      savedInspection = null;
    }
  }
  if (
    savedInspection &&
    typeof savedInspection === 'object' &&
    (savedInspection.status || savedInspection.data_status)
  ) {
    // Đảm bảo các trường toạ độ và thông số tệp luôn có giá trị từ bản ghi DB nếu trong JSON cũ bị null
    if (savedInspection.metadata) {
      if (savedInspection.metadata.gps_latitude === null && photoRow.gps_latitude !== null) {
        savedInspection.metadata.gps_latitude = parseFloat(photoRow.gps_latitude);
      }
      if (savedInspection.metadata.gps_longitude === null && photoRow.gps_longitude !== null) {
        savedInspection.metadata.gps_longitude = parseFloat(photoRow.gps_longitude);
      }
      if (savedInspection.metadata.gps_accuracy_m === null && photoRow.gps_accuracy_m !== null) {
        savedInspection.metadata.gps_accuracy_m = parseFloat(photoRow.gps_accuracy_m);
      }
      if (!savedInspection.metadata.captured_at && photoRow.captured_at) {
        savedInspection.metadata.captured_at = photoRow.captured_at;
      }
      if (!savedInspection.metadata.captured_at_source && photoRow.captured_at_source) {
        savedInspection.metadata.captured_at_source = photoRow.captured_at_source;
      }
      if (!savedInspection.metadata.file_name && photoRow.file_name) {
        savedInspection.metadata.file_name = photoRow.file_name;
      }
      if (!savedInspection.metadata.file_size && photoRow.file_size) {
        savedInspection.metadata.file_size = photoRow.file_size;
      }
      if (!savedInspection.metadata.mime_type && photoRow.mime_type) {
        savedInspection.metadata.mime_type = photoRow.mime_type;
      }
    }

    if (!savedInspection.data_status || !savedInspection.missing_fields) {
      const missing = getMissingRequiredFields(savedInspection.metadata || {});
      const ds = evaluatePhotoDataStatus({
        missingFields: missing,
        warnings: savedInspection.warnings || [],
        canEvaluate: savedInspection.can_evaluate !== false,
      });
      savedInspection.missing_fields = missing;
      savedInspection.data_status = ds.data_status;
      savedInspection.data_status_label = ds.data_status_label;
    }
    return savedInspection;
  }

  const warnings = [];
  const fileName = photoRow.file_name || '';
  const capturedAt = photoRow.captured_at ? new Date(photoRow.captured_at) : null;
  const voucherDate = voucherRow?.created_at ? new Date(voucherRow.created_at) : null;

  // Kiểm tra tên file chụp màn hình
  const hasScreenshotName = /screenshot|screen_shot|screen-shot|chup[-_]?man[-_]?hinh/i.test(fileName);
  if (hasScreenshotName) {
    warnings.push({
      code: 'SCREENSHOT_SUSPECTED',
      severity: 'high',
      title: 'Dấu hiệu ảnh chụp lại màn hình',
      reason: `Tên tệp "${fileName}" có dấu hiệu ảnh chụp lại màn hình thiết bị.`,
      confidence: 'medium',
    });
  }

  // Thiếu thời gian chụp
  if (!capturedAt) {
    warnings.push({
      code: 'MISSING_CAPTURE_TIME',
      severity: 'medium',
      title: 'Thiếu thời gian chụp gốc',
      reason: 'Bản ghi ảnh không có thông tin thời gian chụp gốc.',
      confidence: 'high',
    });
  } else if (voucherDate && !isNaN(voucherDate.getTime())) {
    const diffDays = (voucherDate.getTime() - capturedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 30) {
      warnings.push({
        code: 'DATE_TOO_FAR',
        severity: 'high',
        title: 'Thời điểm chụp cách xa ngày lập phiếu',
        reason: `Ảnh được chụp trước ngày lập phiếu ${Math.round(diffDays)} ngày (vượt ngưỡng thông thường 30 ngày).`,
        confidence: 'high',
      });
    } else if (diffDays < -1) {
      warnings.push({
        code: 'DATE_IN_FUTURE',
        severity: 'high',
        title: 'Thời điểm chụp sau ngày lập phiếu',
        reason: 'Thời điểm chụp ghi nhận trong ảnh muộn hơn ngày tạo phiếu nghiệm thu.',
        confidence: 'high',
      });
    }
  }

  // Thiếu siêu dữ liệu
  if (photoRow.metadata_status === 'none' || photoRow.metadata_status === 'not_processed') {
    if (!hasScreenshotName) {
      warnings.push({
        code: 'MISSING_CAMERA_METADATA',
        severity: 'medium',
        title: 'Thiếu siêu dữ liệu thiết bị chụp',
        reason: 'Ảnh không ghi nhận thông tin siêu dữ liệu máy ảnh gốc.',
        confidence: 'medium',
      });
    }
  } else if (photoRow.metadata_status === 'unreadable') {
    warnings.push({
      code: 'METADATA_UNREADABLE',
      severity: 'high',
      title: 'Siêu dữ liệu bị hỏng hoặc không thể đọc',
      reason: 'Siêu dữ liệu ảnh bị lỗi hoặc không thể giải mã.',
      confidence: 'high',
    });
  }

  const width = savedInspection?.metadata?.width || savedInspection?.width || savedInspection?.ImageWidth || null;
  const height = savedInspection?.metadata?.height || savedInspection?.height || savedInspection?.ImageHeight || null;
  const calculatedRatio = calculateAspectRatio(width, height);

  const metadata = {
    file_name: fileName,
    file_size: photoRow.file_size,
    mime_type: photoRow.mime_type,
    width,
    height,
    aspect_ratio: savedInspection?.metadata?.aspect_ratio || calculatedRatio || null,
    make: savedInspection?.metadata?.make || savedInspection?.make || savedInspection?.Make || null,
    model: savedInspection?.metadata?.model || savedInspection?.model || savedInspection?.Model || null,
    software: savedInspection?.metadata?.software || savedInspection?.software || savedInspection?.Software || null,
    iso: savedInspection?.metadata?.iso || savedInspection?.iso || savedInspection?.ISO || null,
    aperture: savedInspection?.metadata?.aperture || savedInspection?.aperture || null,
    shutter_speed: savedInspection?.metadata?.shutter_speed || savedInspection?.shutter_speed || null,
    captured_at: photoRow.captured_at,
    captured_at_source: photoRow.captured_at_source,
    gps_latitude: photoRow.gps_latitude ? parseFloat(photoRow.gps_latitude) : null,
    gps_longitude: photoRow.gps_longitude ? parseFloat(photoRow.gps_longitude) : null,
    gps_accuracy_m: photoRow.gps_accuracy_m ? parseFloat(photoRow.gps_accuracy_m) : null,
    metadata_status: photoRow.metadata_status,
    is_screenshot: hasScreenshotName,
  };

  const missingFields = getMissingRequiredFields(metadata);
  const canEvaluate = photoRow.metadata_status !== 'unreadable' && photoRow.metadata_status !== 'unsupported';
  const dataStatusInfo = evaluatePhotoDataStatus({
    missingFields,
    warnings,
    canEvaluate,
  });

  let status = 'clean';
  if (photoRow.metadata_status === 'unreadable' || photoRow.metadata_status === 'unsupported') {
    status = 'error';
  } else if (dataStatusInfo.data_status === PHOTO_DATA_STATUS.INCOMPLETE_DATA_WARNING) {
    status = 'warning';
  } else if (dataStatusInfo.data_status === PHOTO_DATA_STATUS.INCOMPLETE_DATA) {
    status = 'incomplete_data';
  }

  return {
    status,
    data_status: dataStatusInfo.data_status,
    data_status_label: dataStatusInfo.data_status_label,
    missing_fields: missingFields,
    can_evaluate: canEvaluate,
    has_sufficient_data: missingFields.length === 0,
    summary:
      dataStatusInfo.data_status === PHOTO_DATA_STATUS.INCOMPLETE_DATA_WARNING
        ? `Phát hiện dấu hiệu bất thường cần xem xét.${missingFields.length > 0 ? ` Đồng thời thiếu: ${missingFields.map((f) => f.label).join(', ')}.` : ''}`
        : dataStatusInfo.data_status === PHOTO_DATA_STATUS.INCOMPLETE_DATA
        ? `Dữ liệu không đầy đủ: ${missingFields.map((f) => f.label).join(', ')}.`
        : status === 'error'
        ? 'Siêu dữ liệu ảnh bị lỗi.'
        : 'Dữ liệu đầy đủ, không phát hiện dấu hiệu bất thường.',
    warnings,
    metadata,
    inspected_at: new Date().toISOString(),
  };
}

/**
 * Phân quyền hiển thị kết quả kiểm tra (Story S-42 / Mục 7)
 * - Người duyệt (BQL, CĐT): Xem toàn bộ metadata, dấu hiệu bất thường, dữ liệu đối chiếu và lý do.
 * - Người gửi / thành viên thông thường: Xem ảnh, trạng thái và tóm tắt lý do, không xem dữ liệu đối chiếu nội bộ.
 *
 * @param {Object} inspection - Kết quả kiểm tra đầy đủ
 * @param {boolean} isReviewer - Người dùng có quyền duyệt / xem đầy đủ hay không
 * @returns {Object} Kết quả kiểm tra đã được lọc theo quyền
 */
function sanitizeInspectionForRole(inspection, isReviewer = false) {
  if (!inspection || typeof inspection !== 'object') return inspection;
  if (isReviewer) return inspection;

  const warnings = Array.isArray(inspection.warnings) ? inspection.warnings : [];

  return {
    status: inspection.status,
    status_label: inspection.status_label,
    data_status: inspection.data_status || null,
    data_status_label: inspection.data_status_label || null,
    missing_fields: Array.isArray(inspection.missing_fields) ? inspection.missing_fields : [],
    can_evaluate: inspection.can_evaluate,
    has_sufficient_data: inspection.has_sufficient_data,
    summary: inspection.summary,
    warnings_count: warnings.length,
    warnings: warnings.map((w) => ({
      code: w?.code,
      title: w?.title,
      severity: w?.severity,
      reason: w?.reason,
      // Không để lộ actual_value, comparison_value đối chiếu kỹ thuật cho người gửi
    })),
    metadata: {
      width: inspection.metadata?.width || null,
      height: inspection.metadata?.height || null,
      aspect_ratio: inspection.metadata?.aspect_ratio || null,
      file_size: inspection.metadata?.file_size || null,
      mime_type: inspection.metadata?.mime_type || null,
    },
    inspected_at: inspection.inspected_at,
  };
}

module.exports = {
  extractImageDimensions,
  getAspectRatioInfo,
  evaluateScreenshotSigns,
  inspectPhotoMetadata,
  inspectVoucherPhotoRecord,
  sanitizeInspectionForRole,
  KNOWN_SCREENSHOT_RESOLUTIONS,
  DEFAULT_REQUIRED_FIELDS_CONFIG,
  PHOTO_DATA_STATUS,
  PHOTO_DATA_STATUS_LABELS,
  getMissingRequiredFields,
  evaluatePhotoDataStatus,
};
