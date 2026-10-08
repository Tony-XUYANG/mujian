"""Exercise backup/apply ordering and the Nginx Host header in an isolated fixture."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
names = (
    "mujian.jar", "install-ubuntu.sh", "update-ubuntu.sh", "mujian.service", "nginx.conf",
    "ops-common.sh", "backup-ubuntu.sh", "restore-drill-ubuntu.sh", "verify-backup.py",
    "mujian-backup.service", "mujian-backup.timer", "verify-release.py",
    "apply-release-ubuntu.sh", "nginx-https.conf", "SOURCE_COMMIT",
)
for index, scenario in enumerate(("success", "wrong_commit", "backup_failure", "invalid_host"), 1):
    with tempfile.TemporaryDirectory(prefix="mujian-apply-fixture-") as temporary:
        root = Path(temporary)
        release = root / "release"
        release.mkdir()
        for name in names:
            (release / name).write_text("synthetic release\n")
        (release / "verify-release.py").write_bytes((repo / "deploy/verify-release.py").read_bytes())
        (release / "SOURCE_COMMIT").write_text("a" * 40 + "\n")
        (release / "backup-ubuntu.sh").write_text('echo backup >> "$TEST_ROOT/actions"\n[[ "$TEST_SCENARIO" != backup_failure ]]\n')
        (release / "update-ubuntu.sh").write_text('echo update >> "$TEST_ROOT/actions"\n')
        (release / "SHA256SUMS").write_text("".join(
            hashlib.sha256((release / name).read_bytes()).hexdigest() + "  " + name + "\n"
            for name in names
        ))
        (root / "etc/mujian").mkdir(parents=True)
        (root / "etc/mujian/app.env").touch()
        (root / "opt/mujian").mkdir(parents=True)
        (root / "opt/mujian/current.jar").symlink_to(release / "mujian.jar")
        code = (repo / "deploy/apply-release-ubuntu.sh").read_text().replace("[[ $EUID -eq 0 ]]", "[[ true == true ]]")
        for path in ("/etc/mujian", "/opt/mujian", "/var/backups/mujian"):
            code = code.replace(path, str(root) + path)
        script = root / "apply.sh"
        script.write_text(code)
        (root / "bin").mkdir()
        curl = root / "bin/curl"
        curl.write_text('''#!/usr/bin/env bash
[[ "$*" == *"Host: 106.54.37.247"* ]] || exit 22
echo health >> "$TEST_ROOT/actions"
printf '{"status":"UP","database":"connected"}'
''')
        curl.chmod(0o755)
        environment = {**os.environ, "PATH": str(root / "bin") + ":" + os.environ["PATH"], "TEST_ROOT": str(root), "TEST_SCENARIO": scenario}
        expected = "b" * 40 if scenario == "wrong_commit" else "a" * 40
        host = "106.54.37.247\nInjected" if scenario == "invalid_host" else "106.54.37.247"
        result = subprocess.run(["bash", str(script), str(release), expected, host], env=environment, capture_output=True, timeout=15)
        assert (result.returncode == 0) == (scenario == "success"), scenario
        actions = (root / "actions").read_text().splitlines() if (root / "actions").exists() else []
        assert actions == ({"success": ["backup", "update", "health"], "backup_failure": ["backup"]}.get(scenario, [])), (scenario, actions)
        print(f"PASS {index}: {scenario}, backup/apply ordering and Host header preserved")
print("4 isolated apply checks passed; no live installation was changed.")
