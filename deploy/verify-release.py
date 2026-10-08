"""Verify a release directory before running its deployment tools as root."""
import hashlib
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve(strict=True)
expected = {
    "mujian.jar", "install-ubuntu.sh", "update-ubuntu.sh", "mujian.service",
    "nginx.conf", "ops-common.sh", "backup-ubuntu.sh", "restore-drill-ubuntu.sh",
    "verify-backup.py", "mujian-backup.service", "mujian-backup.timer",
    "verify-release.py", "apply-release-ubuntu.sh", "nginx-https.conf", "SOURCE_COMMIT",
}
manifest = root / "SHA256SUMS"
if manifest.is_symlink() or not manifest.is_file():
    raise ValueError("Release manifest must be a regular file")
seen = set()
for line in manifest.read_text(encoding="ascii").splitlines():
    match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)", line)
    if not match:
        raise ValueError("Invalid release manifest line")
    digest, name = match.groups()
    if name not in expected or name in seen:
        raise ValueError("Unexpected or duplicate release file")
    target = root / name
    if target.is_symlink() or not target.is_file():
        raise ValueError("Release files must be regular files: " + name)
    with target.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
            raise ValueError("Release checksum failed: " + name)
    seen.add(name)
if seen != expected:
    raise ValueError("Release is incomplete")
commit = (root / "SOURCE_COMMIT").read_text(encoding="ascii").strip()
if not re.fullmatch(r"[0-9a-f]{40}", commit):
    raise ValueError("Invalid source commit")
if len(sys.argv) > 2 and commit != sys.argv[2]:
    raise ValueError("Source commit does not match the selected release")
print("Release files and source commit verified: " + commit)
