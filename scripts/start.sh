#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
jar="$project_root/backend/target/mujian-1.0.0.jar"
command -v java >/dev/null || { printf 'Java 21 is required.\n' >&2; exit 1; }
[[ -f "$jar" ]] || { printf 'Run bash scripts/build.sh before starting.\n' >&2; exit 1; }

cd "$project_root/backend"
exec java -jar "$jar"
