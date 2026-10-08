#!/usr/bin/env bash
# Shared helpers for the Ubuntu installation and isolated acceptance fixture.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
umask 077
ops_database="${MUJIAN_DATABASE:-mujian}"
ops_service="${MUJIAN_SERVICE:-mujian}"
ops_uploads="$(realpath -- "${MUJIAN_UPLOAD_DIR:-/var/lib/mujian/uploads}")"
ops_jar="$(realpath -- "${MUJIAN_JAR:-/opt/mujian/current.jar}")"
ops_health="${MUJIAN_HEALTH_URL:-http://127.0.0.1:8080/api/health}"
[[ "$ops_database" =~ ^mujian(_[a-z0-9_]+)?$ ]] || { echo 'Invalid database name.' >&2; exit 1; }
[[ "$ops_service" =~ ^mujian(-[a-z0-9-]+)?$ ]] || { echo 'Invalid service name.' >&2; exit 1; }
[[ -d "$ops_uploads" && -f "$ops_jar" ]] || { echo 'Application or uploads missing.' >&2; exit 1; }
for tool in mysql mysqldump gzip tar sha256sum flock python3 openssl curl systemctl; do
  command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }
done
ops_mysql=(mysql --protocol=socket --batch --skip-column-names)

ops_fingerprint() {
  local database="$1" table count checksum tables
  tables=$("${ops_mysql[@]}" -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$database' AND table_type='BASE TABLE' ORDER BY table_name")
  [[ -n "$tables" ]] || { echo 'No application tables found.' >&2; return 1; }
  while IFS= read -r table; do
    [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || { echo 'Unexpected table identifier.' >&2; return 1; }
    count=$("${ops_mysql[@]}" "$database" -e "SELECT COUNT(*) FROM \`$table\`")
    checksum=$("${ops_mysql[@]}" "$database" -e "CHECKSUM TABLE \`$table\` EXTENDED" | cut -f2)
    [[ "$checksum" =~ ^[0-9]+$ ]] || { echo "Checksum unavailable: $table" >&2; return 1; }
    printf '%s\t%s\t%s\n' "$table" "$count" "$checksum"
  done <<< "$tables"
}

ops_wait_ready() {
  local attempt
  for attempt in $(seq 1 45); do
    if curl --max-time 3 --fail --silent "$ops_health" | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("status")=="UP" and d.get("database")=="connected" else 1)' 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
