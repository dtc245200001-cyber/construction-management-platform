"use strict";

// S-22 / T-50
// Tạo các bảng phục vụ mục đầu ngày: nhân lực, thiết bị, thời tiết.
// Bảng danh mục (diary_weather_types, diary_equipment_types) là toàn hệ thống,
// dữ liệu được seed ngay trong migration này (idempotent).

exports.up = (pgm) => {
  // ── Danh mục thời tiết ─────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE diary_weather_types (
      id         SERIAL PRIMARY KEY,
      code       VARCHAR(40)  NOT NULL,
      label      VARCHAR(80)  NOT NULL,
      is_adverse BOOLEAN      NOT NULL DEFAULT false,
      sort_order INTEGER      NOT NULL DEFAULT 0,
      is_active  BOOLEAN      NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT diary_weather_types_code_key UNIQUE (code)
    );
  `);

  // ── Danh mục thiết bị ──────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE diary_equipment_types (
      id         SERIAL PRIMARY KEY,
      code       VARCHAR(40)  NOT NULL,
      label      VARCHAR(100) NOT NULL,
      unit       VARCHAR(30)  NULL,
      sort_order INTEGER      NOT NULL DEFAULT 0,
      is_active  BOOLEAN      NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT diary_equipment_types_code_key UNIQUE (code)
    );
  `);

  // ── Mục đầu ngày (mỗi dự án × ngày đúng một bản ghi) ─────────────────
  pgm.sql(`
    CREATE TABLE diary_daily_logs (
      id               SERIAL PRIMARY KEY,
      project_id       INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      log_date         DATE         NOT NULL,
      manpower_count   INTEGER      NULL CHECK (manpower_count BETWEEN 0 AND 99999),
      weather_type_id  INTEGER      NULL REFERENCES diary_weather_types(id) ON DELETE RESTRICT,
      weather_note     TEXT         NULL CHECK (char_length(weather_note) <= 500),
      created_by       INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_by       INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT diary_daily_logs_project_date_key UNIQUE (project_id, log_date)
    );
  `);

  // ── Thiết bị sử dụng trong ngày ────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE diary_daily_equipment (
      id                SERIAL  PRIMARY KEY,
      daily_log_id      INTEGER NOT NULL REFERENCES diary_daily_logs(id) ON DELETE CASCADE,
      equipment_type_id INTEGER NOT NULL REFERENCES diary_equipment_types(id) ON DELETE RESTRICT,
      quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
      CONSTRAINT diary_daily_equipment_log_type_key UNIQUE (daily_log_id, equipment_type_id)
    );
  `);

  // ── Seed dữ liệu thời tiết ─────────────────────────────────────────────
  pgm.sql(`
    INSERT INTO diary_weather_types (code, label, is_adverse, sort_order) VALUES
      ('nang',           'Nắng',                         false, 10),
      ('nhieu_may',      'Nhiều mây',                    false, 20),
      ('mua_nho',        'Mưa nhỏ, vẫn thi công được',   false, 30),
      ('mua_nua_ngay',   'Mưa nửa ngày',                 true,  40),
      ('mua_ca_ngay',    'Mưa cả ngày',                  true,  50),
      ('giong_bao',      'Giông, bão',                   true,  60),
      ('gio_lon',        'Gió lớn',                      true,  70),
      ('nang_nong',      'Nắng nóng gay gắt',            true,  80)
    ON CONFLICT (code) DO NOTHING;
  `);

  // ── Seed dữ liệu thiết bị ─────────────────────────────────────────────
  pgm.sql(`
    INSERT INTO diary_equipment_types (code, label, unit, sort_order) VALUES
      ('may_xuc',          'Máy xúc',            'chiếc', 10),
      ('may_ui',           'Máy ủi',             'chiếc', 20),
      ('xe_tai_ben',       'Xe tải, xe ben',     'chiếc', 30),
      ('may_tron_be_tong', 'Máy trộn bê tông',   'chiếc', 40),
      ('xe_bom_be_tong',   'Xe bơm bê tông',     'chiếc', 50),
      ('cau_thap',         'Cần trục tháp',      'chiếc', 60),
      ('cau_banh_lop',     'Cẩu bánh lốp',       'chiếc', 70),
      ('may_dam',          'Máy đầm',            'chiếc', 80),
      ('may_phat_dien',    'Máy phát điện',      'chiếc', 90),
      ('may_bom_nuoc',     'Máy bơm nước',       'chiếc', 100)
    ON CONFLICT (code) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS diary_daily_equipment CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS diary_daily_logs CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS diary_equipment_types CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS diary_weather_types CASCADE;`);
};
