#!/usr/bin/env bash
# Update an existing installation. Review schema changes/backups before using.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
release_dir="$(realpath -- "${1:?Usage: sudo bash update-ubuntu.sh RELEASE_DIRECTORY}")"
[[ -f /etc/mujian/app.env && -L /opt/mujian/current.jar ]] || { echo 'Existing installation required.' >&2; exit 1; }
cd "$release_dir"
sha256sum -c SHA256SUMS
[[ -f mujian.jar ]] || { echo 'Release JAR is missing.' >&2; exit 1; }
previous="$(readlink -f /opt/mujian/current.jar)"
[[ "$previous" == /opt/mujian/releases/*.jar && -f "$previous" ]] || { echo 'Unexpected installed JAR path.' >&2; exit 1; }
artifact="$(sha256sum mujian.jar | cut -c1-16).jar"
candidate="/opt/mujian/releases/$artifact"
[[ "$candidate" != "$previous" ]] || { echo 'This release is already installed.'; exit 0; }
install -m 644 mujian.jar "$candidate"
switch_to() {
  ln -sfn "$1" /opt/mujian/.next.jar
  mv -Tf /opt/mujian/.next.jar /opt/mujian/current.jar
}
wait_ready() {
  for attempt in $(seq 1 45); do
    if curl --max-time 3 --fail --silent http://127.0.0.1:8080/api/health | grep -q '"status":"UP"'; then return 0; fi
    sleep 2
  done
  return 1
}
switch_to "$candidate"
if systemctl restart mujian && wait_ready; then
  ln -sfn "$previous" /opt/mujian/previous.jar
  echo 'Application updated. Previous JAR retained for rollback.'
  curl --max-time 5 --fail --silent http://127.0.0.1:8080/api/health
  printf '\n'
else
  echo 'Health check failed; restoring the previous application JAR.' >&2
  switch_to "$previous"
  systemctl restart mujian
  if ! wait_ready; then echo 'Previous release also failed health check. Inspect the service logs.' >&2; fi
  exit 1
fi
