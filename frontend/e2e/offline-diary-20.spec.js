// T-83: E2E offline - tạo 20 nhật ký kèm ảnh, reload, bật mạng, xác minh server nhận đủ.
// Chạy: cd frontend && npm run test:e2e:offline
import { test, expect } from '@playwright/test';

// Bản production (build + preview) có service worker của VitePWA; request do service worker gửi
// không đi qua page.route nên server giả/giả lập mạng mất tác dụng. Chặn để test giống bản dev.
test.use({ serviceWorkers: 'block' });

const PROJECT_ID = 1;
const ENTRY_COUNT = 20;
const RUN_ID = `${Date.now()}`; // mỗi lần chạy một tiền tố nội dung riêng -> chạy lặp không đụng nhau
const CONTENT_PREFIX = `T-83 ${RUN_ID} nhật ký `;

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6sAAAAASUVORK5CYII=',
  'base64',
);

// Đọc trực tiếp IndexedDB (nguồn sự thật), không dựa vào số dòng trên UI.
async function readOfflineDb(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('construction_diary_offline');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const getAll = (name) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(name, 'readonly').objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const logs = await getAll('diaryLogs');
    const attachments = await getAll('diaryAttachments');
    db.close();
    return {
      logs: logs.map((l) => ({
        clientId: l.clientId,
        projectId: l.projectId,
        content: l.content,
        syncStatus: l.syncStatus,
      })),
      attachments: attachments.map((a) => ({
        id: a.id,
        diaryClientId: a.diaryClientId,
        fileName: a.fileName,
        hasBlob: a.blob instanceof Blob,
        size: a.blob?.size ?? 0,
        syncStatus: a.syncStatus,
      })),
    };
  });
}

function ownLogs(db) {
  return db.logs.filter((l) => l.content?.startsWith(CONTENT_PREFIX));
}

test('T-83: offline tạo 20 nhật ký + 20 ảnh, reload không mất, online thì server nhận đủ', async ({
  page,
}) => {
  // ---- "Server" giả ghi lại những gì nhận được, chống trùng theo client_id (idempotent) ----
  const server = {
    entries: new Map(), // client_id -> { id, content }
    attachments: new Map(), // client_id (UUID ảnh) -> { entryServerId, fileName, size }
    entryPosts: 0,
    attachmentPosts: 0,
  };
  let nextId = 1000;
  let networkDown = true; // true = mọi request /api bị cắt như mất mạng

  // Giả lập offline: không dùng context.setOffline vì nó chặn luôn file tĩnh nên reload sẽ lỗi
  // ERR_INTERNET_DISCONNECTED (app chưa có service worker). Ta chỉ cắt /api và ép navigator.onLine.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => localStorage.getItem('__e2e_offline') === '0', // '0' = online, còn lại = offline
    });
    if (localStorage.getItem('__e2e_offline') === null) {
      localStorage.setItem('__e2e_offline', '1');
    }
    localStorage.setItem(
      'cached_auth_user',
      JSON.stringify({ id: 1, name: 'T-83 E2E', email: 'e2e@example.test', role: 'ky_su_giam_sat' }),
    );
    localStorage.setItem('currentProjectId', '1');
    localStorage.setItem('project_role_1', 'ky_su_giam_sat');
    localStorage.setItem(
      'categories_1',
      JSON.stringify([{ id: 101, name: 'Hạng mục E2E', code: 'E2E-101', work_item_id: 101 }]),
    );
  });

  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/**', async (route) => {
    if (networkDown) return route.abort('internetdisconnected');

    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname.endsWith('/auth/me')) {
      return json(route, {
        user: { id: 1, name: 'T-83 E2E', email: 'e2e@example.test', role: 'ky_su_giam_sat' },
      });
    }
    if (pathname.endsWith('/projects/1')) return json(route, { membership: 'ky_su_giam_sat' });
    if (pathname.endsWith('/categories/1/tree/all')) {
      return json(route, [{ id: 101, name: 'Hạng mục E2E', code: 'E2E-101', work_item_id: 101 }]);
    }

    // POST /projects/1/diary-entries  { client_id, content, work_item_id, entry_at }
    if (method === 'POST' && /\/projects\/1\/diary-entries$/.test(pathname)) {
      server.entryPosts += 1;
      const body = request.postDataJSON();
      let entry = server.entries.get(body.client_id);
      if (!entry) {
        entry = { id: nextId++, content: body.content };
        server.entries.set(body.client_id, entry);
      }
      return json(route, { id: entry.id, version: 1 }, 201);
    }

    // POST /projects/1/diary-entries/:id/attachments  (multipart: image + client_id)
    const attMatch = pathname.match(/\/projects\/1\/diary-entries\/(\d+)\/attachments$/);
    if (method === 'POST' && attMatch) {
      server.attachmentPosts += 1;
      const raw = request.postDataBuffer()?.toString('latin1') ?? '';
      const clientId = raw.match(/name="client_id"\r\n\r\n([^\r\n]+)/)?.[1];
      const fileName = raw.match(/filename="([^"]+)"/)?.[1];
      const size = (raw.split('\r\n\r\n')[2] ?? '').length; // gần đúng: có dữ liệu ảnh hay không
      if (!clientId) return json(route, { message: 'Thiếu client_id' }, 400);
      let att = server.attachments.get(clientId);
      if (!att) {
        att = { id: nextId++, entryServerId: Number(attMatch[1]), fileName, size };
        server.attachments.set(clientId, att);
      }
      return json(route, { id: att.id, url: `/uploads/${att.id}.png` }, 201);
    }

    return json(route, {});
  });

  // ---- 1. Mở trang khi còn mạng để app tải xong, rồi chuyển sang offline ----
  networkDown = false;
  await page.goto('/diary');
  await expect(page.getByRole('button', { name: /ghi nhật ký/i })).toBeVisible({ timeout: 20_000 });

  networkDown = true;
  await page.evaluate(() => {
    localStorage.setItem('__e2e_offline', '1');
    window.dispatchEvent(new Event('offline'));
  });

  // ---- 2. Tạo 20 nhật ký kèm ảnh khi offline ----
  for (let i = 1; i <= ENTRY_COUNT; i += 1) {
    // Form của vòng trước phải đóng hẳn thì nút mới bấm được (nhánh offline tự đóng form).
    await expect(page.getByTestId('category-dropdown')).toBeHidden({ timeout: 10_000 });
    await page.getByRole('button', { name: /ghi nhật ký/i }).click();

    const category = page.getByTestId('category-dropdown');
    await expect(category).toBeVisible();
    const optionValue = await category
      .locator('option')
      .evaluateAll((opts) => opts.find((o) => o.value && !o.disabled)?.value ?? '');
    expect(optionValue, 'Phải có ít nhất 1 hạng mục hợp lệ').not.toBe('');
    await category.selectOption(optionValue);

    await page.locator('textarea').first().fill(`${CONTENT_PREFIX}${i}`);
    await page.locator('input[type="datetime-local"]').first().fill('2026-10-14T08:00');
    await page.getByTestId('diary-image-input').setInputFiles({
      name: `e2e-${i}.png`,
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });
    await page.getByTestId('submit-diary-btn').click();

    // Đợi IndexedDB ghi xong mục thứ i rồi mới tạo mục kế (không nuốt lỗi bằng .catch).
    await expect
      .poll(async () => ownLogs(await readOfflineDb(page)).length, { timeout: 15_000 })
      .toBe(i);
  }

  // ---- 3. Trước reload: đúng 20 mục, 20 UUID khác nhau, 20 ảnh có Blob, đều pending ----
  const before = await readOfflineDb(page);
  const logsBefore = ownLogs(before);
  expect(logsBefore).toHaveLength(ENTRY_COUNT);
  const clientIds = logsBefore.map((l) => l.clientId);
  expect(new Set(clientIds).size).toBe(ENTRY_COUNT);
  for (const id of clientIds) {
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  const attBefore = before.attachments.filter((a) => a.fileName?.startsWith('e2e-'));
  expect(attBefore).toHaveLength(ENTRY_COUNT);
  expect(attBefore.every((a) => a.hasBlob && a.size > 0)).toBe(true);
  expect(new Set(attBefore.map((a) => a.diaryClientId)).size).toBe(ENTRY_COUNT);
  expect(server.entryPosts, 'Khi offline không được gửi gì lên server').toBe(0);

  // ---- 4. "Khởi động lại" ứng dụng: reload vẫn trong trạng thái offline ----
  await page.reload();
  await expect(page.getByRole('button', { name: /ghi nhật ký/i })).toBeVisible({ timeout: 20_000 });

  const afterReload = await readOfflineDb(page);
  expect(ownLogs(afterReload).map((l) => l.clientId).sort()).toEqual([...clientIds].sort());
  expect(afterReload.attachments.filter((a) => a.fileName?.startsWith('e2e-'))).toHaveLength(
    ENTRY_COUNT,
  );
  expect(server.entryPosts).toBe(0);

  // ---- 5. Bật mạng lại -> app tự đồng bộ ----
  networkDown = false;
  await page.evaluate(() => {
    localStorage.setItem('__e2e_offline', '0');
    window.dispatchEvent(new Event('online'));
  });

  // Đợi hàng đợi chạy hết (cả mục lẫn ảnh đều synced)
  await expect
    .poll(
      async () => {
        const db = await readOfflineDb(page);
        const logs = ownLogs(db);
        const atts = db.attachments.filter((a) => a.fileName?.startsWith('e2e-'));
        return (
          logs.length === ENTRY_COUNT &&
          logs.every((l) => l.syncStatus === 'synced') &&
          atts.length === ENTRY_COUNT &&
          atts.every((a) => a.syncStatus === 'synced')
        );
      },
      { timeout: 90_000, intervals: [1_000] },
    )
    .toBe(true);

  // ---- 6. Xác minh phía server: đúng 20 UUID, đúng 20 ảnh, không trùng ----
  expect([...server.entries.keys()].sort()).toEqual([...clientIds].sort());
  expect(server.entries.size).toBe(ENTRY_COUNT);
  expect(server.entryPosts, 'Không được gửi trùng nhật ký').toBe(ENTRY_COUNT);

  expect(server.attachments.size).toBe(ENTRY_COUNT);
  expect(server.attachmentPosts, 'Không được gửi trùng ảnh').toBe(ENTRY_COUNT);
  const serverEntryIds = new Set([...server.entries.values()].map((e) => e.id));
  for (const att of server.attachments.values()) {
    expect(serverEntryIds.has(att.entryServerId)).toBe(true); // ảnh gắn đúng nhật ký
    expect(att.fileName).toMatch(/^e2e-\d+\.png$/);
  }
  const perEntry = new Map();
  for (const att of server.attachments.values()) {
    perEntry.set(att.entryServerId, (perEntry.get(att.entryServerId) ?? 0) + 1);
  }
  expect([...perEntry.values()].every((n) => n === 1)).toBe(true); // mỗi nhật ký đúng 1 ảnh
});