"use strict";

/**
 * Migration thêm cấu hình toạ độ tâm, bán kính công trường vào projects
 * và các cột trạng thái geofence cho diary_entry_attachments & acceptance_voucher_photos.
 *
 * Story S-41: T-107 & T-108
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Thêm cấu hình geofence cho bảng projects
  pgm.sql(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS site_latitude NUMERIC(9,6) NULL,
      ADD COLUMN IF NOT EXISTS site_longitude NUMERIC(9,6) NULL,
      ADD COLUMN IF NOT EXISTS site_radius_m INTEGER NULL,
      ADD COLUMN IF NOT EXISTS site_geofence_updated_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS site_geofence_updated_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_site_geofence'
      ) THEN
        ALTER TABLE projects
          ADD CONSTRAINT chk_projects_site_geofence
          CHECK (
            (site_latitude IS NULL AND site_longitude IS NULL AND site_radius_m IS NULL) OR
            (
              site_latitude IS NOT NULL AND
              site_longitude IS NOT NULL AND
              site_radius_m IS NOT NULL AND
              site_latitude BETWEEN -90 AND 90 AND
              site_longitude BETWEEN -180 AND 180 AND
              site_radius_m BETWEEN 1 AND 20000 AND
              NOT (site_latitude = 0 AND site_longitude = 0)
            )
          );
      END IF;
    END $$;
  `);

  // 2. Thêm cột geofence cho diary_entry_attachments
  pgm.sql(`
    ALTER TABLE diary_entry_attachments
      ADD COLUMN IF NOT EXISTS geofence_status VARCHAR(20) NULL,
      ADD COLUMN IF NOT EXISTS geofence_distance_m NUMERIC(10,1) NULL,
      ADD COLUMN IF NOT EXISTS geofence_checked_at TIMESTAMPTZ NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_diary_attachments_geofence'
      ) THEN
        ALTER TABLE diary_entry_attachments
          ADD CONSTRAINT chk_diary_attachments_geofence
          CHECK (
            geofence_status IS NULL OR
            geofence_status IN ('inside', 'outside', 'no_gps', 'no_site_config')
          );
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_diary_attachments_geofence_status
      ON diary_entry_attachments (geofence_status);
  `);

  // 3. Thêm cột geofence cho acceptance_voucher_photos
  pgm.sql(`
    ALTER TABLE acceptance_voucher_photos
      ADD COLUMN IF NOT EXISTS geofence_status VARCHAR(20) NULL,
      ADD COLUMN IF NOT EXISTS geofence_distance_m NUMERIC(10,1) NULL,
      ADD COLUMN IF NOT EXISTS geofence_checked_at TIMESTAMPTZ NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_acceptance_photos_geofence'
      ) THEN
        ALTER TABLE acceptance_voucher_photos
          ADD CONSTRAINT chk_acceptance_photos_geofence
          CHECK (
            geofence_status IS NULL OR
            geofence_status IN ('inside', 'outside', 'no_gps', 'no_site_config')
          );
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_acceptance_photos_geofence_status
      ON acceptance_voucher_photos (geofence_status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_acceptance_photos_geofence_status;
    ALTER TABLE acceptance_voucher_photos
      DROP CONSTRAINT IF EXISTS chk_acceptance_photos_geofence,
      DROP COLUMN IF EXISTS geofence_status,
      DROP COLUMN IF EXISTS geofence_distance_m,
      DROP COLUMN IF EXISTS geofence_checked_at;

    DROP INDEX IF EXISTS idx_diary_attachments_geofence_status;
    ALTER TABLE diary_entry_attachments
      DROP CONSTRAINT IF EXISTS chk_diary_attachments_geofence,
      DROP COLUMN IF EXISTS geofence_status,
      DROP COLUMN IF EXISTS geofence_distance_m,
      DROP COLUMN IF EXISTS geofence_checked_at;

    ALTER TABLE projects
      DROP CONSTRAINT IF EXISTS chk_projects_site_geofence,
      DROP COLUMN IF EXISTS site_latitude,
      DROP COLUMN IF EXISTS site_longitude,
      DROP COLUMN IF EXISTS site_radius_m,
      DROP COLUMN IF EXISTS site_geofence_updated_at,
      DROP COLUMN IF EXISTS site_geofence_updated_by;
  `);
};
