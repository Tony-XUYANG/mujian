"""Run the real updater against isolated files and simulated service failures."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
names = (
    "install-ubuntu.sh", "update-ubuntu.sh", "mujian.service", "nginx.conf",
    "ops-common.sh", "backup-ubuntu.sh", "restore-drill-ubuntu.sh", "verify-backup.py",
    "mujian-backup.service", "mujian-backup.timer", "verify-release.py",
    "apply-release-ubuntu.sh", "nginx-https.conf",
)
checks = 0
for scenario in ("success", "restart_failure", "database_failure", "already_installed"):
    with tempfile.TemporaryDirectory(prefix="mujian-update-fixture-") as temporary:
        root = Path(temporary)
        release = root / "release"
        release.mkdir()
        for name in names:
            (release / name).write_bytes((repo / "deploy" / name).read_bytes())
        (release / "mujian.jar").write_bytes(b"new synthetic application")
        (release / "SOURCE_COMMIT").write_text("a" * 40 + "\n")
        manifest_names = (*names, "mujian.jar", "SOURCE_COMMIT")
        (release / "SHA256SUMS").write_text("".join(
            hashlib.sha256((release / name).read_bytes()).hexdigest() + "  " + name + "\n"
            for name in manifest_names
        ))
        app = root / "opt/mujian"
        (app / "releases").mkdir(parents=True)
        previous = app / "releases/previous.jar"
        previous.write_bytes(b"old synthetic application")
        candidate = app / ("releases/" + hashlib.sha256((release / "mujian.jar").read_bytes()).hexdigest()[:16] + ".jar")
        current = app / "current.jar"
        if scenario == "already_installed":
            candidate.write_bytes((release / "mujian.jar").read_bytes())
        current.symlink_to(candidate if scenario == "already_installed" else previous)
        for directory in ("etc/mujian", "etc/systemd/system", "run/lock", "bin"):
            (root / directory).mkdir(parents=True)
        (root / "etc/mujian/app.env").write_text("fixture only\n")
        updater = (repo / "deploy/update-ubuntu.sh").read_text()
        for path in ("/opt/mujian", "/etc/mujian", "/etc/systemd/system", "/run/lock"):
            updater = updater.replace(path, str(root) + path)
        # The fixture has no privileged operations; production retains the root guard.
        updater = updater.replace("[[ $EUID -eq 0 ]]", "[[ true == true ]]")
        script = root / "updater.sh"
        script.write_text(updater)
        stubs = {
            "systemctl": '''#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TEST_ROOT/services.log"
if [[ "$TEST_SCENARIO" == restart_failure && "$1" == restart && "$(readlink -f "$TEST_ROOT/opt/mujian/current.jar")" == "$TEST_CANDIDATE" ]]; then exit 1; fi
''',
            "curl": '''#!/usr/bin/env bash
if [[ "$TEST_SCENARIO" == database_failure && "$(readlink -f "$TEST_ROOT/opt/mujian/current.jar")" == "$TEST_CANDIDATE" ]]; then
  printf '{"status":"UP","database":"disconnected"}'
else
  printf '{"status":"UP","database":"connected"}'
fi
''',
            "sleep": "#!/usr/bin/env bash\nexit 0\n",
        }
        for name, content in stubs.items():
            stub = root / "bin" / name
            stub.write_text(content)
            stub.chmod(0o755)
        environment = {**os.environ, "PATH": str(root / "bin") + ":" + os.environ["PATH"], "TEST_ROOT": str(root), "TEST_SCENARIO": scenario, "TEST_CANDIDATE": str(candidate)}
        result = subprocess.run(["bash", str(script), str(release)], env=environment, capture_output=True, text=True, timeout=30)
        successful = scenario in ("success", "already_installed")
        assert (result.returncode == 0) == successful, (scenario, result.stderr)
        assert current.resolve() == (candidate if successful else previous), scenario
        assert previous.read_bytes() == b"old synthetic application", scenario
        actions = (root / "services.log").read_text()
        if scenario == "success":
            assert (app / "previous.jar").resolve() == previous
        if successful:
            assert "enable --now mujian-backup.timer" in actions
        else:
            assert actions.count("restart mujian") == 2
            assert "enable --now mujian-backup.timer" not in actions
        if scenario == "already_installed":
            assert "restart mujian" not in actions
        checks += 1
        print(f"PASS {checks}: {scenario}, original artifact preserved")
print(f"{checks} isolated update lifecycle checks passed (service responses simulated).")
