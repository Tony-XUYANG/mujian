#!/usr/bin/env bash
# Read-only status output: do not read app.env or print account credentials.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
expected_jar="${1:-}"
public_host="${2:?Usage: sudo bash check-server-ubuntu.sh CANDIDATE_JAR PUBLIC_HOST}"
[[ "$public_host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo 'Invalid public host.' >&2; exit 1; }
current=$(readlink -f /opt/mujian/current.jar)
[[ "$current" == /opt/mujian/releases/*.jar && -f "$current" ]] || { echo 'Installed JAR missing or unexpected.' >&2; exit 1; }
if [[ -n "$expected_jar" ]]; then
  [[ -f "$expected_jar" ]] || { echo 'Candidate JAR missing.' >&2; exit 1; }
  cmp -- "$current" "$expected_jar"
  echo 'PASS: installed JAR matches selected release byte-for-byte'
fi
sha256sum "$current"
for service in mujian mysql nginx; do
  systemctl is-active --quiet "$service"
  printf 'PASS: %s active\n' "$service"
  systemctl is-enabled "$service"
done
nginx -t
curl --max-time 10 --fail --silent -H "Host: $public_host" http://127.0.0.1/api/health |
  python3 -c 'import json,sys; d=json.load(sys.stdin); print("Health: " + json.dumps(d)); sys.exit(0 if d.get("status")=="UP" and d.get("database")=="connected" else 1)'
systemctl is-active --quiet mujian-backup.timer
systemctl is-enabled mujian-backup.timer
systemctl list-timers mujian-backup.timer --no-pager
printf 'PASS: service, database, Nginx and backup timer checks completed\n'
echo 'Timer status does not prove backup execution or successful restore. No application data was changed.'
