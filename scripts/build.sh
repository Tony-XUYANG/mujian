#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for tool in npm java mvn; do
  command -v "$tool" >/dev/null || { printf 'Missing dependency: %s\n' "$tool" >&2; exit 1; }
done

frontend_root="$project_root/frontend"
backend_root="$project_root/backend"
# Windows drive mounts can reject npm chmod/bin-link operations in WSL.
# Keep dependencies on the Linux filesystem and copy only the build output back.
if [[ -n "${WSL_DISTRO_NAME:-}" && "$project_root" == /mnt/* ]]; then
  build_workspace="$(mktemp -d /tmp/mujian-build.XXXXXXXX)"
  trap 'rm -rf -- "$build_workspace"' EXIT
  mkdir -p "$build_workspace/frontend" "$build_workspace/backend"
  tar -C "$frontend_root" --exclude=node_modules --exclude=dist --exclude='*.tsbuildinfo' -cf - . | tar -C "$build_workspace/frontend" -xf -
  tar -C "$backend_root" --exclude=target --exclude=uploads --exclude=src/main/resources/static -cf - . | tar -C "$build_workspace/backend" -xf -
  frontend_root="$build_workspace/frontend"
  backend_root="$build_workspace/backend"
fi

cd "$frontend_root"
npm ci --no-audit --no-fund
npm run build
if [[ "$frontend_root" != "$project_root/frontend" ]]; then
  mkdir -p "$project_root/frontend/dist"
  cp -R dist/. "$project_root/frontend/dist/"
fi
mkdir -p "$backend_root/src/main/resources/static"
cp -R dist/. "$backend_root/src/main/resources/static/"
cd "$backend_root"
if [[ -n "${MAVEN_REPO_LOCAL:-}" ]]; then
  mvn -B -ntp -Dmaven.repo.local="$MAVEN_REPO_LOCAL" package
else
  mvn -B -ntp package
fi
if [[ "$backend_root" != "$project_root/backend" ]]; then
  mkdir -p "$project_root/backend/target"
  cp target/mujian-1.0.0.jar "$project_root/backend/target/mujian-1.0.0.jar"
fi
printf 'Build complete. Run bash scripts/start.sh from the project root.\n'
