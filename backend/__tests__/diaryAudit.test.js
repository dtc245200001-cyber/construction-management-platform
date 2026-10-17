const express = require('express');
const request = require('supertest');
const mockClient = { query: jest.fn(), release: jest.fn() };
const mockQuery = jest.fn();
const mockAudit = jest.fn();
jest.mock('../config/db', () => ({ connect: async () => mockClient, query: (...args) => mockQuery(...args) }));
jest.mock('../utils/auditLogger', () => ({ logAudit: (...args) => mockAudit(...args) }));
jest.mock('../middleware/auth', () => (req, res, next) => next());
jest.mock('../middleware/projectAccess', () => ({
  createProjectRouter: () => require('express').Router(),
  checkProjectAccess: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));
const router = require('../routes/diaryRoutes');
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { id: 7 }; next(); });
app.use('/api/projects', router);
app.use('/api/projects', require('../routes/diaryDaysRoutes'));

beforeEach(() => { jest.resetAllMocks(); });

test.each([
  ['lock', 'LOCK_DIARY', false, true],
  ['unlock', 'UNLOCK_DIARY', true, false],
])('%s records project and before/after only after commit', async (path, action, before, after) => {
  mockClient.query.mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ id: 3, is_locked: before, locked_by: 4 }] })
    .mockResolvedValueOnce({ rows: [{ id: 3, is_locked: after }] })
    .mockResolvedValueOnce({});
  mockAudit.mockImplementation(() => {
    expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
  });
  const res = await request(app).post(`/api/projects/12/diary-locks/2020-01-01/${path}`)
    .send({ reason: 'Đối soát' });
  expect(res.status).toBe(200);
  expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
    action, projectId: 12, entityId: 3, userId: 7,
    details: expect.objectContaining({
      old_value: expect.objectContaining({ is_locked: before }),
      new_value: expect.objectContaining({ is_locked: after }),
    }),
  }));
});

test('delete preserves full content and project scope in audit', async () => {
  const content = 'Nội dung đối soát '.repeat(20);
  mockClient.query.mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ id: 3, created_by: 7, content, work_item_id: 8 }] })
    .mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({});
  const res = await request(app).delete('/api/projects/12/diary-entries/3');
  expect(res.status).toBe(200);
  expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 12, action: 'DELETE_DIARY_ENTRY',
    details: expect.objectContaining({ old_value: expect.objectContaining({ content }), new_value: null }),
  }));
});

test('update captures changed content and version', async () => {
  const old = { id: 3, content: 'Trước', work_item_id: 8, entry_date: '2020-01-01', version: 1 };
  const updated = { ...old, content: 'Sau', version: 2 };
  mockClient.query.mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [old] }).mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [updated] })
    .mockResolvedValueOnce({ rows: [{ attachments: [] }] }).mockResolvedValueOnce({});
  const res = await request(app).put('/api/projects/12/diary-entries/3').send({ content: 'Sau', version: 1 });
  expect(res.status).toBe(200);
  expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 12,
    details: expect.objectContaining({
      old_value: expect.objectContaining({ content: 'Trước', version: 1 }),
      new_value: expect.objectContaining({ content: 'Sau', version: 2 }),
    }),
  }));
});

test('daily log captures manpower and removed equipment before replacement', async () => {
  const old = { id: 3, manpower_count: 10 };
  const updated = { id: 3, manpower_count: 20, inserted: false };
  const equipment = [{ equipment_type_id: 2, quantity: 4 }];
  mockClient.query.mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [old] })
    .mockResolvedValueOnce({ rows: equipment })
    .mockResolvedValueOnce({ rows: [updated] })
    .mockResolvedValueOnce({}).mockResolvedValueOnce({});
  mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
    .mockResolvedValueOnce({ rows: [updated] }).mockResolvedValueOnce({ rows: [] });
  const res = await request(app).put('/api/projects/12/diary-days/2020-01-01').send({ manpower_count: 20 });
  expect(res.status).toBe(200);
  expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 12, action: 'UPSERT_DIARY_DAILY_LOG',
    details: expect.objectContaining({
      old_value: { ...old, equipment }, new_value: { ...updated, equipment: [] },
    }),
  }));
});
