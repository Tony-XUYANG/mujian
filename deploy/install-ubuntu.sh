#!/usr/bin/env bash
# Run on a fresh Ubuntu 24.04 test server after unpacking the release archive.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'Ubuntu 24.04 is required.' >&2; exit 1; }
release_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
public_host="${1:?Usage: sudo bash install-ubuntu.sh PUBLIC_IP_OR_DOMAIN}"
[[ "$public_host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo 'Invalid host.' >&2; exit 1; }
cd "$release_dir"
sha256sum -c SHA256SUMS
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y openjdk-21-jre-headless mysql-server nginx curl openssl
install -d -m 700 /etc/mujian
if ! id mujian >/dev/null 2>&1; then useradd --system --home /var/lib/mujian --shell /usr/sbin/nologin mujian; fi
install -d -o mujian -g mujian -m 750 /var/lib/mujian/uploads
install -d -m 755 /opt/mujian/releases

# Do not import the developer's local database or publish its accounts.
if [[ ! -e /etc/mujian/app.env ]]; then
  db_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 48)"
  admin_password="$(openssl rand -hex 16)"
  demo_password="$(openssl rand -hex 16)"
  umask 077
  cat > /etc/mujian/app.env <<EOF
PORT=8080
BIND_ADDRESS=127.0.0.1
DB_URL=jdbc:mysql://127.0.0.1:3306/mujian?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai
DB_USER=mujian
DB_PASSWORD=$db_password
JWT_SECRET=$jwt_secret
UPLOAD_DIR=/var/lib/mujian/uploads
SEED_DEMO=true
ADMIN_PASSWORD=$admin_password
DEMO_PASSWORD=$demo_password
EOF
  # This is a server-only file. Its contents must not be committed or logged.
  printf 'admin=%s\ndemo=%s\n' "$admin_password" "$demo_password" > /etc/mujian/first-login.txt
fi
chmod 600 /etc/mujian/app.env /etc/mujian/first-login.txt
db_password="$(sed -n 's/^DB_PASSWORD=//p' /etc/mujian/app.env)"
[[ "$db_password" =~ ^[a-f0-9]{48}$ ]] || { echo 'Unexpected database secret format.' >&2; exit 1; }
cat > /etc/mysql/mysql.conf.d/mujian.cnf <<'EOF'
[mysqld]
bind-address=127.0.0.1
mysqlx-bind-address=127.0.0.1
innodb_buffer_pool_size=512M
max_connections=60
EOF
systemctl enable mysql
systemctl restart mysql
mysql --protocol=socket <<SQL
CREATE DATABASE IF NOT EXISTS mujian CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'mujian'@'127.0.0.1' IDENTIFIED BY '$db_password';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,INDEX,REFERENCES,ALTER ON mujian.* TO 'mujian'@'127.0.0.1';
SQL

artifact="$(sha256sum mujian.jar | cut -c1-16).jar"
install -m 644 mujian.jar "/opt/mujian/releases/$artifact"
if [[ -L /opt/mujian/current.jar ]]; then
  ln -sfn "$(readlink /opt/mujian/current.jar)" /opt/mujian/previous.jar
fi
ln -sfn "/opt/mujian/releases/$artifact" /opt/mujian/current.jar
install -m 644 mujian.service /etc/systemd/system/mujian.service
sed "s/__PUBLIC_HOST__/$public_host/g" nginx.conf > /etc/nginx/sites-available/mujian
ln -sfn /etc/nginx/sites-available/mujian /etc/nginx/sites-enabled/mujian
nginx -t
systemctl daemon-reload
systemctl enable --now nginx
systemctl reload nginx
systemctl enable mujian
systemctl restart mujian
ready=false
for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:8080/api/health | grep -q '"status":"UP"'; then ready=true; break; fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  journalctl -u mujian -n 60 --no-pager
  echo 'Application health check failed; previous.jar is available when upgrading.' >&2
  exit 1
fi
curl --fail --silent -H "Host: $public_host" http://127.0.0.1/api/health
printf '\nDeployment ready. Application and database listen on loopback only.\n'
printf 'Initial account passwords: /etc/mujian/first-login.txt (root only; do not send in chat).\n'
printf 'HTTP is for testing. Domain/filing and trusted HTTPS are needed before public account use and PWA installation.\n'
