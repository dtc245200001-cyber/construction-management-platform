/**
 * Unit tests cho photoInspection.js
 * Story S-42: T-109
 *
 * Kiểm tra các trường hợp:
 * 1. Ảnh có EXIF hợp lệ (clean status, có thông tin thiết bị, thời gian chụp phù hợp).
 * 2. Ảnh không có EXIF (incomplete_data, thiếu máy ảnh và thời gian chụp gốc).
 * 3. Metadata có dấu hiệu bất thường (ảnh chụp lại màn hình, thời gian chụp cách quá xa ngày lập phiếu, v.v.).
 * 4. File không hợp lệ hoặc không đọc được (buffer rỗng, null, định dạng không hỗ trợ).
 * 5. Lỗi xử lý metadata (file có marker EXIF hỏng, unreadable).
 * 6. Cấu trúc dữ liệu đầu ra đầy đủ, nhất quán (status, can_evaluate, has_sufficient_data, warnings, metadata).
 */

'use strict';

const {
  extractImageDimensions,
  getAspectRatioInfo,
  evaluateScreenshotSigns,
  inspectPhotoMetadata,
  inspectVoucherPhotoRecord,
  sanitizeInspectionForRole,
} = require('../services/photoInspection');

const {
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
  createPngBuffer,
  createJpegWithDimensions,
  createPngWithExif,
  createPlainPng,
  createWebpWithExif,
  createPlainWebp,
} = require('./helpers/photoInspectionHelpers');

describe('photoInspection service (Story S-42 / T-109)', () => {
  describe('Kích thước ảnh và tỷ lệ khung hình', () => {
    test('extractImageDimensions trích xuất đúng kích thước từ PNG buffer', () => {
      const pngBuf = createPngBuffer(1080, 2400);
      const dims = extractImageDimensions(pngBuf);
      expect(dims.width).toBe(1080);
      expect(dims.height).toBe(2400);
    });

    test('extractImageDimensions trích xuất đúng kích thước từ JPEG SOF0', () => {
      const jpegBuf = createJpegWithDimensions(1920, 1080);
      const dims = extractImageDimensions(jpegBuf);
      expect(dims.width).toBe(1920);
      expect(dims.height).toBe(1080);
    });

    test('getAspectRatioInfo tính đúng tỷ lệ màn hình điện thoại', () => {
      // 1080 x 2400 là 20:9
      const info20_9 = getAspectRatioInfo(1080, 2400);
      expect(info20_9.ratioStr).toBe('9:20');
      expect(info20_9.isPortrait).toBe(true);

      // 1170 x 2532 (iPhone 13/14) là 19.5:9
      const info19_5 = getAspectRatioInfo(1170, 2532);
      expect(info19_5.ratioStr).toBe('9:19.5');

      // 4000 x 3000 (Camera 4:3)
      const infoCamera = getAspectRatioInfo(4000, 3000);
      expect(infoCamera.ratioStr).toBe('4:3');
      expect(infoCamera.isPortrait).toBe(false);
    });
  });

  describe('Phát hiện dấu hiệu chụp lại màn hình (evaluateScreenshotSigns)', () => {
    test('phát hiện ảnh có độ phân giải trùng khớp màn hình điện thoại và không có máy ảnh', () => {
      const evalResult = evaluateScreenshotSigns({
        width: 1080,
        height: 2400,
        make: null,
        model: null,
        fileName: 'anh_hien_truong.jpg',
      });
      expect(evalResult.isScreenshot).toBe(true);
      expect(evalResult.confidence).toBe('high');
      expect(evalResult.reason).toContain('1080x2400');
    });

    test('phát hiện ảnh có tên file chứa screenshot', () => {
      const evalResult = evaluateScreenshotSigns({
        width: 1080,
        height: 1920,
        make: null,
        model: null,
        fileName: 'Screenshot_20261015-103045.png',
      });
      expect(evalResult.isScreenshot).toBe(true);
      expect(evalResult.confidence).toBe('high');
    });

    test('không đánh dấu ảnh chụp bằng máy ảnh thật kể cả khi chụp tỷ lệ 16:9', () => {
      const evalResult = evaluateScreenshotSigns({
        width: 1920,
        height: 1080,
        make: 'Samsung',
        model: 'Galaxy S22',
        fileName: 'photo.jpg',
      });
      expect(evalResult.isScreenshot).toBe(false);
    });
  });

  describe('Kiểm thử 6 kịch bản theo yêu cầu T-109', () => {
    // Kịch bản 1: Ảnh có EXIF hợp lệ
    test('1. Ảnh có EXIF hợp lệ -> status clean, can_evaluate true, warnings rỗng', async () => {
      const now = new Date();
      const voucherDate = now.toISOString();
      const capturedDateStr = '2026:10:14 10:00:00'; // 1 ngày trước ngày lập phiếu

      const buf = createJpegWithExif({
        dateTimeOriginal: capturedDateStr,
        offsetTimeOriginal: '+07:00',
        latitude: 10.762622,
        longitude: 106.660172,
      });

      // Bổ sung marker SOF0 kích thước camera chuẩn 4000x3000
      const finalBuf = createJpegWithDimensions(4000, 3000, buf);

      const res = await inspectPhotoMetadata({
        buffer: finalBuf,
        mimeType: 'image/jpeg',
        fileName: 'IMG_20261014_100000.jpg',
        voucherCreatedAt: voucherDate,
        make: 'Apple',
        model: 'iPhone 13',
      });

      expect(res.status).toBe('clean');
      expect(res.can_evaluate).toBe(true);
      expect(res.metadata.aspect_ratio).toBe('4:3');
      expect(res.metadata.captured_at).not.toBeNull();
      expect(res.warnings.length).toBe(0);
      expect(res.summary).toContain('Bằng chứng hợp lệ');
    });

    // Kịch bản 2: Ảnh không có EXIF
    test('2. Ảnh không có EXIF -> status incomplete_data, can_evaluate true, warnings có missing', async () => {
      const plainJpeg = createPlainJpeg(4000, 3000);

      const res = await inspectPhotoMetadata({
        buffer: plainJpeg,
        mimeType: 'image/jpeg',
        fileName: 'unnamed_photo.jpg',
      });

      expect(res.status).toBe('incomplete_data');
      expect(res.can_evaluate).toBe(true);
      expect(res.has_sufficient_data).toBe(false);
      expect(res.warnings.length).toBeGreaterThan(0);

      const warningCodes = res.warnings.map((w) => w.code);
      expect(warningCodes).toContain('MISSING_CAMERA_METADATA');
      expect(warningCodes).toContain('MISSING_CAPTURE_TIME');
      expect(res.summary).toContain('thiếu một số siêu dữ liệu gốc');
    });

    // Kịch bản 3: Metadata có dấu hiệu bất thường (ảnh chụp lại màn hình + thời điểm chụp xa ngày lập phiếu)
    test('3. Ảnh chụp lại màn hình (tỷ lệ 20:9, không máy ảnh) -> status warning, code SCREENSHOT_SUSPECTED', async () => {
      const pngScreenshot = createPngBuffer(1080, 2400);

      const res = await inspectPhotoMetadata({
        buffer: pngScreenshot,
        mimeType: 'image/png',
        fileName: 'Screenshot_20261015.png',
      });

      expect(res.status).toBe('warning');
      expect(res.can_evaluate).toBe(true);
      expect(res.metadata.is_screenshot).toBe(true);

      const screenshotWarning = res.warnings.find((w) => w.code === 'SCREENSHOT_SUSPECTED');
      expect(screenshotWarning).toBeDefined();
      expect(screenshotWarning.severity).toBe('high');
      expect(screenshotWarning.reason).toContain('màn hình');
    });

    test('3b. Thời điểm chụp cách ngày lập phiếu quá xa (> 30 ngày) -> cảnh báo DATE_TOO_FAR', async () => {
      const voucherDate = '2026-10-15T00:00:00.000Z';
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:08:01 08:00:00', // Chụp cách ngày lập phiếu 75 ngày
        offsetTimeOriginal: '+07:00',
      });
      const finalBuf = createJpegWithDimensions(4000, 3000, buf);

      const res = await inspectPhotoMetadata({
        buffer: finalBuf,
        mimeType: 'image/jpeg',
        fileName: 'old_evidence.jpg',
        voucherCreatedAt: voucherDate,
      });

      expect(res.status).toBe('warning');
      const farWarning = res.warnings.find((w) => w.code === 'DATE_TOO_FAR');
      expect(farWarning).toBeDefined();
      expect(farWarning.severity).toBe('high');
      expect(farWarning.reason).toContain('30 ngày');
    });

    test('3c. Thời điểm chụp trong tương lai so với ngày lập phiếu -> cảnh báo DATE_IN_FUTURE', async () => {
      const voucherDate = '2026-10-15T00:00:00.000Z';
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:10:25 14:00:00', // Chụp trong tương lai
        offsetTimeOriginal: '+07:00',
      });
      const finalBuf = createJpegWithDimensions(4000, 3000, buf);

      const res = await inspectPhotoMetadata({
        buffer: finalBuf,
        mimeType: 'image/jpeg',
        fileName: 'future_photo.jpg',
        voucherCreatedAt: voucherDate,
      });

      expect(res.status).toBe('warning');
      const futureWarning = res.warnings.find((w) => w.code === 'DATE_IN_FUTURE');
      expect(futureWarning).toBeDefined();
      expect(futureWarning.severity).toBe('high');
    });

    // Kịch bản 4: File không hợp lệ hoặc không đọc được
    test('4. File rỗng hoặc không phải buffer -> status error, can_evaluate false', async () => {
      const emptyRes = await inspectPhotoMetadata({
        buffer: Buffer.alloc(0),
        mimeType: 'image/jpeg',
      });
      expect(emptyRes.status).toBe('error');
      expect(emptyRes.can_evaluate).toBe(false);
      expect(emptyRes.warnings[0].code).toBe('FILE_CORRUPTED_OR_UNREADABLE');

      const nullRes = await inspectPhotoMetadata({
        buffer: null,
      });
      expect(nullRes.status).toBe('error');
      expect(nullRes.can_evaluate).toBe(false);
    });

    test('4b. Định dạng không được hỗ trợ (ví dụ application/pdf hoặc file text) -> status error', async () => {
      const textBuf = Buffer.from('day la file van ban khong phai anh');
      const res = await inspectPhotoMetadata({
        buffer: textBuf,
        mimeType: 'application/pdf',
      });
      expect(res.status).toBe('error');
      expect(res.can_evaluate).toBe(false);
      expect(res.warnings[0].code).toBe('FORMAT_UNSUPPORTED');
    });

    // Kịch bản 5: Lỗi xử lý metadata (file có marker EXIF hỏng)
    test('5. Marker EXIF bị hỏng không đọc được -> status error, can_evaluate false', async () => {
      const corruptedBuf = createCorruptedExifJpeg();
      const res = await inspectPhotoMetadata({
        buffer: corruptedBuf,
        mimeType: 'image/jpeg',
      });
      expect(res.status).toBe('error');
      expect(res.can_evaluate).toBe(false);
      expect(res.warnings[0].code).toBe('METADATA_UNREADABLE');
    });

    // Kịch bản 6: API/Service trả về đúng cấu trúc dữ liệu
    test('6. Cấu trúc dữ liệu trả về đầy đủ các trường bắt buộc', async () => {
      const plainJpeg = createPlainJpeg(1080, 2400);
      const res = await inspectPhotoMetadata({
        buffer: plainJpeg,
        mimeType: 'image/jpeg',
        fileName: 'Screenshot_test.jpg',
      });

      // Kiểm tra schema cấp 1
      expect(res).toHaveProperty('status');
      expect(['clean', 'warning', 'incomplete_data', 'error']).toContain(res.status);
      expect(res).toHaveProperty('can_evaluate');
      expect(typeof res.can_evaluate).toBe('boolean');
      expect(res).toHaveProperty('has_sufficient_data');
      expect(typeof res.has_sufficient_data).toBe('boolean');
      expect(res).toHaveProperty('summary');
      expect(typeof res.summary).toBe('string');
      expect(res).toHaveProperty('warnings');
      expect(Array.isArray(res.warnings)).toBe(true);
      expect(res).toHaveProperty('metadata');
      expect(typeof res.metadata).toBe('object');
      expect(res).toHaveProperty('inspected_at');

      // Kiểm tra cấu trúc từng warning
      if (res.warnings.length > 0) {
        const w = res.warnings[0];
        expect(w).toHaveProperty('code');
        expect(w).toHaveProperty('severity');
        expect(['high', 'medium', 'low']).toContain(w.severity);
        expect(w).toHaveProperty('title');
        expect(w).toHaveProperty('reason');
        expect(w).toHaveProperty('confidence');
        expect(['high', 'medium', 'low']).toContain(w.confidence);
      }

      // Kiểm tra cấu trúc metadata
      expect(res.metadata).toHaveProperty('width');
      expect(res.metadata).toHaveProperty('height');
      expect(res.metadata).toHaveProperty('aspect_ratio');
      expect(res.metadata).toHaveProperty('file_size');
      expect(res.metadata).toHaveProperty('mime_type');
      expect(res.metadata).toHaveProperty('is_screenshot');
    });
  });

  describe('Đánh giá nhanh bản ghi cơ sở dữ liệu (inspectVoucherPhotoRecord)', () => {
    test('xử lý bản ghi đã có exif_metadata trong DB', () => {
      const existingInspection = {
        status: 'clean',
        can_evaluate: true,
        warnings: [],
        metadata: { is_screenshot: false },
      };
      const result = inspectVoucherPhotoRecord({
        id: 1,
        exif_metadata: existingInspection,
      });
      expect(result).toEqual(existingInspection);
    });

    test('tự động đánh giá bản ghi cũ chưa có exif_metadata', () => {
      const result = inspectVoucherPhotoRecord(
        {
          id: 2,
          file_name: 'Screenshot_123.png',
          file_size: 100000,
          mime_type: 'image/png',
          captured_at: '2026-08-01T00:00:00.000Z',
          metadata_status: 'none',
        },
        {
          id: 10,
          created_at: '2026-10-15T00:00:00.000Z',
        }
      );

      expect(result.status).toBe('warning');
      const codes = result.warnings.map((w) => w.code);
      expect(codes).toContain('SCREENSHOT_SUSPECTED');
      expect(codes).toContain('DATE_TOO_FAR');
    });
  });

  describe('Mã băm SHA-256 & Phát hiện ảnh trùng lặp (Rule 4)', () => {
    test('tính mã băm SHA-256 chính xác từ buffer', async () => {
      const crypto = require('crypto');
      const pngBuf = createPngBuffer(800, 600);
      const expectedHash = crypto.createHash('sha256').update(pngBuf).digest('hex');

      const res = await inspectPhotoMetadata({
        buffer: pngBuf,
        fileName: 'site.png',
        mimeType: 'image/png',
      });

      expect(res.metadata.file_hash).toBe(expectedHash);
    });

    test('phát hiện ảnh trùng lặp 100% với ảnh đã có trong hệ thống', async () => {
      const crypto = require('crypto');
      const pngBuf = createPngBuffer(800, 600);
      const fileHash = crypto.createHash('sha256').update(pngBuf).digest('hex');

      const existingPhotos = [
        {
          id: 99,
          file_name: 'anh_da_duyet.png',
          file_hash: fileHash,
          batch_name: 'Đợt 1 - Cọc móng',
        },
      ];

      const res = await inspectPhotoMetadata({
        buffer: pngBuf,
        fileName: 'anh_gui_lai.png',
        mimeType: 'image/png',
        existingPhotos,
      });

      expect(res.status).toBe('warning');
      const dupWarning = res.warnings.find((w) => w.code === 'DUPLICATE_PHOTO_DETECTED');
      expect(dupWarning).toBeDefined();
      expect(dupWarning.severity).toBe('high');
      expect(dupWarning.reason).toContain('ảnh #99');
      expect(dupWarning.comparison_value).toMatch(/#99/);
    });

    test('áp dụng ngưỡng thời gian tuỳ chỉnh options.thresholdDays', async () => {
      const jpegBuf = createJpegWithExif({
        make: 'Apple',
        model: 'iPhone 15',
        dateTimeOriginal: '2026-10-01T10:00:00.000Z',
      });

      // Ngày lập phiếu: 2026-10-15 (cách 14 ngày).
      // Nếu ngưỡng là 7 ngày -> DATE_TOO_FAR.
      const resStrict = await inspectPhotoMetadata({
        buffer: jpegBuf,
        fileName: 'photo.jpg',
        voucherCreatedAt: '2026-10-15T10:00:00.000Z',
        options: { thresholdDays: 7 },
      });
      expect(resStrict.warnings.some((w) => w.code === 'DATE_TOO_FAR')).toBe(true);

      // Nếu ngưỡng là 20 ngày -> không bị cảnh báo DATE_TOO_FAR.
      const resPermissive = await inspectPhotoMetadata({
        buffer: jpegBuf,
        fileName: 'photo.jpg',
        voucherCreatedAt: '2026-10-15T10:00:00.000Z',
        options: { thresholdDays: 20 },
      });
      expect(resPermissive.warnings.some((w) => w.code === 'DATE_TOO_FAR')).toBe(false);
    });
  });

  describe('Phân quyền hiển thị (sanitizeInspectionForRole)', () => {
    test('người duyệt (isReviewer = true) xem đầy đủ thông tin đối chiếu kỹ thuật', () => {
      const raw = {
        status: 'warning',
        summary: 'Có cảnh báo',
        warnings: [
          {
            code: 'SCREENSHOT_SUSPECTED',
            title: 'Dấu hiệu màn hình',
            severity: 'high',
            reason: 'Tỷ lệ màn hình',
            actual_value: '1080x2400',
            comparison_value: 'Màn hình chuẩn',
            confidence: 'high',
          },
        ],
        metadata: { width: 1080, height: 2400, file_hash: 'abc123' },
      };

      const result = sanitizeInspectionForRole(raw, true);
      expect(result).toEqual(raw);
    });

    test('người gửi / thành viên thông thường (isReviewer = false) chỉ thấy tóm tắt', () => {
      const raw = {
        status: 'warning',
        summary: 'Có cảnh báo',
        warnings: [
          {
            code: 'SCREENSHOT_SUSPECTED',
            title: 'Dấu hiệu màn hình',
            severity: 'high',
            reason: 'Tỷ lệ màn hình',
            actual_value: '1080x2400',
            comparison_value: 'Màn hình chuẩn',
            confidence: 'high',
          },
        ],
        metadata: { width: 1080, height: 2400, file_hash: 'abc123' },
      };

      const result = sanitizeInspectionForRole(raw, false);
      expect(result.status).toBe('warning');
      expect(result.warnings[0].title).toBe('Dấu hiệu màn hình');
      expect(result.warnings[0].actual_value).toBeUndefined();
      expect(result.warnings[0].comparison_value).toBeUndefined();
      expect(result.metadata.file_hash).toBeUndefined();
    });
  });

  describe('Kiểm thử định dạng PNG và WebP (Metadata vs Non-metadata)', () => {
    test('1. PNG có metadata EXIF (eXIf chunk) -> status clean, trích xuất đầy đủ máy ảnh và toạ độ', async () => {
      const pngBuf = createPngWithExif({
        make: 'Sony',
        model: 'A7 IV',
        dateTimeOriginal: '2026-03-15T07:30:00.000Z',
        latitude: 21.028511,
        longitude: 105.804817,
        iso: 400,
        fNumber: 4.0,
        exposureTime: 0.004,
        width: 1920,
        height: 1080,
      });

      const res = await inspectPhotoMetadata({
        buffer: pngBuf,
        mimeType: 'image/png',
        fileName: 'site_survey.png',
        voucherCreatedAt: '2026-03-16T00:00:00.000Z',
      });

      expect(res.status).toBe('clean');
      expect(res.has_sufficient_data).toBe(true);
      expect(res.metadata.make).toBe('Sony');
      expect(res.metadata.model).toBe('A7 IV');
      expect(res.metadata.iso).toBe('400');
      expect(res.metadata.aperture).toBe('f/4');
      expect(res.metadata.shutter_speed).toBe('1/250s');
      expect(res.metadata.width).toBe(1920);
      expect(res.metadata.height).toBe(1080);
      expect(res.metadata.aspect_ratio).toBe('16:9');
      expect(res.warnings).toHaveLength(0);
    });

    test('2. PNG không có metadata (plain PNG) -> status incomplete_data, KHÔNG gây lỗi server', async () => {
      const pngBuf = createPlainPng(1600, 1200);

      const res = await inspectPhotoMetadata({
        buffer: pngBuf,
        mimeType: 'image/png',
        fileName: 'construction_drawing.png',
      });

      expect(res.status).toBe('incomplete_data');
      expect(res.can_evaluate).toBe(true);
      expect(res.summary).toContain('thiếu một số siêu dữ liệu gốc');
      expect(res.metadata.width).toBe(1600);
      expect(res.metadata.height).toBe(1200);
      expect(res.metadata.aspect_ratio).toBe('4:3');
      expect(res.metadata.make).toBeNull();
      expect(res.metadata.has_exif).toBe(false);
    });

    test('3. WebP có metadata EXIF (VP8X + EXIF chunk) -> status clean, trích xuất đầy đủ máy ảnh', async () => {
      const webpBuf = createWebpWithExif({
        make: 'Google',
        model: 'Pixel 8 Pro',
        dateTimeOriginal: '2026-03-15T07:30:00.000Z',
        latitude: 10.762622,
        longitude: 106.660172,
        iso: 100,
        fNumber: 1.8,
        exposureTime: 0.008,
        width: 1920,
        height: 1080,
      });

      const res = await inspectPhotoMetadata({
        buffer: webpBuf,
        mimeType: 'image/webp',
        fileName: 'site_photo.webp',
        voucherCreatedAt: '2026-03-16T00:00:00.000Z',
      });

      expect(res.status).toBe('clean');
      expect(res.metadata.make).toBe('Google');
      expect(res.metadata.model).toBe('Pixel 8 Pro');
      expect(res.metadata.iso).toBe('100');
      expect(res.metadata.aperture).toBe('f/1.8');
      expect(res.metadata.shutter_speed).toBe('1/125s');
      expect(res.metadata.aspect_ratio).toBe('16:9');
    });

    test('4. WebP không có metadata (plain WebP VP8) -> status incomplete_data, đọc kích thước độc lập', async () => {
      const webpBuf = createPlainWebp(1200, 900);

      const res = await inspectPhotoMetadata({
        buffer: webpBuf,
        mimeType: 'image/webp',
        fileName: 'drawing.webp',
      });

      expect(res.status).toBe('incomplete_data');
      expect(res.can_evaluate).toBe(true);
      expect(res.metadata.width).toBe(1200);
      expect(res.metadata.height).toBe(900);
      expect(res.metadata.aspect_ratio).toBe('4:3');
    });

    test('5. Tích hợp trực tiếp photoMeta từ upload handler -> đồng bộ toàn bộ trường và toạ độ GPS', async () => {
      const jpegBuf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
        offsetTimeOriginal: '+07:00',
        latitude: 10.762622,
        longitude: 106.660172,
        accuracy: 4.5,
        make: 'Nikon',
        model: 'Z9',
        width: 3840,
        height: 2160,
      });

      // Giả lập photoMeta được trích xuất tại upload route
      const { extractPhotoMetadata } = require('../services/photoMetadata');
      const photoMeta = await extractPhotoMetadata(jpegBuf, 'image/jpeg');

      const res = await inspectPhotoMetadata({
        buffer: jpegBuf,
        mimeType: 'image/jpeg',
        fileName: 'high_res_nikon.jpg',
        photoMeta,
      });

      expect(res.metadata.make).toBe('Nikon');
      expect(res.metadata.model).toBe('Z9');
      expect(res.metadata.gps_latitude).toBeCloseTo(10.762622, 5);
      expect(res.metadata.gps_longitude).toBeCloseTo(106.660172, 5);
      expect(res.metadata.gps_accuracy_m).toBe(4.5);
      expect(res.metadata.width).toBe(3840);
      expect(res.metadata.height).toBe(2160);
      expect(res.metadata.aspect_ratio).toBe('16:9');
    });
  });
});

