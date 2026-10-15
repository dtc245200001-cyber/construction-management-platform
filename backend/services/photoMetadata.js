/**
 * Service trích xuất và chuẩn hoá siêu dữ liệu ảnh hiện trường (EXIF)
 * Story S-40: T-105 & T-106
 *
 * Tiêu chuẩn:
 * - Chuẩn hoá thời gian chụp về UTC (ISO 8601).
 * - Chuẩn hoá toạ độ GPS về số thập phân (6 chữ số sau dấu phẩy).
 * - Kiểm tra tính hợp lệ miền giá trị và loại trừ toạ độ rác (0, 0).
 * - Tuyệt đối KHÔNG log toạ độ hoặc thời gian chụp.
 */

const exifr = require('exifr');

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const EXIF_PARSE_BYTE_LIMIT = 256 * 1024; // Chỉ đọc tối đa 256KB đầu file

/**
 * Kiểm tra magic bytes của buffer ảnh
 */
function isSupportedMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  // WebP: RIFF .... WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }
  // HEIC / HEIF: ....ftyp(heic|mif1|msf1|heix|mif2)
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (['heic', 'mif1', 'msf1', 'heix', 'mif2', 'hevc'].includes(brand)) {
      return true;
    }
  }

  return false;
}

/**
 * Chuẩn hoá chuỗi offset sang định dạng `+HH:MM` hoặc `-HH:MM`
 */
function normalizeOffsetString(offset) {
  if (!offset || typeof offset !== 'string') return null;
  const trimmed = offset.trim();
  const match = trimmed.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = match[3] || '00';
  return `${sign}${hours}:${minutes}`;
}

/**
 * Phân tích và chuẩn hoá DateTimeOriginal và Offset thành Date UTC
 */
function parseExifDateTime(dateTimeOriginal, offsetOriginal) {
  if (!dateTimeOriginal) return null;

  // Nếu đã là Date object
  if (dateTimeOriginal instanceof Date && !isNaN(dateTimeOriginal.getTime())) {
    return dateTimeOriginal;
  }

  if (typeof dateTimeOriginal !== 'string') return null;
  const raw = dateTimeOriginal.trim();
  if (!raw || raw.startsWith('0000:00:00') || raw.startsWith('0000-00-00')) {
    return null;
  }

  // Khớp định dạng EXIF chuẩn: YYYY:MM:DD HH:MM:SS hoặc YYYY-MM-DD HH:MM:SS
  const match = raw.match(
    /^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(.*)$/
  );
  if (!match) {
    // Thử Date.parse
    const ts = Date.parse(raw);
    return isNaN(ts) ? null : new Date(ts);
  }

  const year = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4];
  const min = match[5];
  const sec = match[6];
  const inlineTz = match[7] ? match[7].trim() : '';

  let offset = normalizeOffsetString(inlineTz) || normalizeOffsetString(offsetOriginal);

  if (offset) {
    // Đã có offset cụ thể
    const isoString = `${year}-${month}-${day}T${hour}:${min}:${sec}${offset}`;
    const date = new Date(isoString);
    return isNaN(date.getTime()) ? null : date;
  }

  // Không có offset: dùng múi giờ Việt Nam +07:00 mặc định
  const isoDefaultVN = `${year}-${month}-${day}T${hour}:${min}:${sec}+07:00`;
  const date = new Date(isoDefaultVN);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Ghép GPSDateStamp (YYYY:MM:DD) và GPSTimeStamp ([h, m, s] hoặc HH:MM:SS) thành Date UTC
 */
function parseGpsDateTime(gpsDateStamp, gpsTimeStamp) {
  if (!gpsDateStamp || !gpsTimeStamp) return null;

  let y, m, d;
  if (typeof gpsDateStamp === 'string') {
    const parts = gpsDateStamp.trim().split(/[:-]/);
    if (parts.length === 3) {
      y = parts[0];
      m = parts[1].padStart(2, '0');
      d = parts[2].padStart(2, '0');
    }
  }

  let h, min, s;
  if (Array.isArray(gpsTimeStamp) && gpsTimeStamp.length >= 3) {
    h = String(Math.floor(Number(gpsTimeStamp[0]))).padStart(2, '0');
    min = String(Math.floor(Number(gpsTimeStamp[1]))).padStart(2, '0');
    s = String(Math.floor(Number(gpsTimeStamp[2]))).padStart(2, '0');
  } else if (typeof gpsTimeStamp === 'string') {
    const parts = gpsTimeStamp.trim().split(':');
    if (parts.length === 3) {
      h = parts[0].padStart(2, '0');
      min = parts[1].padStart(2, '0');
      s = parts[2].split('.')[0].padStart(2, '0');
    }
  }

  if (y && m && d && h && min && s) {
    const isoUtc = `${y}-${m}-${d}T${h}:${min}:${s}Z`;
    const date = new Date(isoUtc);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Kiểm tra xem ngày có hợp lệ trong khoảng nghiệp vụ không
 * Không trước năm 2000 và không vượt quá hiện tại + 24 giờ
 */
function isValidCaptureDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  if (year < 2000) return false;

  const now = new Date();
  const maxFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000); // hiện tại + 24h
  if (date > maxFuture) return false;

  return true;
}

/**
 * Chuyển đổi toạ độ bất kỳ (DMS array hoặc float) sang độ thập phân
 */
function parseCoordinate(value, ref) {
  if (value === null || value === undefined) return null;

  let decimal = null;
  if (typeof value === 'number') {
    decimal = value;
  } else if (Array.isArray(value) && value.length === 3) {
    // [degrees, minutes, seconds]
    const deg = Number(value[0]);
    const min = Number(value[1]);
    const sec = Number(value[2]);
    if (!isNaN(deg) && !isNaN(min) && !isNaN(sec)) {
      decimal = deg + min / 60 + sec / 3600;
    }
  } else if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) decimal = parsed;
  }

  if (decimal === null || isNaN(decimal)) return null;

  // Áp dụng Ref nếu có
  if (typeof ref === 'string') {
    const upperRef = ref.trim().toUpperCase();
    if ((upperRef === 'S' || upperRef === 'W') && decimal > 0) {
      decimal = -decimal;
    }
  }

  return decimal;
}

/**
 * Kiểm tra và làm tròn toạ độ GPS
 */
function validateAndFormatGps(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return { latitude: null, longitude: null };
  }

  const numLat = Number(lat);
  const numLon = Number(lon);

  if (isNaN(numLat) || isNaN(numLon)) {
    return { latitude: null, longitude: null };
  }

  // Miền hợp lệ
  if (numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
    return { latitude: null, longitude: null };
  }

  // Toạ độ rác (0, 0)
  if (Math.abs(numLat) < 1e-7 && Math.abs(numLon) < 1e-7) {
    return { latitude: null, longitude: null };
  }

  return {
    latitude: Number(numLat.toFixed(6)),
    longitude: Number(numLon.toFixed(6)),
  };
}

/**
 * Kiểm tra và làm tròn độ chính xác GPS
 */
function validateAccuracy(acc) {
  if (acc === null || acc === undefined) return null;
  const num = Number(acc);
  if (isNaN(num) || num <= 0 || num > 10000) return null;
  return Number(num.toFixed(2));
}

/**
 * Trích xuất và chuẩn hoá siêu dữ liệu từ buffer ảnh
 *
 * @param {Buffer} buffer - Buffer file ảnh
 * @param {string} [mimeType] - MIME type được gửi từ multipart
 * @param {Object} [clientFallback] - Dữ liệu EXIF client gửi kèm nếu ảnh đã bị client nén
 * @returns {Promise<Object>} Metadata object chuẩn hoá
 */
async function extractPhotoMetadata(buffer, mimeType = null, clientFallback = {}) {
  const result = {
    captured_at: null,
    captured_at_source: null,
    gps_latitude: null,
    gps_longitude: null,
    gps_accuracy_m: null,
    metadata_status: 'none',
    metadata_source: 'file',
  };

  // 1. Kiểm tra Buffer
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    result.metadata_status = 'unreadable';
    return result;
  }

  // 2. Kiểm tra định dạng hỗ trợ
  const isMimeSupported = mimeType ? SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase()) : false;
  const isMagicSupported = isSupportedMagicBytes(buffer);

  if (!isMimeSupported && !isMagicSupported) {
    result.metadata_status = 'unsupported';
    return result;
  }

  // 3. Đọc EXIF từ buffer (chỉ đọc phần đầu file)
  const parseBuffer = buffer.slice(0, EXIF_PARSE_BYTE_LIMIT);
  let parsedExif = null;

  try {
    parsedExif = await exifr.parse(parseBuffer, {
      pick: [
        'DateTimeOriginal',
        'OffsetTimeOriginal',
        'GPSLatitude',
        'GPSLongitude',
        'GPSLatitudeRef',
        'GPSLongitudeRef',
        'GPSDateStamp',
        'GPSTimeStamp',
        'GPSHPositioningError',
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
    // Lỗi giải mã EXIF
    result.metadata_status = 'unreadable';
    return result;
  }

  // 4. Xử lý Thời gian chụp (captured_at)
  let capturedAt = null;
  let capturedAtSource = null;

  if (parsedExif && parsedExif.DateTimeOriginal) {
    if (parsedExif.OffsetTimeOriginal) {
      const d = parseExifDateTime(parsedExif.DateTimeOriginal, parsedExif.OffsetTimeOriginal);
      if (isValidCaptureDate(d)) {
        capturedAt = d;
        capturedAtSource = 'exif_offset';
      }
    } else if (parsedExif.GPSDateStamp && parsedExif.GPSTimeStamp) {
      const dGps = parseGpsDateTime(parsedExif.GPSDateStamp, parsedExif.GPSTimeStamp);
      if (isValidCaptureDate(dGps)) {
        capturedAt = dGps;
        capturedAtSource = 'gps_utc';
      } else {
        const dAssumed = parseExifDateTime(parsedExif.DateTimeOriginal, null);
        if (isValidCaptureDate(dAssumed)) {
          capturedAt = dAssumed;
          capturedAtSource = 'assumed_local';
        }
      }
    } else {
      const dAssumed = parseExifDateTime(parsedExif.DateTimeOriginal, null);
      if (isValidCaptureDate(dAssumed)) {
        capturedAt = dAssumed;
        capturedAtSource = 'assumed_local';
      }
    }
  } else if (parsedExif && parsedExif.GPSDateStamp && parsedExif.GPSTimeStamp) {
    const dGps = parseGpsDateTime(parsedExif.GPSDateStamp, parsedExif.GPSTimeStamp);
    if (isValidCaptureDate(dGps)) {
      capturedAt = dGps;
      capturedAtSource = 'gps_utc';
    }
  }

  // Fallback từ client nếu file không có thời gian chụp
  let usedClientTime = false;
  if (!capturedAt && clientFallback && clientFallback.exif_captured_at) {
    const dClient = new Date(clientFallback.exif_captured_at);
    if (isValidCaptureDate(dClient)) {
      capturedAt = dClient;
      capturedAtSource = 'client_reported';
      usedClientTime = true;
    }
  }

  // 5. Xử lý Toạ độ GPS
  let lat = null;
  let lon = null;
  let acc = null;

  if (parsedExif) {
    const rawLat = parseCoordinate(parsedExif.GPSLatitude, parsedExif.GPSLatitudeRef);
    const rawLon = parseCoordinate(parsedExif.GPSLongitude, parsedExif.GPSLongitudeRef);
    const validated = validateAndFormatGps(rawLat, rawLon);
    lat = validated.latitude;
    lon = validated.longitude;
    acc = validateAccuracy(parsedExif.GPSHPositioningError);
  }

  // Fallback từ client nếu file không có GPS
  let usedClientGps = false;
  if ((lat === null || lon === null) && clientFallback) {
    const validatedClient = validateAndFormatGps(
      clientFallback.exif_latitude,
      clientFallback.exif_longitude
    );
    if (validatedClient.latitude !== null && validatedClient.longitude !== null) {
      lat = validatedClient.latitude;
      lon = validatedClient.longitude;
      acc = validateAccuracy(clientFallback.exif_accuracy_m);
      usedClientGps = true;
    }
  }

  // 6. Quyết định nguồn và trạng thái
  const hasTime = capturedAt !== null;
  const hasGps = lat !== null && lon !== null;

  result.captured_at = capturedAt ? capturedAt.toISOString() : null;
  result.captured_at_source = capturedAtSource;
  result.gps_latitude = lat;
  result.gps_longitude = lon;
  result.gps_accuracy_m = acc;

  if (usedClientTime || usedClientGps) {
    result.metadata_source = 'client';
  } else {
    result.metadata_source = 'file';
  }

  if (hasTime && hasGps) {
    result.metadata_status = 'complete';
  } else if (hasTime && !hasGps) {
    result.metadata_status = 'time_only';
  } else if (!hasTime && hasGps) {
    result.metadata_status = 'gps_only';
  } else {
    result.metadata_status = 'none';
  }

  return result;
}

module.exports = {
  extractPhotoMetadata,
  isSupportedMagicBytes,
  parseExifDateTime,
  parseGpsDateTime,
  parseCoordinate,
  validateAndFormatGps,
  validateAccuracy,
  isValidCaptureDate,
  SUPPORTED_MIME_TYPES,
};
