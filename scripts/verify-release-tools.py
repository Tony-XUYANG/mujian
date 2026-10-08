"""Exercise release guards with synthetic files; never read live credentials."""
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile

repo = Path(__file__).resolve().parents[1]
names = (
    "mujian.jar", "install-ubuntu.sh", "update-ubuntu.sh", "mujian.service",
    "nginx.conf", "ops-common.sh", "backup-ubuntu.sh", "restore-drill-ubuntu.sh",
    "verify-backup.py", "mujian-backup.service", "mujian-backup.timer",
    "verify-release.py", "apply-release-ubuntu.sh", "nginx-https.conf", "SOURCE_COMMIT",
)
commit = "a" * 40
checks = 0
with tempfile.TemporaryDirectory(prefix="mujian-release-guards-") as temporary:
    root = Path(temporary)
    for name in names:
        (root / name).write_bytes(b"synthetic release")
    (root / "SOURCE_COMMIT").write_text(commit + "\n")

    def manifest(selected=names):
        (root / "SHA256SUMS").write_text("".join(
            hashlib.sha256((root / name).read_bytes()).hexdigest() + "  " + name + "\n"
            for name in selected
        ))

    def check(label, valid, expected=commit):
        global checks
        result = subprocess.run([sys.executable, str(repo / "deploy/verify-release.py"), str(root), expected], capture_output=True)
        assert (result.returncode == 0) == valid, label
        checks += 1
        print(f"PASS {checks}: {label}")

    manifest(); check("complete release and selected source accepted", True)
    check("wrong selected source rejected", False, "b" * 40)
    (root / "mujian.jar").write_bytes(b"tampered"); check("changed JAR rejected", False)
    manifest(names[:-1]); check("missing source entry rejected", False)
    manifest(); (root / "SHA256SUMS").write_text((root / "SHA256SUMS").read_text() * 2)
    check("duplicate entries rejected", False)
    manifest(); (root / "SHA256SUMS").write_text((root / "SHA256SUMS").read_text() + "a" * 64 + "  ../outside\n")
    check("manifest path traversal rejected", False)
    (root / "SOURCE_COMMIT").write_text("main\n"); manifest(); check("noncommit source rejected", False)
    (root / "SOURCE_COMMIT").write_text(commit + "\n"); manifest()
    (root / "mujian.jar").rename(root / "actual.jar")
    (root / "mujian.jar").symlink_to(root / "actual.jar")
    check("symlinked release file rejected", False)
print(f"{checks} release guard checks passed.")
