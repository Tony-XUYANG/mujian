"""Start a loopback-only restored app, smoke-check it, then remove temporary access."""
import grp
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import time
from urllib.request import Request, urlopen

if os.geteuid() != 0:
    raise SystemExit("Run with sudo.")
target = Path(sys.argv[1]).resolve(strict=True)
if target.parent != Path("/var/lib/mujian-restore") or not re.fullmatch(r"drill-[A-Za-z0-9]+", target.name):
    raise SystemExit("Only an isolated restore-drill directory is accepted.")
database = (target / "RESTORE_TARGET").read_text().strip().removeprefix("database=")
if not re.fullmatch(r"mujian_restore_[a-z0-9_]+", database):
    raise SystemExit("Invalid isolated database.")
jar = target / "application.jar"
uploads = target / "uploads"
if jar.is_symlink() or not jar.is_file() or uploads.is_symlink() or not uploads.is_dir():
    raise SystemExit("Restored JAR and uploads must exist.")
config = {}
for line in Path("/etc/mujian/app.env").read_text().splitlines():
    if line and not line.startswith("#"):
        key, value = line.split("=", 1)
        config[key] = value
username = config["DB_USER"]
if not re.fullmatch(r"[a-zA-Z0-9_]+", username):
    raise SystemExit("Unsupported database user.")
mysql = ["mysql", "--protocol=socket", "--batch", "--skip-column-names"]
def sql(statement):
    return subprocess.run(mysql, input=statement, text=True, capture_output=True, check=True).stdout

if sql(f"SELECT COUNT(*) FROM mysql.db WHERE Db='{database}' AND User='{username}' AND Host='127.0.0.1'").strip() != "0":
    raise SystemExit("Existing restore privileges found; refusing to revoke prior access.")
port = 9082
with socket.socket() as probe:
    probe.bind(("127.0.0.1", port))
unit = Path("/run/systemd/system/mujian-restore-smoke.service")
env = Path("/run/mujian-restore-smoke.env")
if unit.exists() or env.exists():
    raise SystemExit("A restore smoke fixture already exists.")
group = grp.getgrnam("mujian").gr_gid
for item in [target.parent, target, jar, uploads, *uploads.rglob("*")]:
    if item.is_symlink():
        raise SystemExit("Unexpected link in restored files.")
    os.chown(item, -1, group)
    os.chmod(item, 0o750 if item.is_dir() else 0o640)
private = {
    "PORT": str(port), "BIND_ADDRESS": "127.0.0.1",
    "DB_URL": f"jdbc:mysql://127.0.0.1:3306/{database}?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai",
    "DB_USER": username, "DB_PASSWORD": config["DB_PASSWORD"],
    "UPLOAD_DIR": str(uploads), "JWT_SECRET": secrets.token_hex(48), "SEED_DEMO": "false",
}
if any("\n" in value or "\r" in value for value in private.values()):
    raise SystemExit("Invalid environment value.")
os.umask(0o077)
def write_fixture():
    env.write_text("".join(key + "=" + value + "\n" for key, value in private.items()))
    unit.write_text(f"""[Unit]
Description=Isolated Mujian restore acceptance (loopback only)
After=mysql.service
[Service]
User=mujian
Group=mujian
WorkingDirectory={target}
EnvironmentFile={env}
ExecStart=/usr/bin/java -Xms64m -Xmx384m -XX:MaxMetaspaceSize=192m -jar {jar}
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths={uploads}
MemoryMax=800M
TimeoutStopSec=40
SuccessExitStatus=143
""")
def service(*args):
    subprocess.run(["systemctl", *args], check=True, capture_output=True)

def service_best_effort(*args):
    subprocess.run(["systemctl", *args], check=False, capture_output=True)

granted = False
checks = []
def read(path, headers=None):
    with urlopen(Request(f"http://127.0.0.1:{port}" + path, headers=headers or {}), timeout=8) as response:
        return response.status, response.headers, response.read()
def api(path):
    return json.loads(read("/api" + path)[2])
def check(label, passed):
    if not passed:
        raise ValueError(label)
    checks.append(label)
    print(f"PASS {len(checks)}: {label}", flush=True)

try:
    write_fixture()
    # If the client fails after MySQL applies the grant, still attempt revoke.
    granted = True
    sql(f"GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,INDEX,REFERENCES,ALTER ON `{database}`.* TO '{username}'@'127.0.0.1'")
    service("daemon-reload")
    service("start", unit.name)
    for _ in range(60):
        try:
            health = api("/health")
            if health.get("status") == "UP" and health.get("database") == "connected":
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise ValueError("Restored application did not become healthy.")
    check("restored database connected", health.get("database") == "connected")
    check("restored homepage served", "幕间" in read("/")[2].decode())
    manifest = json.loads(read("/asset-manifest.json")[2])
    for entry in manifest.values():
        for asset in [entry["file"], *entry.get("css", [])]:
            check("restored build asset " + asset, read("/" + asset)[0] == 200)
    dramas = api("/dramas")
    check("restored drama catalog", len(dramas) > 0)
    drama = api("/dramas/" + str(dramas[0]["id"]))
    check("restored episodes", len(api("/dramas/" + str(drama["id"]) + "/episodes")) > 0)
    check("restored cover", read(drama["coverImg"])[1].get_content_type().startswith("image/"))
    status, headers, content = read(drama["videoUrl"], {"Range": "bytes=0-1023"})
    check("restored video Range", status == 206 and len(content) == 1024)
    products = api("/mall/products")
    check("restored mall catalog", len(products) > 0)
    product = api("/mall/products/" + str(products[0]["id"]))
    check("restored product detail", product["id"] == products[0]["id"])
    check("restored shop", bool(api("/mall/shops/" + str(product["shopId"]))))
    check("restored PWA manifest", json.loads(read("/manifest.webmanifest")[2])["display"] == "standalone")
    result = {"database": database, "checks": checks, "scope": "restored loopback app, read-only HTTP checks, no login transaction or device install"}
    (target / "APPLICATION_RESULT.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
finally:
    # Cleanup must continue even when startup or the stop request fails. The
    # temporary grant and environment file are more sensitive than the smoke
    # test result, so each removal is attempted independently.
    cleanup_errors = []
    try:
        service("stop", unit.name)
    except Exception:
        cleanup_errors.append("temporary service stop failed")
    if granted:
        try:
            sql(f"REVOKE SELECT,INSERT,UPDATE,DELETE,CREATE,INDEX,REFERENCES,ALTER ON `{database}`.* FROM '{username}'@'127.0.0.1'")
        except Exception:
            cleanup_errors.append("restore grant cleanup failed")
    for fixture in [env, unit]:
        try:
            fixture.unlink(missing_ok=True)
        except OSError:
            cleanup_errors.append("temporary fixture removal failed: " + fixture.name)
    service_best_effort("daemon-reload")
    if cleanup_errors:
        raise RuntimeError("; ".join(cleanup_errors))
print(f"{len(checks)} restored application checks passed; temporary service stopped, credentials removed, restore grant revoked.")
