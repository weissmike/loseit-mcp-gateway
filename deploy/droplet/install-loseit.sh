#!/usr/bin/env bash
# Installs loseit-mcp as an isolated, memory-capped systemd service on 127.0.0.1:8001.
# Usage (as root):  ORIGIN_HOST=loseit-origin.example.com STRONG_NAME=... POLICY_HASH=... bash install-loseit.sh
# See docs/LOSEIT.md for how to find the current STRONG_NAME / POLICY_HASH (Lose It rotates them).
set -euo pipefail
: "${ORIGIN_HOST:?set ORIGIN_HOST to the public hostname nginx serves}"
: "${STRONG_NAME:?set STRONG_NAME (GWT permutation)}"
: "${POLICY_HASH:?set POLICY_HASH (GWT serialization policy hash of LoseItService)}"
COMMIT="${COMMIT:-c1bf69cefb2c709688a517fe9b030ad2fe3f67f5}"   # reviewed commit of mxbrunet/loseit-mcp
APP=/opt/loseit-mcp

id loseit >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP" --shell /usr/sbin/nologin loseit
cd "$APP"
[ -d src-repo ] || sudo -u loseit git clone -q https://github.com/mxbrunet/loseit-mcp src-repo
sudo -u loseit git -C src-repo fetch -q origin
sudo -u loseit git -C src-repo checkout -q "$COMMIT"

# needs: apt-get install python3.12-venv
if [ ! -x uvenv/bin/uv ]; then
  sudo -u loseit python3 -m venv uvenv
  sudo -u loseit uvenv/bin/pip install -q "uv==0.5.11"
fi
cd src-repo
sudo -u loseit env UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 \
  ../uvenv/bin/uv sync --frozen --no-dev

cat > /etc/systemd/system/loseit-mcp.service <<UNIT
[Unit]
Description=Lose It MCP (multi-tenant, header auth), behind nginx
After=network-online.target
Wants=network-online.target

[Service]
User=loseit
Group=loseit
WorkingDirectory=$APP/src-repo
Environment=LOSEIT_MULTI_TENANT=1
Environment=LOSEIT_ALLOWED_HOSTS=$ORIGIN_HOST
Environment=LOSEIT_TRUSTED_PROXIES=1
Environment=LOSEIT_STRONG_NAME=$STRONG_NAME
Environment=LOSEIT_POLICY_HASH=$POLICY_HASH
ExecStart=$APP/src-repo/.venv/bin/loseit-mcp serve --transport streamable-http --host 127.0.0.1 --port 8001
Restart=on-failure
RestartSec=5
# Keep it from starving other sites on a small droplet
MemoryHigh=120M
MemoryMax=180M
CPUQuota=50%
Nice=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now loseit-mcp
sleep 4
systemctl --no-pager --lines=6 status loseit-mcp | head -12
curl -s -o /dev/null -w "local /healthz -> %{http_code}\n" http://127.0.0.1:8001/healthz
