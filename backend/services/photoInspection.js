/**
 * Service phân tích và phát hiện dấu hiệu bất thường của ảnh bằng chứng (EXIF / Metadata)
 * Story S-42: T-109
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

const exifr = require('exifr');
const {
  isSupportedMagicBytes,
  parseExifDateTime,
  isValidCaptureDate,
  SUPPORTED_MIME_TYPES,
} = require('./photoMetadata');

const EXIF_PARSE_BYTE_LIMIT = 256 * 1024;

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
 * Trích xuất kích thước ảnh (width, height) từ buffer nhị phân (PNG, JPEG, WebP)
 * Đảm bảo đọc được kích thước kể cả khi EXIF đã bị lột bỏ hoàn toàn (như ảnh screenshot).
 */
function extractImageDimensions(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return { width: null, height: null };
  }

  // 1. PNG: magic bytes 89 50 4E 47 0D 0A 1A 0A -> IHDR starts at byte 12
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    if (buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0 && width < 50000 && height < 50000) {
        return { width, height };
      }
    }
  }

  // 2. JPEG: magic bytes FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    const len = Math.min(buffer.length, 128 * 1024); // Quét trong 128KB đầu
    while (offset < len - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // Markers SOF0..SOF15 (loại trừ DHT=C4, JPG=C8, DAC=CC)
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }

      // Đọc length của segment
      if (offset + 3 >= len) break;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }

  // 3. WebP: RIFF .... WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8 ' && buffer.length >= 30) {
      // VP8 lossy
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (width > 0 && height > 0) return { width, height };
    } else if (format === 'VP8L' && buffer.length >= 25) {
      // VP8L lossless
      const b1 = buffer[21];
      const b2 = buffer[22];
      const b3 = buffer[23];
      const b4 = buffer[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      if (width > 0 && height > 0) return { width, height };
    } else if (format === 'VP8X' && buffer.length >= 30) {
      // VP8X extended
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      if (width > 0 && height > 0) return { width, height };
    }
  }

  return { width: null, height: null };
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
    : `${ratio.toFixed(2)}:1`;

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
} = {}) {
  const inspectedAt = new Date().toISOString();
  const warnings = [];

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
      mime_type: mimeType || 'unknown',
      make: null,
      model: null,
      software: null,
      captured_at: null,
      captured_at_source: null,
      gps_latitude: null,
      gps_longitude: null,
      has_exif: false,
      is_screenshot: false,
    },
    inspected_at: inspectedAt,
  };

  // 1. Kiểm tra Buffer & Định dạng
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
    });
    return result;
  }

  const isMimeSupported = mimeType ? SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase()) : false;
  const isMagicSupported = isSupportedMagicBytes(buffer);

  if (!isMimeSupported && !isMagicSupported) {
    result.status = 'error';
    result.can_evaluate = false;
    result.has_sufficient_data = false;
    result.summary = 'Định dạng tệp không được hỗ trợ để phân tích siêu dữ liệu.';
    result.warnings.push({
      code: 'FORMAT_UNSUPPORTED',
      severity: 'high',
      title: 'Định dạng tệp không hỗ trợ',
      reason: `Định dạng tệp (${mimeType || 'không xác định'}) không nằm trong danh sách hỗ trợ trích xuất EXIF.`,
      confidence: 'high',
    });
    return result;
  }

  // 2. Trích xuất kích thước ảnh nhị phân
  let { width, height } = extractImageDimensions(buffer);

  // 3. Đọc EXIF nâng cao từ buffer bằng exifr
  const parseBuffer = buffer.slice(0, EXIF_PARSE_BYTE_LIMIT);
  let parsedExif = null;
  let exifParseError = false;

  try {
    parsedExif = await exifr.parse(parseBuffer, {
      pick: [
        'Make',
        'Model',
        'Software',
        'DateTimeOriginal',
        'OffsetTimeOriginal',
        'GPSLatitude',
        'GPSLongitude',
        'GPSLatitudeRef',
        'GPSLongitudeRef',
        'ExifImageWidth',
        'ExifImageHeight',
        'ImageWidth',
        'ImageHeight',
        'ISO',
        'FNumber',
        'ExposureTime',
        'ShutterSpeedValue',
        'ApertureValue',
      ],
      tiff: true,
      xmp: true,
      exif: true,
      gps: true,
      silentErrors: false,
      translateValues: false,
      reviveValues: false,
    });
  } catch (_err) {
    exifParseError = true;
  }

  if (exifParseError) {
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
    });
    return result;
  }

  // Điền metadata nếu exifr lấy được kích thước mà binary parser chưa có
  if (!width && parsedExif) {
    width = parsedExif.ImageWidth || parsedExif.ExifImageWidth || null;
  }
  if (!height && parsedExif) {
    height = parsedExif.ImageHeight || parsedExif.ExifImageHeight || null;
  }

  const { ratioStr } = getAspectRatioInfo(width, height);
  const finalMake =
    make ||
    (parsedExif?.Make ? String(parsedExif.Make).trim() : null) ||
    (clientFallback?.make ? String(clientFallback.make).trim() : null);
  const finalModel =
    model ||
    (parsedExif?.Model ? String(parsedExif.Model).trim() : null) ||
    (clientFallback?.model ? String(clientFallback.model).trim() : null);
  const software = parsedExif?.Software ? String(parsedExif.Software).trim() : null;
  const hasExif = !!(parsedExif && Object.keys(parsedExif).length > 0);

  // Xử lý thời gian chụp
  let finalCapturedAt = null;
  if (capturedAt) {
    finalCapturedAt = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
    if (!isValidCaptureDate(finalCapturedAt)) finalCapturedAt = null;
  } else if (parsedExif?.DateTimeOriginal) {
    finalCapturedAt = parseExifDateTime(parsedExif.DateTimeOriginal, parsedExif.OffsetTimeOriginal);
  } else if (clientFallback?.exif_captured_at) {
    const dClient = new Date(clientFallback.exif_captured_at);
    if (isValidCaptureDate(dClient)) finalCapturedAt = dClient;
  }

  result.metadata = {
    width: width || null,
    height: height || null,
    aspect_ratio: ratioStr || null,
    file_size: fileSize || buffer.length,
    mime_type: mimeType || 'image/jpeg',
    make: finalMake,
    model: finalModel,
    software,
    iso: parsedExif?.ISO ? String(parsedExif.ISO) : (clientFallback?.iso || null),
    aperture: parsedExif?.FNumber
      ? `f/${parsedExif.FNumber}`
      : parsedExif?.ApertureValue
      ? `f/${parsedExif.ApertureValue}`
      : null,
    shutter_speed: parsedExif?.ExposureTime
      ? parsedExif.ExposureTime < 1
        ? `1/${Math.round(1 / parsedExif.ExposureTime)}s`
        : `${parsedExif.ExposureTime}s`
      : null,
    captured_at: finalCapturedAt ? finalCapturedAt.toISOString() : null,
    captured_at_source: capturedAt ? 'provided' : parsedExif?.DateTimeOriginal ? 'exif' : null,
    gps_latitude: null,
    gps_longitude: null,
    has_exif: hasExif,
    is_screenshot: false,
  };

  // 4. KIỂM TRA QUY TẮC BẤT THƯỜNG (S-42)

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
    });
  }

  // Quy tắc 2: Thiếu siêu dữ liệu máy ảnh gốc (Make, Model)
  if (!finalMake && !finalModel) {
    // Nếu chưa bị cảnh báo screenshot thì mới gắn cảnh báo thiếu máy ảnh
    if (!screenshotEval.isScreenshot) {
      warnings.push({
        code: 'MISSING_CAMERA_METADATA',
        severity: 'medium',
        title: 'Thiếu siêu dữ liệu thiết bị chụp',
        reason:
          'Tệp ảnh không chứa thông tin thiết bị (Make, Model), thường do ảnh qua ứng dụng nhắn tin nén hoặc bị xoá siêu dữ liệu.',
        confidence: 'medium',
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
    });
  }

  // Quy tắc 4: Đối chiếu thời gian chụp với ngày lập phiếu nghiệm thu
  if (finalCapturedAt && voucherCreatedAt) {
    const vDate = voucherCreatedAt instanceof Date ? voucherCreatedAt : new Date(voucherCreatedAt);
    if (!isNaN(vDate.getTime())) {
      const diffMs = vDate.getTime() - finalCapturedAt.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // Ảnh chụp cách ngày lập phiếu quá xa (> 30 ngày)
      if (diffDays > 30) {
        warnings.push({
          code: 'DATE_TOO_FAR',
          severity: 'high',
          title: 'Thời điểm chụp cách xa ngày lập phiếu',
          reason: `Ảnh được chụp trước ngày lập phiếu ${Math.round(diffDays)} ngày (vượt ngưỡng thông thường 30 ngày), cần kiểm tra đối chiếu tính thời sự của bằng chứng.`,
          confidence: 'high',
        });
      } else if (diffDays < -1) {
        // Thời điểm chụp trong tương lai so với ngày lập phiếu (> 1 ngày)
        warnings.push({
          code: 'DATE_IN_FUTURE',
          severity: 'high',
          title: 'Thời điểm chụp sau ngày lập phiếu',
          reason: 'Thời điểm chụp ghi nhận trong ảnh muộn hơn ngày tạo phiếu nghiệm thu, có dấu hiệu sai lệch đồng hồ thiết bị.',
          confidence: 'high',
        });
      }
    }
  }

  // 5. Xác định trạng thái tổng thể và đủ dữ liệu
  result.warnings = warnings;
  result.has_sufficient_data = hasExif && !!make && !!finalCapturedAt;

  const hasHighSeverity = warnings.some((w) => w.severity === 'high');
  const hasWarnings = warnings.length > 0;

  if (hasHighSeverity) {
    result.status = 'warning';
    result.summary = `Phát hiện ${warnings.length} dấu hiệu nghi vấn cần người duyệt kiểm tra đối chiếu.`;
  } else if (hasWarnings) {
    result.status = 'incomplete_data';
    result.summary = 'Ảnh thiếu một số siêu dữ liệu gốc (máy ảnh hoặc thời gian chụp).';
  } else {
    result.status = 'clean';
    result.summary = 'Bằng chứng hợp lệ, đầy đủ siêu dữ liệu máy ảnh và thời gian chụp.';
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
    savedInspection.status
  ) {
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

  const hasHigh = warnings.some((w) => w.severity === 'high');
  let status = 'clean';
  if (photoRow.metadata_status === 'unreadable') {
    status = 'error';
  } else if (hasHigh) {
    status = 'warning';
  } else if (warnings.length > 0) {
    status = 'incomplete_data';
  }

  return {
    status,
    can_evaluate: photoRow.metadata_status !== 'unreadable',
    has_sufficient_data:
      photoRow.metadata_status === 'complete' || photoRow.metadata_status === 'time_only',
    summary:
      status === 'warning'
        ? `Phát hiện ${warnings.length} dấu hiệu nghi vấn cần người duyệt kiểm tra.`
        : status === 'incomplete_data'
        ? 'Ảnh thiếu một số siêu dữ liệu gốc.'
        : status === 'error'
        ? 'Siêu dữ liệu ảnh bị lỗi.'
        : 'Bằng chứng hợp lệ, không phát hiện dấu hiệu bất thường.',
    warnings,
    metadata: {
      file_name: fileName,
      file_size: photoRow.file_size,
      mime_type: photoRow.mime_type,
      captured_at: photoRow.captured_at,
      captured_at_source: photoRow.captured_at_source,
      gps_latitude: photoRow.gps_latitude,
      gps_longitude: photoRow.gps_longitude,
      metadata_status: photoRow.metadata_status,
      is_screenshot: hasScreenshotName,
    },
    inspected_at: new Date().toISOString(),
  };
}

module.exports = {
  extractImageDimensions,
  getAspectRatioInfo,
  evaluateScreenshotSigns,
  inspectPhotoMetadata,
  inspectVoucherPhotoRecord,
  KNOWN_SCREENSHOT_RESOLUTIONS,
};
