#!/usr/bin/env bash
# Apply a downloaded, externally checksum-verified package to an existing site.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
release_dir="$(realpath -- "${1:?Usage: sudo bash apply-release-ubuntu.sh RELEASE_DIRECTORY EXPECTED_COMMIT PUBLIC_HOST}")"
expected_commit="${2:?Expected 40-character source commit required.}"
public_host="${3:?Public IP or domain required for the Nginx virtual host health check.}"
[[ "$expected_commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid expected source commit.' >&2; exit 1; }
[[ "$public_host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo 'Invalid public host.' >&2; exit 1; }
[[ -f /etc/mujian/app.env && -L /opt/mujian/current.jar ]] || { echo 'Existing installation required; use install-ubuntu.sh for a new server.' >&2; exit 1; }
python3 "$release_dir/verify-release.py" "$release_dir" "$expected_commit"
# Use the new snapshot tools even when upgrading an older installation.
bash "$release_dir/backup-ubuntu.sh" /var/backups/mujian
bash "$release_dir/update-ubuntu.sh" "$release_dir"
curl --max-time 10 --fail --silent -H "Host: $public_host" http://127.0.0.1/api/health |
  python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("status")=="UP" and d.get("database")=="connected" else 1)'
printf 'Candidate applied and Nginx health verified: %s\n' "$expected_commit"
echo 'Next: public resource checks, isolated restore drill, then login and transaction acceptance.'
