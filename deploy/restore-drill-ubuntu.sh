#!/usr/bin/env bash
# Always restore into a new database and directory; never replace the live site.
set -euo pipefail
ops_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$ops_dir/ops-common.sh"
snapshot=$(realpath -- "${1:?Usage: sudo bash restore-drill-ubuntu.sh SNAPSHOT_DIRECTORY}")
[[ -d "$snapshot" && -f "$snapshot/SHA256SUMS" && "$snapshot" != */.partial-* ]] || { echo 'Completed snapshot required.' >&2; exit 1; }
exec 9>/run/lock/mujian-maintenance.lock
flock -n 9 || { echo 'Another maintenance operation is running.' >&2; exit 1; }
# Validate the manifest and tar members before any database creation or extraction.
python3 "$ops_dir/verify-backup.py" "$snapshot"
gzip -t "$snapshot/database.sql.gz"
restore_root="${2:-/var/lib/mujian-restore}"
install -d -m 700 "$restore_root"
restore_root=$(realpath -- "$restore_root")
[[ "$restore_root" != "$ops_uploads" && "$restore_root" != "$ops_uploads/"* ]] || { echo 'Restore directory cannot be inside live uploads.' >&2; exit 1; }
restore_dir=$(mktemp -d "$restore_root/drill-XXXXXXXX")
restore_db="mujian_restore_$(date -u +%Y%m%d%H%M%S)_$(openssl rand -hex 4)"
printf 'database=%s\n' "$restore_db" > "$restore_dir/RESTORE_TARGET"
trap 'echo "Restore drill failed; isolated target retained at $restore_dir ($restore_db)." >&2' ERR
"${ops_mysql[@]}" -e "CREATE DATABASE \`$restore_db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
gzip -dc "$snapshot/database.sql.gz" | "${ops_mysql[@]}" "$restore_db"
ops_fingerprint "$restore_db" > "$restore_dir/table-fingerprints.tsv"
cmp "$snapshot/table-fingerprints.tsv" "$restore_dir/table-fingerprints.tsv"
install -d -m 700 "$restore_dir/uploads"
tar -xzf "$snapshot/uploads.tar.gz" -C "$restore_dir/uploads" --no-same-owner --no-same-permissions
(cd "$restore_dir/uploads" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) > "$restore_dir/upload-files.sha256"
cmp "$snapshot/upload-files.sha256" "$restore_dir/upload-files.sha256"
install -m 600 "$snapshot/application.jar" "$restore_dir/application.jar"
printf 'PASS: every table row count and content checksum match\nPASS: uploaded files match byte-for-byte\nRestored database: %s\nRestored directory: %s\n' "$restore_db" "$restore_dir" | tee "$restore_dir/RESULT.txt"
echo 'Isolated restore retained for application smoke checks. Live database and uploads were not replaced.'
