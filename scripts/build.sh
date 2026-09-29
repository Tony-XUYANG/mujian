#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for tool in npm java mvn; do
  command -v "$tool" >/dev/null || { printf 'Missing dependency: %s\n' "$tool" >&2; exit 1; }
done

cd "$project_root/frontend"
npm ci --no-audit --no-fund
npm run build
mkdir -p "$project_root/backend/src/main/resources/static"
cp -a dist/. "$project_root/backend/src/main/resources/static/"
cd "$project_root/backend"
if [[ -n "${MAVEN_REPO_LOCAL:-}" ]]; then
  mvn -B -ntp -Dmaven.repo.local="$MAVEN_REPO_LOCAL" package
else
  mvn -B -ntp package
fi
printf 'Build complete. Run bash scripts/start.sh from the project root.\n'
