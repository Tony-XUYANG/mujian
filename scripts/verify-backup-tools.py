"""Exercise tampering and extraction guards without reading application data."""
import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

validator = Path(__file__).resolve().parents[1] / "deploy" / "verify-backup.py"
files = ("database.sql.gz", "table-fingerprints.tsv", "upload-files.sha256", "uploads.tar.gz", "application.jar", "snapshot.txt")
checks = 0
with tempfile.TemporaryDirectory(prefix="mujian-backup-guards-") as tmp:
    root = Path(tmp)
    for name in files:
        (root / name).write_bytes(b"synthetic fixture")

    def archive(name="./image.jpg", kind=tarfile.REGTYPE):
        with tarfile.open(root / "uploads.tar.gz", "w:gz") as tar:
            member = tarfile.TarInfo(name)
            member.type = kind
            if kind == tarfile.REGTYPE:
                member.size = 3
                tar.addfile(member, io.BytesIO(b"jpg"))
            else:
                member.linkname = "/etc/passwd"
                tar.addfile(member)

    def manifest(names=files):
        (root / "SHA256SUMS").write_text("".join(hashlib.sha256((root / name).read_bytes()).hexdigest() + "  " + name + "\n" for name in names))

    def check(label, valid):
        global checks
        result = subprocess.run([sys.executable, str(validator), str(root)], capture_output=True)
        assert (result.returncode == 0) == valid, label
        checks += 1
        print(f"PASS {checks}: {label}")

    archive(); manifest(); check("complete valid snapshot accepted", True)
    (root / "application.jar").write_bytes(b"changed"); check("changed application rejected", False)
    manifest(files[:-1]); check("incomplete manifest rejected", False)
    manifest(); (root / "SHA256SUMS").write_text((root / "SHA256SUMS").read_text() * 2); check("duplicate manifest rejected", False)
    archive("../../outside.jpg"); manifest(); check("path traversal rejected", False)
    archive("/absolute.jpg"); manifest(); check("absolute archive path rejected", False)
    archive("./link", tarfile.SYMTYPE); manifest(); check("symlink archive rejected", False)
    archive("./link", tarfile.LNKTYPE); manifest(); check("hardlink archive rejected", False)
print(f"{checks} backup guard checks passed.")
