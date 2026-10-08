#!/usr/bin/env bash
# Briefly pause the application so database and uploaded files form one snapshot.
set -euo pipefail
ops_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$ops_dir/ops-common.sh"
backup_root="${1:-/var/backups/mujian}"
install -d -m 700 "$backup_root"
backup_root=$(realpath -- "$backup_root")
[[ "$backup_root" != "$ops_uploads" && "$backup_root" != "$ops_uploads/"* ]] || { echo 'Backup root cannot be inside uploads.' >&2; exit 1; }
exec 9>/run/lock/mujian-maintenance.lock
flock -n 9 || { echo 'Another backup or update is running.' >&2; exit 1; }
systemctl is-active --quiet "$ops_service" || { echo 'Application must be running before backup.' >&2; exit 1; }
"${ops_mysql[@]}" "$ops_database" -e 'SELECT 1' >/dev/null
staging=$(mktemp -d "$backup_root/.partial-XXXXXXXX")
restart_needed=false
finish() {
  local result=$?
  trap - EXIT
  if [[ "$restart_needed" == true ]]; then
    if ! systemctl start "$ops_service" || ! ops_wait_ready; then
      echo 'Application did not recover after backup; inspect systemctl/journalctl.' >&2
      result=1
    fi
  fi
  if [[ $result -ne 0 ]]; then echo "Backup incomplete: $staging (not a completed snapshot)." >&2; fi
  exit "$result"
}
trap finish EXIT
restart_needed=true
systemctl stop "$ops_service"
mysqldump --protocol=socket --single-transaction --quick --no-tablespaces --routines --triggers --set-gtid-purged=OFF "$ops_database" | gzip > "$staging/database.sql.gz"
gzip -t "$staging/database.sql.gz"
ops_fingerprint "$ops_database" > "$staging/table-fingerprints.tsv"
[[ -s "$staging/table-fingerprints.tsv" ]] || { echo 'No application tables found.' >&2; exit 1; }
(cd "$ops_uploads" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) > "$staging/upload-files.sha256"
tar -C "$ops_uploads" -czf "$staging/uploads.tar.gz" .
tar -tzf "$staging/uploads.tar.gz" >/dev/null
install -m 600 "$ops_jar" "$staging/application.jar"
printf 'format=1\ndatabase=%s\ncreated_utc=%s\n' "$ops_database" "$(date -u +%FT%TZ)" > "$staging/snapshot.txt"
(cd "$staging" && sha256sum database.sql.gz table-fingerprints.tsv upload-files.sha256 uploads.tar.gz application.jar snapshot.txt > SHA256SUMS)
systemctl start "$ops_service"
ops_wait_ready
restart_needed=false
completed="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-${staging##*.partial-}"
mv -- "$staging" "$completed"
printf 'Backup complete and application healthy: %s\n' "$completed"
