#!/bin/sh
set -eu

# Refuse demo fallback credentials in a publicly reachable container.
: "${DB_URL:?Configure DB_URL for the private MySQL service}"
: "${DB_USER:?Configure a dedicated database user}"
: "${DB_PASSWORD:?Configure the database password through a secret}"
: "${JWT_SECRET:?Configure a random JWT secret through a secret}"
[ "${#JWT_SECRET}" -ge 32 ] || { echo 'JWT_SECRET must have at least 32 characters.' >&2; exit 1; }
if [ "${SEED_DEMO:-false}" = true ]; then
    : "${ADMIN_PASSWORD:?Demo seeding requires a unique admin password}"
    : "${DEMO_PASSWORD:?Demo seeding requires a unique demo password}"
fi
mkdir -p "$UPLOAD_DIR"
[ -w "$UPLOAD_DIR" ] || { echo 'The uploads volume must be writable by UID/GID 10001.' >&2; exit 1; }
exec java -Xms128m -Xmx768m -XX:MaxMetaspaceSize=256m -XX:MaxDirectMemorySize=128m -jar /app/mujian.jar
