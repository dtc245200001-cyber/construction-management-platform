"use strict";

/**
 * Migration bổ sung nguồn toạ độ (gps_source) và cơ sở đánh giá phạm vi (geofence_basis)
 * Story S-40 & S-41: Chống giả mạo GPS từ client (Hardening)
 *
 * Cột mới cho cả diary_entry_attachments và acceptance_voucher_photos:
 * - gps_source: 'file_exif' | 'client_reported'
 * - geofence_basis: 'file_exif' | 'client_reported'
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Thêm cột cho diary_entry_attachments
  pgm.sql(`
    ALTER TABLE diary_entry_attachments
      ADD COLUMN IF NOT EXISTS gps_source VARCHAR(20) NULL,
      ADD COLUMN IF NOT EXISTS geofence_basis VARCHAR(20) NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_diary_attachments_gps_source'
      ) THEN
        ALTER TABLE diary_entry_attachments
          ADD CONSTRAINT chk_diary_attachments_gps_source
          CHECK (
            gps_source IS NULL OR
            gps_source IN ('file_exif', 'client_reported')
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_diary_attachments_geofence_basis'
      ) THEN
        ALTER TABLE diary_entry_attachments
          ADD CONSTRAINT chk_diary_attachments_geofence_basis
          CHECK (
            geofence_basis IS NULL OR
            geofence_basis IN ('file_exif', 'client_reported')
          );
      END IF;
    END $$;

    -- Backfill dữ liệu cũ
    UPDATE diary_entry_attachments
    SET gps_source = 'file_exif'
    WHERE gps_latitude IS NOT NULL AND metadata_source = 'file' AND gps_source IS NULL;

    UPDATE diary_entry_attachments
    SET gps_source = 'client_reported'
    WHERE metadata_source = 'client' AND gps_source IS NULL;

    UPDATE diary_entry_attachments
    SET geofence_basis = gps_source
    WHERE geofence_status IN ('inside', 'outside') AND gps_source IS NOT NULL AND geofence_basis IS NULL;
  `);

  // 2. Thêm cột cho acceptance_voucher_photos
  pgm.sql(`
    ALTER TABLE acceptance_voucher_photos
      ADD COLUMN IF NOT EXISTS gps_source VARCHAR(20) NULL,
      ADD COLUMN IF NOT EXISTS geofence_basis VARCHAR(20) NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_acceptance_photos_gps_source'
      ) THEN
        ALTER TABLE acceptance_voucher_photos
          ADD CONSTRAINT chk_acceptance_photos_gps_source
          CHECK (
            gps_source IS NULL OR
            gps_source IN ('file_exif', 'client_reported')
          );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_acceptance_photos_geofence_basis'
      ) THEN
        ALTER TABLE acceptance_voucher_photos
          ADD CONSTRAINT chk_acceptance_photos_geofence_basis
          CHECK (
            geofence_basis IS NULL OR
            geofence_basis IN ('file_exif', 'client_reported')
          );
      END IF;
    END $$;

    -- Backfill dữ liệu cũ
    UPDATE acceptance_voucher_photos
    SET gps_source = 'file_exif'
    WHERE gps_latitude IS NOT NULL AND metadata_source = 'file' AND gps_source IS NULL;

    UPDATE acceptance_voucher_photos
    SET gps_source = 'client_reported'
    WHERE metadata_source = 'client' AND gps_source IS NULL;

    UPDATE acceptance_voucher_photos
    SET geofence_basis = gps_source
    WHERE geofence_status IN ('inside', 'outside') AND gps_source IS NOT NULL AND geofence_basis IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE acceptance_voucher_photos
      DROP CONSTRAINT IF EXISTS chk_acceptance_photos_geofence_basis,
      DROP CONSTRAINT IF EXISTS chk_acceptance_photos_gps_source,
      DROP COLUMN IF EXISTS geofence_basis,
      DROP COLUMN IF EXISTS gps_source;

    ALTER TABLE diary_entry_attachments
      DROP CONSTRAINT IF EXISTS chk_diary_attachments_geofence_basis,
      DROP CONSTRAINT IF EXISTS chk_diary_attachments_gps_source,
      DROP COLUMN IF EXISTS geofence_basis,
      DROP COLUMN IF EXISTS gps_source;
  `);
};
