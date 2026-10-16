/**
 * Integration / API tests cho Photo Inspection (Story S-42 / T-109 & T-110)
 */

'use strict';

const request = require('supertest');
const express = require('express');
const sharp = require('sharp');

const mockQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.mock('../config/db', () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(() => Promise.resolve(mockClient)),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

let mockCurrentProjectRole = 'ky_su_giam_sat';

jest.mock('../middleware/auth', () => (req, _res, next) => {
  req.user = req.session?.user || req.user || { id: 10, is_system_admin: false };
  next();
});

jest.mock('../middleware/projectAccess', () => {
  const express = require('express');
  return {
    checkProjectAccess: (req, res, next) => {
      req.projectRole = mockCurrentProjectRole;
      next();
    },
    requirePermission: (perm) => (req, res, next) => {
      const { can } = require('../utils/permissions');
      if (!can(req.projectRole, perm)) {
        return res.status(403).json({ message: 'Không có quyền truy cập' });
      }
      next();
    },
    allow: () => (req, res, next) => next(),
    createProjectRouter: () => express.Router({ mergeParams: true }),
  };
});

const acceptanceRoutes = require('../routes/acceptanceRoutes');
const photoMetadataRoutes = require('../routes/photoMetadataRoutes');
const { errorHandler } = require('../middleware/errorHandler');

function makeApp(user = { id: 10, is_system_admin: false }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user };
    req.user = user;
    next();
  });
  app.use('/api/projects', acceptanceRoutes);
  app.use('/api/projects', photoMetadataRoutes);
  app.use(errorHandler);
  return app;
}

const { createPngBuffer } = require('./helpers/photoInspectionHelpers');

describe('Acceptance Photo Inspection API (S-42 / T-109)', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentProjectRole = 'ky_su_giam_sat';
    app = makeApp({ id: 10, is_system_admin: false });
  });

  test('GET /acceptance-vouchers/:voucherId trả về nhãn trạng thái tối thiểu cho người lập', async () => {
    // 1. Voucher query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          project_id: 1,
          batch_name: 'Đợt 1 - Móng',
          status: 'pending_review',
          has_negative_delta: false,
          created_by: 10,
          created_at: '2026-10-15T00:00:00.000Z',
          site_latitude: '10.762622',
          site_longitude: '106.660172',
          site_radius_m: '500',
        },
      ],
    });

    // 2. Items query
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    // 3. Photos query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 101,
          voucher_id: 10,
          file_name: 'Screenshot_evidence.png',
          file_size: 150000,
          mime_type: 'image/png',
          caption: 'Ảnh màn hình báo cáo',
          uploaded_by: 10,
          created_at: '2026-10-15T01:00:00.000Z',
          captured_at: '2026-08-01T00:00:00.000Z',
          captured_at_source: null,
          metadata_status: 'none',
          metadata_source: 'file',
          geofence_status: 'outside',
          geofence_distance_m: '650.00',
          geofence_checked_at: '2026-10-15T01:00:00.000Z',
          exif_metadata: null, // Sẽ được evaluate dynamically bởi inspectVoucherPhotoRecord
        },
        {
          id: 102,
          voucher_id: 10,
          file_name: 'camera_normal.jpg',
          file_size: 2500000,
          mime_type: 'image/jpeg',
          caption: 'Ảnh camera chuẩn',
          uploaded_by: 10,
          created_at: '2026-10-15T02:00:00.000Z',
          captured_at: '2026-10-14T08:00:00.000Z',
          captured_at_source: 'exif_offset',
          metadata_status: 'complete',
          metadata_source: 'file',
          geofence_status: 'inside',
          geofence_distance_m: '50.00',
          geofence_checked_at: '2026-10-15T02:00:00.000Z',
          exif_metadata: {
            status: 'clean',
            can_evaluate: true,
            has_sufficient_data: true,
            summary: 'Bằng chứng hợp lệ',
            warnings: [],
            metadata: {
              is_screenshot: false,
              captured_at: '2026-10-14T08:00:00.000Z',
              make: 'Sony',
              model: 'Camera',
            },
          },
        },
      ],
    });

    const res = await request(app)
      .get('/api/projects/1/acceptance-vouchers/10')
      .expect(200);

    expect(res.body.voucher).toBeDefined();
    expect(res.body.photos).toHaveLength(2);

    // Kỹ sư giám sát chỉ nhận nhãn nghiệp vụ, không nhận lý do hoặc metadata EXIF.
    const p1 = res.body.photos[0];
    expect(p1.inspection).toBeDefined();
    expect(p1.inspection.data_status_label).toBe('Dữ liệu không đầy đủ và cảnh báo');
    expect(p1.inspection.warnings).toBeUndefined();
    expect(p1.exif_metadata).toBeUndefined();
    expect(p1.captured_at).toBeUndefined();

    // Ảnh hợp lệ phải có nhãn đầy đủ.
    const p2 = res.body.photos[1];
    expect(p2.inspection).toBeDefined();
    expect(p2.inspection.data_status_label).toBe('Dữ liệu đầy đủ');

    expect(res.body.photo_flags).toBeUndefined();
  });

  test('POST /acceptance-vouchers/:voucherId/photos kiểm tra và lưu inspection vào exif_metadata', async () => {
    // 1. Voucher check
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          status: 'draft',
          created_by: 10,
          site_latitude: '10.762622',
          site_longitude: '106.660172',
          site_radius_m: '500',
          created_at: '2026-10-15T00:00:00.000Z',
        },
      ],
    });

    // 2. Mock insert photo
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 103,
          file_name: 'Screenshot_evidence.png',
          file_size: 1000,
          mime_type: 'image/png',
          caption: 'Chụp màn hình',
          uploaded_by: 10,
          created_at: '2026-10-15T02:00:00.000Z',
          captured_at: null,
          captured_at_source: null,
          metadata_status: 'none',
          metadata_source: 'file',
          has_gps: false,
          geofence_status: 'no_gps',
          geofence_distance_m: null,
          geofence_checked_at: '2026-10-15T02:00:00.000Z',
          exif_metadata: {
            status: 'warning',
            can_evaluate: true,
            warnings: [{ code: 'SCREENSHOT_SUSPECTED' }],
          },
        },
      ],
    });

    const pngBuf = createPngBuffer(1080, 2400);

    const res = await request(app)
      .post('/api/projects/1/acceptance-vouchers/10/photos')
      .attach('photo', pngBuf, 'Screenshot_evidence.png')
      .field('caption', 'Chụp màn hình')
      .expect(201);

    expect(res.body.id).toBe(103);
    expect(res.body.inspection).toEqual({
      data_status_label: 'Dữ liệu không đầy đủ và cảnh báo',
    });
    expect(res.body.exif_metadata).toBeUndefined();
    expect(res.body.captured_at).toBeUndefined();

    // Xác nhận tham số câu INSERT có chứa JSON exif_metadata
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO acceptance_voucher_photos');
    expect(insertCall[1][5]).toContain('SCREENSHOT_SUSPECTED'); // param $6 là JSON exif_metadata
  });

  test('Kỹ sư giám sát gọi trực tiếp API EXIF acceptance nhận 403', async () => {
    const res = await request(app)
      .get('/api/projects/1/photo-metadata/acceptance/101')
      .expect(403);

    expect(res.body.message).toMatch(/Chủ đầu tư/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('GET /photo-metadata/acceptance/:photoId cho Chủ đầu tư trả về kết quả đầy đủ', async () => {
    mockCurrentProjectRole = 'chu_dau_tu';
    // 1. Query photo metadata
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 101,
          file_name: 'Screenshot_1.png',
          file_size: 50000,
          mime_type: 'image/png',
          captured_at: null,
          captured_at_source: null,
          gps_latitude: null,
          gps_longitude: null,
          gps_accuracy_m: null,
          metadata_status: 'none',
          metadata_source: 'file',
          geofence_status: 'no_gps',
          geofence_distance_m: null,
          geofence_checked_at: null,
          exif_metadata: null,
          voucher_created_at: '2026-10-15T00:00:00.000Z',
        },
      ],
    });

    const res = await request(app)
      .get('/api/projects/1/photo-metadata/acceptance/101')
      .expect(200);

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('inspection');
    expect(res.body.inspection.status).toBe('warning');
    expect(res.body.inspection.warnings.some((w) => w.code === 'SCREENSHOT_SUSPECTED')).toBe(true);
  });

  test('Kỹ sư giám sát chỉ nhận ảnh thu nhỏ đã loại EXIF, và ID ảnh phải nằm trong phiếu của mình', async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 4,
        background: { r: 20, g: 120, b: 70, alpha: 1 },
      },
    }).png().toBuffer();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        file_data: source,
        mime_type: 'image/png',
        file_name: 'original.png',
      }],
    });

    const res = await request(app)
      .get('/api/projects/1/acceptance-vouchers/10/photos/101')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(mockQuery.mock.calls[0][0]).toContain('av.created_by = $5');
    expect(mockQuery.mock.calls[0][1]).toEqual([101, 10, 1, true, 10]);
  });

  test('Kỹ sư giám sát không thể lấy ảnh bằng ID thuộc phiếu khác', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/projects/1/acceptance-vouchers/20/photos/999')
      .expect(404);

    expect(res.body.message).toMatch(/Không tìm thấy ảnh/i);
    expect(mockQuery.mock.calls[0][0]).toContain('av.created_by = $5');
    expect(mockQuery.mock.calls[0][1]).toEqual([999, 20, 1, true, 10]);
  });
});
