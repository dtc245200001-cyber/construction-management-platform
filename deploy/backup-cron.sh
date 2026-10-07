#!/bin/sh
set -e

# Setup environment for cron
echo "PGHOST='$PGHOST'" > /etc/environment
echo "PGPORT='$PGPORT'" >> /etc/environment
echo "PGUSER='$PGUSER'" >> /etc/environment
echo "PGPASSWORD='$PGPASSWORD'" >> /etc/environment
echo "PGDATABASE='$PGDATABASE'" >> /etc/environment

# Setup cron schedule
SCHEDULE=${CRON_SCHEDULE:-"0 2 * * *"}
echo "$SCHEDULE . /etc/environment && sh /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

echo "Starting cron with schedule: $SCHEDULE"
exec crond -f -d 8
