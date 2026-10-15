/**
 * Unit tests cho photoMetadata.js
 * Story S-40: T-105, Story S-42: T-109
 */

const {
  extractPhotoMetadata,
  extractImageDimensions,
  calculateAspectRatio,
  gcd,
  parseExifDateTime,
  parseGpsDateTime,
  parseCoordinate,
  validateAndFormatGps,
  validateAccuracy,
  isValidCaptureDate,
  formatAperture,
  formatShutterSpeed,
} = require('../services/photoMetadata');

const {
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
  createPngWithExif,
  createPlainPng,
  createWebpWithExif,
  createPlainWebp,
} = require('./helpers/jpegWithExif');

describe('photoMetadata service', () => {
  describe('Helper functions', () => {
    test('gcd tính đúng ước chung lớn nhất', () => {
      expect(gcd(1920, 1080)).toBe(120);
      expect(gcd(2880, 2160)).toBe(720);
      expect(gcd(1080, 1080)).toBe(1080);
      expect(gcd(0, 5)).toBe(5);
    });

    test('calculateAspectRatio rút gọn tỷ lệ khung hình theo GCD', () => {
      expect(calculateAspectRatio(1920, 1080)).toBe('16:9');
      expect(calculateAspectRatio(2880, 2160)).toBe('4:3');
      expect(calculateAspectRatio(1080, 1080)).toBe('1:1');
      expect(calculateAspectRatio(2880, 1800)).toBe('8:5');
      expect(calculateAspectRatio(null, 1080)).toBeNull();
      expect(calculateAspectRatio(1920, 0)).toBeNull();
    });

    test('extractImageDimensions trích xuất đúng kích thước từ binary header', () => {
      const pngBuf = createPlainPng(800, 600);
      expect(extractImageDimensions(pngBuf)).toEqual({ width: 800, height: 600 });

      const jpegBuf = createPlainJpeg(1024, 768);
      expect(extractImageDimensions(jpegBuf)).toEqual({ width: 1024, height: 768 });

      const webpBuf = createPlainWebp(1280, 720);
      expect(extractImageDimensions(webpBuf)).toEqual({ width: 1280, height: 720 });
    });

    test('formatAperture định dạng f-number chuẩn', () => {
      expect(formatAperture(1.8)).toBe('f/1.8');
      expect(formatAperture(2.8)).toBe('f/2.8');
      expect(formatAperture(4.0)).toBe('f/4');
      expect(formatAperture(null, 2.0)).toBe('f/2');
      expect(formatAperture(null, null)).toBeNull();
    });

    test('formatShutterSpeed định dạng tốc độ màn trập phân số hoặc giây', () => {
      expect(formatShutterSpeed(0.008)).toBe('1/125s');
      expect(formatShutterSpeed(0.004)).toBe('1/250s');
      expect(formatShutterSpeed(2.0)).toBe('2s');
      expect(formatShutterSpeed(null, 7)).toBe('1/128s'); // 2^(-7) = 1/128
      expect(formatShutterSpeed(null, null)).toBeNull();
    });

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

  describe('extractPhotoMetadata từ JPEG', () => {
    test('1. JPEG có đầy đủ EXIF (thời gian, thiết bị, GPS, thông số camera) -> complete', async () => {
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
        offsetTimeOriginal: '+07:00',
        latitude: 10.762622,
        longitude: 106.660172,
        accuracy: 4.8,
        make: 'Canon',
        model: 'EOS R5',
        software: 'Firmware 1.5',
        iso: 200,
        fNumber: 2.8,
        exposureTime: 0.008, // 1/125s
        width: 1920,
        height: 1080,
      });

      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('complete');
      expect(meta.metadata_source).toBe('file');
      expect(meta.has_exif).toBe(true);
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.captured_at_source).toBe('exif_offset');
      expect(meta.gps_latitude).toBeCloseTo(10.762622, 5);
      expect(meta.gps_longitude).toBeCloseTo(106.660172, 5);
      expect(meta.gps_accuracy_m).toBe(4.8);
      expect(meta.make).toBe('Canon');
      expect(meta.model).toBe('EOS R5');
      expect(meta.software).toBe('Firmware 1.5');
      expect(meta.iso).toBe('200');
      expect(meta.aperture).toBe('f/2.8');
      expect(meta.shutter_speed).toBe('1/125s');
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.aspect_ratio).toBe('16:9');
    });

    test('2. JPEG không có EXIF (plain JPEG) -> status none, kích thước và tỷ lệ GCD vẫn đọc được', async () => {
      const buf = createPlainJpeg(1600, 1200);
      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('none');
      expect(meta.has_exif).toBe(false);
      expect(meta.captured_at).toBeNull();
      expect(meta.gps_latitude).toBeNull();
      expect(meta.make).toBeNull();
      expect(meta.model).toBeNull();
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(1200);
      expect(meta.aspect_ratio).toBe('4:3');
    });

    test('3. JPEG có DateTimeOriginal nhưng không có GPS -> status time_only', async () => {
      const buf = createJpegWithExif({
        dateTimeOriginal: '2026:03:15 14:30:00',
        make: 'Apple',
        model: 'iPhone 13',
      });

      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('time_only');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.gps_latitude).toBeNull();
      expect(meta.make).toBe('Apple');
      expect(meta.model).toBe('iPhone 13');
    });

    test('4. JPEG chỉ có GPS, không có thời gian -> status gps_only', async () => {
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

    test('5. JPEG có EXIF marker hỏng -> status unreadable', async () => {
      const buf = createCorruptedExifJpeg();
      const meta = await extractPhotoMetadata(buf, 'image/jpeg');
      expect(meta.metadata_status).toBe('unreadable');
      expect(meta.captured_at).toBeNull();
    });
  });

  describe('extractPhotoMetadata từ PNG', () => {
    test('1. PNG có metadata EXIF (qua chunk eXIf) -> trích xuất đầy đủ máy ảnh và thời gian', async () => {
      const buf = createPngWithExif({
        make: 'Sony',
        model: 'A7 IV',
        software: 'Lightroom 12',
        dateTimeOriginal: '2026:03:15 14:30:00',
        offsetTimeOriginal: '+07:00',
        latitude: 21.028511,
        longitude: 105.804817,
        iso: 400,
        fNumber: 4.0,
        exposureTime: 0.004, // 1/250s
        width: 1920,
        height: 1080,
      });

      const meta = await extractPhotoMetadata(buf, 'image/png');
      expect(meta.has_exif).toBe(true);
      expect(meta.metadata_status).toBe('complete');
      expect(meta.make).toBe('Sony');
      expect(meta.model).toBe('A7 IV');
      expect(meta.software).toBe('Lightroom 12');
      expect(meta.iso).toBe('400');
      expect(meta.aperture).toBe('f/4');
      expect(meta.shutter_speed).toBe('1/250s');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.gps_latitude).toBeCloseTo(21.028511, 5);
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.aspect_ratio).toBe('16:9');
    });

    test('2. PNG không có metadata (plain PNG) -> status none, kích thước và tỷ lệ đọc độc lập', async () => {
      const buf = createPlainPng(800, 600);
      const meta = await extractPhotoMetadata(buf, 'image/png');
      expect(meta.metadata_status).toBe('none');
      expect(meta.has_exif).toBe(false);
      expect(meta.make).toBeNull();
      expect(meta.captured_at).toBeNull();
      expect(meta.width).toBe(800);
      expect(meta.height).toBe(600);
      expect(meta.aspect_ratio).toBe('4:3');
    });
  });

  describe('extractPhotoMetadata từ WebP', () => {
    test('1. WebP có metadata EXIF (container VP8X + EXIF chunk) -> trích xuất thành công', async () => {
      const buf = createWebpWithExif({
        make: 'Google',
        model: 'Pixel 8 Pro',
        dateTimeOriginal: '2026:03:15 14:30:00',
        offsetTimeOriginal: '+07:00',
        latitude: 10.762622,
        longitude: 106.660172,
        iso: 100,
        fNumber: 1.8,
        exposureTime: 0.008,
        width: 1920,
        height: 1080,
      });

      const meta = await extractPhotoMetadata(buf, 'image/webp');
      expect(meta.has_exif).toBe(true);
      expect(meta.metadata_status).toBe('complete');
      expect(meta.make).toBe('Google');
      expect(meta.model).toBe('Pixel 8 Pro');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.gps_latitude).toBeCloseTo(10.762622, 5);
      expect(meta.iso).toBe('100');
      expect(meta.aperture).toBe('f/1.8');
      expect(meta.shutter_speed).toBe('1/125s');
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.aspect_ratio).toBe('16:9');
    });

    test('2. WebP không có metadata (plain WebP VP8 lossy) -> status none, đọc kích thước độc lập', async () => {
      const buf = createPlainWebp(1280, 720);
      const meta = await extractPhotoMetadata(buf, 'image/webp');
      expect(meta.metadata_status).toBe('none');
      expect(meta.has_exif).toBe(false);
      expect(meta.make).toBeNull();
      expect(meta.captured_at).toBeNull();
      expect(meta.width).toBe(1280);
      expect(meta.height).toBe(720);
      expect(meta.aspect_ratio).toBe('16:9');
    });
  });

  describe('File hỏng, rỗng và giả mạo phần mở rộng (Spoofed extension)', () => {
    test('1. Buffer rỗng hoặc null -> status unreadable', async () => {
      const emptyRes = await extractPhotoMetadata(Buffer.alloc(0), 'image/jpeg');
      expect(emptyRes.metadata_status).toBe('unreadable');

      const nullRes = await extractPhotoMetadata(null, 'image/jpeg');
      expect(nullRes.metadata_status).toBe('unreadable');
    });

    test('2. File văn bản giả mạo .jpg (MIME image/jpeg nhưng buffer là text) -> status unsupported', async () => {
      const textBuf = Buffer.from('This is a text file pretending to be a JPEG image');
      const meta = await extractPhotoMetadata(textBuf, 'image/jpeg');
      expect(meta.metadata_status).toBe('unsupported');
    });

    test('3. File PDF giả mạo .png (MIME image/png nhưng buffer là PDF) -> status unsupported', async () => {
      const pdfBuf = Buffer.from('%PDF-1.4 header text data');
      const meta = await extractPhotoMetadata(pdfBuf, 'image/png');
      expect(meta.metadata_status).toBe('unsupported');
    });
  });

  describe('Fallback từ clientFallback', () => {
    test('ảnh trơn nhưng client gửi kèm exif_captured_at, GPS và Make/Model -> status complete, source client', async () => {
      const buf = createPlainJpeg();
      const clientFallback = {
        exif_captured_at: '2026-03-15T07:30:00.000Z',
        exif_latitude: 10.762622,
        exif_longitude: 106.660172,
        exif_accuracy_m: 5.5,
        make: 'Samsung',
        model: 'Galaxy S24',
        iso: '100',
      };

      const meta = await extractPhotoMetadata(buf, 'image/jpeg', clientFallback);
      expect(meta.metadata_status).toBe('complete');
      expect(meta.metadata_source).toBe('client');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.captured_at_source).toBe('client_reported');
      expect(meta.gps_latitude).toBe(10.762622);
      expect(meta.gps_longitude).toBe(106.660172);
      expect(meta.gps_accuracy_m).toBe(5.5);
      expect(meta.make).toBe('Samsung');
      expect(meta.model).toBe('Galaxy S24');
      expect(meta.iso).toBe('100');
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
        make: 'Sony',
        model: 'FX3',
      });

      const clientFallback = {
        exif_captured_at: '2026-01-01T00:00:00.000Z',
        exif_latitude: 21.028511,
        exif_longitude: 105.804817,
        make: 'ClientMake',
        model: 'ClientModel',
      };

      const meta = await extractPhotoMetadata(buf, 'image/jpeg', clientFallback);
      expect(meta.metadata_source).toBe('file');
      expect(meta.captured_at).toBe('2026-03-15T07:30:00.000Z');
      expect(meta.gps_latitude).toBeCloseTo(10.762622, 5);
      expect(meta.make).toBe('Sony');
      expect(meta.model).toBe('FX3');
    });
  });
});
