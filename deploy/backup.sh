#!/bin/sh

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="/backups/construction_${TIMESTAMP}.dump"
START_TIME=$(date +"%Y-%m-%d %H:%M:%S")
START_SEC=$(date +%s)

echo "[${START_TIME}] Backup started"

# Perform backup
if pg_dump -F c -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$BACKUP_FILE" 2>/tmp/pg_dump_error.log; then
    END_TIME=$(date +"%Y-%m-%d %H:%M:%S")
    END_SEC=$(date +%s)
    RUNTIME=$((END_SEC - START_SEC))
    SIZE=$(stat -c%s "$BACKUP_FILE")
    
    echo "[${END_TIME}] Backup completed: SUCCESS"
    echo "Runtime: ${RUNTIME} seconds"
    echo "File path: $BACKUP_FILE"
    echo "File size: $SIZE bytes"
else
    END_TIME=$(date +"%Y-%m-%d %H:%M:%S")
    END_SEC=$(date +%s)
    RUNTIME=$((END_SEC - START_SEC))
    
    echo "[${END_TIME}] Backup completed: FAILURE"
    echo "Runtime: ${RUNTIME} seconds"
    echo "Reason: pg_dump failed"
    cat /tmp/pg_dump_error.log
    
    # Remove incomplete backup file
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "Running retention policy: keeping newest 7 backups"
cd /backups || exit 1
# List files sorted by time (newest first), skip the first 7, and delete the rest
ls -t construction_*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "Retention policy completed"
