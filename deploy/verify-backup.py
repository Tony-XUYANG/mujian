"""Validate our snapshot manifest and archive paths before a root restore drill."""
import hashlib
import pathlib
import sys
import tarfile

root = pathlib.Path(sys.argv[1]).resolve(strict=True)
expected = {"database.sql.gz", "table-fingerprints.tsv", "upload-files.sha256", "uploads.tar.gz", "application.jar", "snapshot.txt"}
lines = (root / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
seen = set()
for line in lines:
    digest, name = line.split("  ", 1)
    if name not in expected or name in seen or len(digest) != 64:
        raise ValueError("Invalid snapshot manifest")
    target = root / name
    if target.is_symlink() or not target.is_file():
        raise ValueError("Snapshot requires regular files")
    with target.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != digest:
        raise ValueError("Snapshot checksum failed: " + name)
    seen.add(name)
if seen != expected:
    raise ValueError("Snapshot is incomplete")
with tarfile.open(root / "uploads.tar.gz", "r:gz") as archive:
    for member in archive:
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir()):
            raise ValueError("Unsafe upload archive member")
print("Snapshot hashes and archive paths verified.")
