#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
jar="$project_root/backend/target/mujian-1.0.0.jar"
[[ -f "$jar" ]] || { echo 'Build the application first.' >&2; exit 1; }
scratch="$(mktemp -d /tmp/mujian-package.XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/mujian-release" "$project_root/.runtime/deploy"
cp "$jar" "$scratch/mujian-release/mujian.jar"
cp "$project_root"/deploy/{install-ubuntu.sh,update-ubuntu.sh,mujian.service,nginx.conf} "$scratch/mujian-release/"
cp "$project_root"/deploy/{ops-common.sh,backup-ubuntu.sh,restore-drill-ubuntu.sh,verify-backup.py,mujian-backup.service,mujian-backup.timer} "$scratch/mujian-release/"
git -C "$project_root" rev-parse HEAD > "$scratch/mujian-release/SOURCE_COMMIT"
(cd "$scratch/mujian-release" && sha256sum mujian.jar install-ubuntu.sh update-ubuntu.sh mujian.service nginx.conf ops-common.sh backup-ubuntu.sh restore-drill-ubuntu.sh verify-backup.py mujian-backup.service mujian-backup.timer > SHA256SUMS)
tar -C "$scratch" -czf "$project_root/.runtime/deploy/mujian-release.tar.gz" mujian-release
printf 'Release archive: %s\n' "$project_root/.runtime/deploy/mujian-release.tar.gz"
sha256sum "$project_root/.runtime/deploy/mujian-release.tar.gz"
