/**
 * Unit tests cho photoMetadata.js
 * Story S-40: T-105
 */

const {
  extractPhotoMetadata,
  parseExifDateTime,
  parseGpsDateTime,
  parseCoordinate,
  validateAndFormatGps,
  validateAccuracy,
  isValidCaptureDate,
} = require('../services/photoMetadata');

const {
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
} = require('./helpers/jpegWithExif');

describe('photoMetadata service', () => {
  describe('Helper functions', () => {
    test('parseExifDateTime với offset tường minh', () => {
      const d = parseExifDateTime('2026:03:15 14:30:00', '+07:00');
      expect(d).not.toBeNull();
      expect(d.toISOString()).toBe('2026-03-15T07:30:00.000Z');
    });

    test('parseExifDateTime không có offset -> giả định +07:00', () => {
      const d = parseExifDateTime('2026:03:15 14:30:00', null);
      expect(d).not.toBeNull();
      expect(d.toISOString()).toBe('2026-03-15T07:30:00.000Z');
    });

    test('parseExifDateTime từ chối chuỗi 0000:00:00 00:00:00', () => {
      expect(parseExifDateTime('0000:00:00 00:00:00', null)).toBeNull();
    });

    test('parseGpsDateTime tính đúng giờ UTC', () => {
      const d = parseGpsDateTime('2026:03:15', [7, 30, 0]);
      expect(d).not.toBeNull();
      expect(d.toISOString()).toBe('2026-03-15T07:30:00.000Z');
    });

    test('isValidCaptureDate từ chối năm < 2000 hoặc tương lai xa', () => {
      expect(isValidCaptureDate(new Date('1999-12-31T23:59:59Z'))).toBe(false);
      const farFuture = new Date(Date.now() + 48 * 3600 * 1000);
      expect(isValidCaptureDate(farFuture)).toBe(false);
      expect(isValidCaptureDate(new Date('2026-01-01T00:00:00Z'))).toBe(true);
    });

    test('validateAndFormatGps từ chối (0, 0) và kiểm tra miền', () => {
      expect(validateAndFormatGps(0, 0)).toEqual({ latitude: null, longitude: null });
      expect(validateAndFormatGps(95, 106)).toEqual({ latitude: null, longitude: null });
      expect(validateAndFormatGps(10.1234567, 106.1234567)).toEqual({
        latitude: 10.123457,
        longitude: 106.123457,
      });
    });

    test('parseCoordinate xử lý mảng DMS và hướng Nam/Tây', () => {
      expect(parseCoordinate([10, 30, 0], 'N')).toBeCloseTo(10.5, 4);
      expect(parseCoordinate([10, 30, 0], 'S')).toBeCloseTo(-10.5, 4);
      expect(parseCoordinate(106.5, 'W')).toBeCloseTo(-106.5, 4);
    });

    test('validateAccuracy chỉ nhận (0, 10000]', () => {
      expect(validateAccuracy(0)).toBeNull();
      expect(validateAccuracy(-5)).toBeNull();
      expect(validateAccuracy(15000)).toBeNull();
      expect(validateAccuracy(5.256)).toBe(5.26);
    });
  });

  describe('extractPhotoMetadata từ file buffer', () => {
    test('ảnh đầy đủ DateTimeOriginal + Offset + GPS + Accuracy -> status complete', async () => {
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
        offsetTimeOriginal: '+07:00',
        latitude: 10.762622,
        longitude: 106.660172,
        accuracy: 4.8,
      });

      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('complete');
      expect(meta.metadata_source).toBe('file');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.captured_at_source).toBe('exif_offset');
      expect(meta.gps_latitude).toBeCloseTo(10.762622, 5);
      expect(meta.gps_longitude).toBeCloseTo(106.660172, 5);
      expect(meta.gps_accuracy_m).toBe(4.8);
    });

    test('ảnh có DateTimeOriginal nhưng không có offset -> assumed_local (+07:00)', async () => {
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
      });

      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('time_only');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.captured_at_source).toBe('assumed_local');
      expect(meta.gps_latitude).toBeNull();
      expect(meta.gps_longitude).toBeNull();
    });

    test('ảnh có DateTimeOriginal và GPSDate/Time -> gps_utc khi không có offset', async () => {
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
        gpsDateStamp: '2026:03:15',
        gpsTimeStamp: [7, 30, 0],
      });

      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.captured_at_source).toBe('gps_utc');
    });

    test('ảnh chỉ có GPS, không có thời gian -> gps_only', async () => {
      const buf = createJpegWithExif({
        latitude: -10.5,
        longitude: -106.5,
      });

      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('gps_only');
      expect(meta.captured_at).toBeNull();
      expect(meta.gps_latitude).toBeCloseTo(-10.5, 5);
      expect(meta.gps_longitude).toBeCloseTo(-106.5, 5);
    });

    test('ảnh không có EXIF (plain JPEG) -> none', async () => {
      const buf = createPlainJpeg();
      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('none');
      expect(meta.captured_at).toBeNull();
      expect(meta.gps_latitude).toBeNull();
    });

    test('ảnh có EXIF marker hỏng -> unreadable', async () => {
      const buf = createCorruptedExifJpeg();
      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('unreadable');
      expect(meta.captured_at).toBeNull();
    });

    test('định dạng không hỗ trợ (ví dụ text hoặc pdf) -> unsupported', async () => {
      const buf = Buffer.from('%PDF-1.4 file content here');
      const meta = await extractPhotoMetadata(buf, 'application/pdf');
      expect(meta.metadata_status).toBe('unsupported');
    });

    test('ảnh lớn hơn 256KB vẫn được xử lý an toàn', async () => {
      const exifBuf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
        offsetTimeOriginal: '+07:00',
        latitude: 10.762622,
        longitude: 106.660172,
      });
      // Thêm padding 300KB dữ liệu giả vào sau
      const padding = Buffer.alloc(300 * 1024, 0xaa);
      const largeBuf = Buffer.concat([exifBuf, padding]);

      const meta = await extractPhotoMetadata(largeBuf, 'image/jpeg');
      expect(meta.metadata_status).toBe('complete');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.gps_latitude).toBeCloseTo(10.762622, 5);
    });
  });

  describe('Fallback từ clientFallback', () => {
    test('ảnh trơn nhưng client gửi kèm exif_captured_at và GPS -> status complete, source client', async () => {
      const buf = createPlainJpeg();
      const clientFallback = {
        exif_captured_at: '2026-03-15T07:30:00.000Z',
        exif_latitude: 10.762622,
        exif_longitude: 106.660172,
        exif_accuracy_m: 5.5,
      };

      const meta = await extractPhotoMetadata(buf, 'image/jpeg', clientFallback);
      expect(meta.metadata_status).toBe('complete');
      expect(meta.metadata_source).toBe('client');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.captured_at_source).toBe('client_reported');
      expect(meta.gps_latitude).toBe(10.762622);
      expect(meta.gps_longitude).toBe(106.660172);
      expect(meta.gps_accuracy_m).toBe(5.5);
    });

    test('client gửi toạ độ rác (0, 0) -> bị loại trừ', async () => {
      const buf = createPlainJpeg();
      const clientFallback = {
        exif_captured_at: '2026-03-15T07:30:00.000Z',
        exif_latitude: 0,
        exif_longitude: 0,
      };

      const meta = await extractPhotoMetadata(buf, 'image/jpeg', clientFallback);
      expect(meta.metadata_status).toBe('time_only');
      expect(meta.gps_latitude).toBeNull();
      expect(meta.gps_longitude).toBeNull();
    });

    test('file đã có metadata thì ưu tiên file, không bị client ghi đè', async () => {
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
        offsetTimeOriginal: '+07:00',
        latitude: 10.762622,
        longitude: 106.660172,
      });

      const clientFallback = {
        exif_captured_at: '2026-01-01T00:00:00.000Z',
        exif_latitude: 21.028511,
        exif_longitude: 105.804817,
      };

      const meta = await extractPhotoMetadata(buf, 'image/jpeg', clientFallback);
      expect(meta.metadata_source).toBe('file');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.gps_latitude).toBeCloseTo(10.762622, 5);
    });
  });
});
