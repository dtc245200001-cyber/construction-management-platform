/**
 * Service trích xuất và chuẩn hoá siêu dữ liệu ảnh hiện trường (EXIF)
 * Story S-40: T-105 & T-106, S-42: T-109
 *
 * Tiêu chuẩn:
 * - Chuẩn hoá thời gian chụp về UTC (ISO 8601).
 * - Chuẩn hoá toạ độ GPS về số thập phân (6 chữ số sau dấu phẩy).
 * - Kiểm tra tính hợp lệ miền giá trị và loại trừ toạ độ rác (0, 0).
 * - Đọc thông tin tệp độc lập với EXIF (định dạng, kích thước, tỷ lệ khung hình GCD).
 * - Trích xuất đầy đủ thông tin máy ảnh: Make, Model, Software, ISO, Khẩu độ, Tốc độ màn trập.
 * - Hỗ trợ JPEG, PNG, WebP, HEIC/HEIF.
 * - Tuyệt đối KHÔNG log toạ độ hoặc thời gian chụp.
 */

'use strict';

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
 * Tìm ước chung lớn nhất (GCD) bằng thuật toán Euclid
 */
function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Tính tỷ lệ khung hình tối giản theo thuật toán GCD
 * Ví dụ:
 * - 1920 × 1080 -> "16:9"
 * - 2880 × 2160 -> "4:3"
 * - 1080 × 1080 -> "1:1"
 * - 2880 × 1800 -> "8:5"
 */
function calculateAspectRatio(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!w || !h || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
    return null;
  }
  const divisor = gcd(w, h);
  const rw = Math.round(w / divisor);
  const rh = Math.round(h / divisor);
  return `${rw}:${rh}`;
}

/**
 * Kiểm tra magic bytes của buffer ảnh
 */
function isSupportedMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) return false;

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
 * Trích xuất chunk EXIF từ container WebP (RIFF) để đưa vào exifr
 */
function extractWebpExifChunk(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 16) return null;
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  let offset = 12;
  const len = Math.min(buffer.length, EXIF_PARSE_BYTE_LIMIT);
  while (offset + 8 <= len) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    offset += 8;

    if (chunkId === 'EXIF') {
      const data = buffer.slice(offset, Math.min(offset + chunkSize, buffer.length));
      // Nếu có header "Exif\0\0", loại bỏ 6 byte đầu để lấy TIFF buffer thuần tuý
      if (data.length > 6 && data.toString('ascii', 0, 6) === 'Exif\0\0') {
        return data.slice(6);
      }
      return data;
    }

    // WebP chunk căn chỉnh theo bội số 2 byte
    offset += chunkSize + (chunkSize % 2);
  }

  return null;
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

  const offset = normalizeOffsetString(inlineTz) || normalizeOffsetString(offsetOriginal);

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
 * Định dạng khẩu độ từ FNumber hoặc ApertureValue
 */
function formatAperture(fNumber, apertureValue) {
  const num = fNumber !== undefined && fNumber !== null ? Number(fNumber) : null;
  if (num && !isNaN(num) && num > 0) {
    return `f/${num % 1 === 0 ? num : Number(num.toFixed(1))}`;
  }
  const ap = apertureValue !== undefined && apertureValue !== null ? Number(apertureValue) : null;
  if (ap && !isNaN(ap) && ap > 0) {
    return `f/${ap % 1 === 0 ? ap : Number(ap.toFixed(1))}`;
  }
  return null;
}

/**
 * Định dạng tốc độ màn trập từ ExposureTime hoặc ShutterSpeedValue
 */
function formatShutterSpeed(exposureTime, shutterSpeedValue) {
  if (exposureTime !== undefined && exposureTime !== null) {
    const exp = Number(exposureTime);
    if (!isNaN(exp) && exp > 0) {
      if (exp < 1) {
        return `1/${Math.round(1 / exp)}s`;
      }
      return `${exp % 1 === 0 ? exp : Number(exp.toFixed(2))}s`;
    }
  }

  if (shutterSpeedValue !== undefined && shutterSpeedValue !== null) {
    const val = Number(shutterSpeedValue);
    if (!isNaN(val)) {
      const exp = Math.pow(2, -val);
      if (exp > 0) {
        if (exp < 1) {
          return `1/${Math.round(1 / exp)}s`;
        }
        return `${Number(exp.toFixed(2))}s`;
      }
    }
  }

  return null;
}

/**
 * Trích xuất và chuẩn hoá siêu dữ liệu từ buffer ảnh
 *
 * @param {Buffer} buffer - Buffer file ảnh
 * @param {string} [_mimeType] - MIME type được gửi từ multipart
 * @param {Object} [clientFallback] - Dữ liệu EXIF client gửi kèm nếu ảnh đã bị client nén
 * @returns {Promise<Object>} Metadata object chuẩn hoá
 */
async function extractPhotoMetadata(buffer, _mimeType = null, clientFallback = {}) {
  const result = {
    captured_at: null,
    captured_at_source: null,
    gps_latitude: null,
    gps_longitude: null,
    gps_accuracy_m: null,
    gps_source: null,
    metadata_status: 'none',
    metadata_source: 'file',
    // Thông tin thiết bị & camera EXIF
    make: null,
    model: null,
    software: null,
    iso: null,
    aperture: null,
    shutter_speed: null,
    // Thông tin tệp độc lập
    width: null,
    height: null,
    aspect_ratio: null,
    has_exif: false,
  };

  // 1. Kiểm tra Buffer
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    result.metadata_status = 'unreadable';
    return result;
  }

  // 2. Kiểm tra magic bytes thực tế của file (phát hiện giả mạo phần mở rộng hoặc định dạng không hỗ trợ)
  const isMagicSupported = isSupportedMagicBytes(buffer);
  if (!isMagicSupported) {
    result.metadata_status = 'unsupported';
    return result;
  }

  // 3. Trích xuất kích thước ảnh độc lập từ header nhị phân (PNG, JPEG, WebP)
  const dim = extractImageDimensions(buffer);
  let width = dim.width;
  let height = dim.height;

  // 4. Chuẩn bị buffer để đọc EXIF
  let parseBuffer = buffer.slice(0, EXIF_PARSE_BYTE_LIMIT);

  // Nếu là WebP, kiểm tra xem có chunk EXIF riêng trong container RIFF không
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const webpExif = extractWebpExifChunk(buffer);
    if (webpExif && webpExif.length > 0) {
      parseBuffer = webpExif;
    } else {
      // WebP không chứa chunk EXIF
      parseBuffer = null;
    }
  }

  let parsedExif = null;

  if (parseBuffer) {
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
          'Make',
          'Model',
          'Software',
          'ISO',
          'PhotographicSensitivity',
          'FNumber',
          'ApertureValue',
          'ExposureTime',
          'ShutterSpeedValue',
          'ExifImageWidth',
          'ExifImageHeight',
          'ImageWidth',
          'ImageHeight',
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
      // Lỗi giải mã EXIF cấu trúc hỏng
      result.metadata_status = 'unreadable';
      return result;
    }
  }

  // 5. Cập nhật kích thước nếu parser nhị phân chưa có mà EXIF có
  if (!width && parsedExif) {
    width = parsedExif.ImageWidth || parsedExif.ExifImageWidth || null;
  }
  if (!height && parsedExif) {
    height = parsedExif.ImageHeight || parsedExif.ExifImageHeight || null;
  }

  result.width = width || null;
  result.height = height || null;
  result.aspect_ratio = calculateAspectRatio(width, height);

  const hasExifTags = Boolean(parsedExif && Object.keys(parsedExif).length > 0);
  result.has_exif = hasExifTags;

  // 6. Xử lý thông tin máy ảnh: Make, Model, Software, ISO, Khẩu độ, Tốc độ màn trập
  const rawMake = parsedExif?.Make ? String(parsedExif.Make).trim() : null;
  const rawModel = parsedExif?.Model ? String(parsedExif.Model).trim() : null;
  const rawSoftware = parsedExif?.Software ? String(parsedExif.Software).trim() : null;
  const rawIso =
    parsedExif?.ISO !== undefined && parsedExif?.ISO !== null
      ? String(parsedExif.ISO)
      : parsedExif?.PhotographicSensitivity !== undefined && parsedExif?.PhotographicSensitivity !== null
      ? String(parsedExif.PhotographicSensitivity)
      : null;

  let usedClientMake = false;
  let usedClientModel = false;
  if (!rawMake && clientFallback?.make) {
    result.make = String(clientFallback.make).trim();
    usedClientMake = true;
  } else {
    result.make = rawMake;
  }

  if (!rawModel && clientFallback?.model) {
    result.model = String(clientFallback.model).trim();
    usedClientModel = true;
  } else {
    result.model = rawModel;
  }

  result.software = rawSoftware || (clientFallback?.software ? String(clientFallback.software).trim() : null);
  result.iso = rawIso || (clientFallback?.iso ? String(clientFallback.iso).trim() : null);
  result.aperture = formatAperture(parsedExif?.FNumber, parsedExif?.ApertureValue);
  result.shutter_speed = formatShutterSpeed(parsedExif?.ExposureTime, parsedExif?.ShutterSpeedValue);

  // 7. Xử lý Thời gian chụp (captured_at)
  let capturedAt = null;
  let capturedAtSource = null;

  if (parsedExif && parsedExif.DateTimeOriginal) {
    if (parsedExif.OffsetTimeOriginal) {
      const d = parseExifDateTime(parsedExif.DateTimeOriginal, parsedExif.OffsetTimeOriginal);
      if (d && !isNaN(d.getTime()) && d.getUTCFullYear() >= 2000) {
        capturedAt = d;
        capturedAtSource = 'exif_offset';
      }
    } else if (parsedExif.GPSDateStamp && parsedExif.GPSTimeStamp) {
      const dGps = parseGpsDateTime(parsedExif.GPSDateStamp, parsedExif.GPSTimeStamp);
      if (dGps && !isNaN(dGps.getTime()) && dGps.getUTCFullYear() >= 2000) {
        capturedAt = dGps;
        capturedAtSource = 'gps_utc';
      } else {
        const dAssumed = parseExifDateTime(parsedExif.DateTimeOriginal, null);
        if (dAssumed && !isNaN(dAssumed.getTime()) && dAssumed.getUTCFullYear() >= 2000) {
          capturedAt = dAssumed;
          capturedAtSource = 'assumed_local';
        }
      }
    } else {
      const dAssumed = parseExifDateTime(parsedExif.DateTimeOriginal, null);
      if (dAssumed && !isNaN(dAssumed.getTime()) && dAssumed.getUTCFullYear() >= 2000) {
        capturedAt = dAssumed;
        capturedAtSource = 'assumed_local';
      }
    }
  } else if (parsedExif && parsedExif.GPSDateStamp && parsedExif.GPSTimeStamp) {
    const dGps = parseGpsDateTime(parsedExif.GPSDateStamp, parsedExif.GPSTimeStamp);
    if (dGps && !isNaN(dGps.getTime()) && dGps.getUTCFullYear() >= 2000) {
      capturedAt = dGps;
      capturedAtSource = 'gps_utc';
    }
  }

  // Fallback từ client nếu file không có thời gian chụp
  // Quy tắc Hardening: Bỏ qua nếu thời gian client gửi lớn hơn hiện tại quá 10 phút
  let usedClientTime = false;
  if (!capturedAt && clientFallback && clientFallback.exif_captured_at) {
    const dClient = new Date(clientFallback.exif_captured_at);
    const clientMaxFuture = new Date(Date.now() + 10 * 60 * 1000);
    if (isValidCaptureDate(dClient) && dClient <= clientMaxFuture) {
      capturedAt = dClient;
      capturedAtSource = 'client_reported';
      usedClientTime = true;
    }
  }

  // 8. Xử lý Toạ độ GPS (File EXIF luôn thắng client)
  let lat = null;
  let lon = null;
  let acc = null;
  let gpsSource = null;
  let usedClientGps = false;

  if (parsedExif) {
    const rawLat = parseCoordinate(parsedExif.GPSLatitude, parsedExif.GPSLatitudeRef);
    const rawLon = parseCoordinate(parsedExif.GPSLongitude, parsedExif.GPSLongitudeRef);
    const validated = validateAndFormatGps(rawLat, rawLon);
    lat = validated.latitude;
    lon = validated.longitude;
    acc = validateAccuracy(parsedExif.GPSHPositioningError);
  }

  if (lat !== null && lon !== null) {
    // Đã có toạ độ hợp lệ từ file EXIF -> bỏ qua hoàn toàn dữ liệu GPS client gửi
    gpsSource = 'file_exif';
  } else if (clientFallback) {
    // File không có GPS -> xem xét dữ liệu client báo
    const validatedClient = validateAndFormatGps(
      clientFallback.exif_latitude,
      clientFallback.exif_longitude
    );
    if (validatedClient.latitude !== null && validatedClient.longitude !== null) {
      lat = validatedClient.latitude;
      lon = validatedClient.longitude;
      acc = validateAccuracy(clientFallback.exif_accuracy_m);
      usedClientGps = true;
      gpsSource = 'client_reported';
    }
  }

  // 9. Quyết định nguồn và trạng thái metadata
  const hasTime = capturedAt !== null;
  const hasGps = lat !== null && lon !== null;

  result.captured_at = capturedAt ? capturedAt.toISOString() : null;
  result.captured_at_source = capturedAtSource;
  result.gps_latitude = lat;
  result.gps_longitude = lon;
  result.gps_accuracy_m = acc;
  result.gps_source = gpsSource;

  if (usedClientTime || usedClientGps || usedClientMake || usedClientModel) {
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
  extractImageDimensions,
  extractWebpExifChunk,
  gcd,
  calculateAspectRatio,
  isSupportedMagicBytes,
  parseExifDateTime,
  parseGpsDateTime,
  parseCoordinate,
  validateAndFormatGps,
  validateAccuracy,
  formatAperture,
  formatShutterSpeed,
  isValidCaptureDate,
  SUPPORTED_MIME_TYPES,
};
