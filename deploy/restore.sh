#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
    echo "Usage: restore.sh <empty_target_database>"
    exit 1
fi

TARGET_DB="$1"

case "$TARGET_DB" in
    ''|*[!a-zA-Z0-9_]*)
        echo "ERROR: Invalid database name: $TARGET_DB"
        exit 1
        ;;
esac

if [ "$TARGET_DB" = "${PGDATABASE:-}" ] ||
   [ "$TARGET_DB" = "${DB_NAME:-}" ] ||
   [ "$TARGET_DB" = "${POSTGRES_DB:-}" ]; then
    echo "ERROR: Refusing to restore into the running application database: $TARGET_DB"
    exit 1
fi

case "$TARGET_DB" in
    postgres|template0|template1)
        echo "ERROR: Refusing to restore into PostgreSQL system database: $TARGET_DB"
        exit 1
        ;;
esac

BACKUP_FILE=$(ls -t /backups/construction_*.dump 2>/dev/null | head -n 1 || true)

if [ -z "$BACKUP_FILE" ]; then
    echo "ERROR: No backup file found in /backups"
    exit 1
fi

echo "Selected backup: $BACKUP_FILE"
echo "Target database: $TARGET_DB"

DB_EXISTS=$(psql -X -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'")

if [ "$DB_EXISTS" != "1" ]; then
    echo "Creating empty database: $TARGET_DB"
    createdb "$TARGET_DB"
else
    echo "Database already exists: $TARGET_DB"

    TABLE_COUNT=$(psql -X -d "$TARGET_DB" -tAc \
        "SELECT count(*) FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         AND table_type = 'BASE TABLE'
         AND table_name <> 'pgmigrations'")

    if [ "${TABLE_COUNT:-0}" -gt 0 ]; then
        echo "ERROR: Target database is not empty: $TARGET_DB"
        echo "Found $TABLE_COUNT user table(s)."
        exit 1
    fi
fi

echo "Restoring backup..."

pg_restore \
    --exit-on-error \
    --dbname="$TARGET_DB" \
    "$BACKUP_FILE"

echo "Restore completed successfully."
echo
echo "Row counts:"

psql -X -v ON_ERROR_STOP=1 -d "$TARGET_DB" <<'SQL'
DO $$
DECLARE
    r record;
    c bigint;
BEGIN
    FOR r IN
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
    LOOP
        EXECUTE format(
            'SELECT count(*) FROM %I.%I',
            r.table_schema,
            r.table_name
        ) INTO c;

        RAISE NOTICE '%', format(
            '%s.%s: %s rows',
            r.table_schema,
            r.table_name,
            c
        );
    END LOOP;
END $$;
SQL

echo
echo "Restore verification completed."