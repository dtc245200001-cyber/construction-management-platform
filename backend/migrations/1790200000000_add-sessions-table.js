// Migration: Tạo bảng session cho connect-pg-simple.
//
// Bảng này lưu session người dùng trong PostgreSQL thay vì MemoryStore.
// Schema theo đúng yêu cầu của thư viện connect-pg-simple.
// Không để thư viện tự tạo bảng (createTableIfMissing) — kiểm soát schema qua migration.

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    // Dùng pgm.sql vì cú pháp COLLATE "default" không được hỗ trợ bởi pgm.createTable
    pgm.sql(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      ) WITH (OIDS=FALSE)
    `);

    // Index trên expire để connect-pg-simple prune session hết hạn hiệu quả
    pgm.sql(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
    `);
  },

  down: (pgm) => {
    pgm.sql(`DROP TABLE IF EXISTS "session"`);
  },
};
