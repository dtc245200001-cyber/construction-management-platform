"use strict";

/**
 * Migration thêm các cột siêu dữ liệu ảnh hiện trường (EXIF/GPS)
 * cho 2 bảng:
 *   1. diary_entry_attachments
 *   2. acceptance_voucher_photos
 *
 * Story S-40: T-105 & T-106
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Thêm cột vào bảng diary_entry_attachments
  pgm.sql(`
    ALTER TABLE diary_entry_attachments
      ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS captured_at_source VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(9,6) NULL,
      ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(9,6) NULL,
      ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(6,2) NULL,
      ADD COLUMN IF NOT EXISTS metadata_status VARCHAR(32) NOT NULL DEFAULT 'not_processed',
      ADD COLUMN IF NOT EXISTS metadata_source VARCHAR(32) NOT NULL DEFAULT 'file';

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_diary_attachments_gps'
      ) THEN
        ALTER TABLE diary_entry_attachments
          ADD CONSTRAINT chk_diary_attachments_gps
          CHECK (
            (gps_latitude IS NULL) = (gps_longitude IS NULL) AND
            (gps_latitude IS NULL OR (gps_latitude BETWEEN -90 AND 90 AND gps_longitude BETWEEN -180 AND 180))
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_diary_attachments_status'
      ) THEN
        ALTER TABLE diary_entry_attachments
          ADD CONSTRAINT chk_diary_attachments_status
          CHECK (
            metadata_status IN ('complete', 'time_only', 'gps_only', 'none', 'unreadable', 'unsupported', 'not_processed')
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_diary_attachments_time_source'
      ) THEN
        ALTER TABLE diary_entry_attachments
          ADD CONSTRAINT chk_diary_attachments_time_source
          CHECK (
            captured_at_source IS NULL OR
            captured_at_source IN ('exif_offset', 'gps_utc', 'assumed_local', 'client_reported')
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_diary_attachments_source'
      ) THEN
        ALTER TABLE diary_entry_attachments
          ADD CONSTRAINT chk_diary_attachments_source
          CHECK (
            metadata_source IN ('file', 'client')
          );
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_diary_attachments_metadata_status
      ON diary_entry_attachments (metadata_status);
  `);

  // 2. Thêm cột vào bảng acceptance_voucher_photos
  pgm.sql(`
    ALTER TABLE acceptance_voucher_photos
      ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS captured_at_source VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(9,6) NULL,
      ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(9,6) NULL,
      ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(6,2) NULL,
      ADD COLUMN IF NOT EXISTS metadata_status VARCHAR(32) NOT NULL DEFAULT 'not_processed',
      ADD COLUMN IF NOT EXISTS metadata_source VARCHAR(32) NOT NULL DEFAULT 'file';

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_acceptance_photos_gps'
      ) THEN
        ALTER TABLE acceptance_voucher_photos
          ADD CONSTRAINT chk_acceptance_photos_gps
          CHECK (
            (gps_latitude IS NULL) = (gps_longitude IS NULL) AND
            (gps_latitude IS NULL OR (gps_latitude BETWEEN -90 AND 90 AND gps_longitude BETWEEN -180 AND 180))
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_acceptance_photos_status'
      ) THEN
        ALTER TABLE acceptance_voucher_photos
          ADD CONSTRAINT chk_acceptance_photos_status
          CHECK (
            metadata_status IN ('complete', 'time_only', 'gps_only', 'none', 'unreadable', 'unsupported', 'not_processed')
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_acceptance_photos_time_source'
      ) THEN
        ALTER TABLE acceptance_voucher_photos
          ADD CONSTRAINT chk_acceptance_photos_time_source
          CHECK (
            captured_at_source IS NULL OR
            captured_at_source IN ('exif_offset', 'gps_utc', 'assumed_local', 'client_reported')
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_acceptance_photos_source'
      ) THEN
        ALTER TABLE acceptance_voucher_photos
          ADD CONSTRAINT chk_acceptance_photos_source
          CHECK (
            metadata_source IN ('file', 'client')
          );
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_acceptance_photos_metadata_status
      ON acceptance_voucher_photos (metadata_status);
  `);
};

exports.down = (pgm) => {
  // Hoàn tác các thay đổi trên cả 2 bảng
  pgm.sql(`
    DROP INDEX IF EXISTS idx_diary_attachments_metadata_status;
    ALTER TABLE diary_entry_attachments
      DROP CONSTRAINT IF EXISTS chk_diary_attachments_gps,
      DROP CONSTRAINT IF EXISTS chk_diary_attachments_status,
      DROP CONSTRAINT IF EXISTS chk_diary_attachments_time_source,
      DROP CONSTRAINT IF EXISTS chk_diary_attachments_source,
      DROP COLUMN IF EXISTS captured_at,
      DROP COLUMN IF EXISTS captured_at_source,
      DROP COLUMN IF EXISTS gps_latitude,
      DROP COLUMN IF EXISTS gps_longitude,
      DROP COLUMN IF EXISTS gps_accuracy_m,
      DROP COLUMN IF EXISTS metadata_status,
      DROP COLUMN IF EXISTS metadata_source;

    DROP INDEX IF EXISTS idx_acceptance_photos_metadata_status;
    ALTER TABLE acceptance_voucher_photos
      DROP CONSTRAINT IF EXISTS chk_acceptance_photos_gps,
      DROP CONSTRAINT IF EXISTS chk_acceptance_photos_status,
      DROP CONSTRAINT IF EXISTS chk_acceptance_photos_time_source,
      DROP CONSTRAINT IF EXISTS chk_acceptance_photos_source,
      DROP COLUMN IF EXISTS captured_at,
      DROP COLUMN IF EXISTS captured_at_source,
      DROP COLUMN IF EXISTS gps_latitude,
      DROP COLUMN IF EXISTS gps_longitude,
      DROP COLUMN IF EXISTS gps_accuracy_m,
      DROP COLUMN IF EXISTS metadata_status,
      DROP COLUMN IF EXISTS metadata_source;
  `);
};
