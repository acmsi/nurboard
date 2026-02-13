#!/usr/bin/env bash
#
# Nurboard — pull latest code, rebuild, and restart.
#
# Usage: ./scripts/update.sh          (from the Pi, via SSH)
#        ssh pi@nurboard ./scripts/update.sh

set -euo pipefail

export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

INSTALL_DIR="/opt/nurboard"

info() { echo "[nurboard] $*"; }

cd "$INSTALL_DIR"

info "Pulling latest changes..."
git pull --ff-only

info "Installing dependencies..."
deno install

info "Building..."
deno task build

info "Updating Chromium policies..."
sudo mkdir -p /etc/chromium/policies/managed
sudo cp "$INSTALL_DIR/chromium/policies/managed/nurboard.json" \
  /etc/chromium/policies/managed/nurboard.json

info "Updating systemd units..."
CURRENT_USER="$(whoami)"
for unit in nurboard.service nurboard-kiosk.service; do
  sed "s/__USER__/$CURRENT_USER/g" "$INSTALL_DIR/systemd/$unit" \
    | sudo tee "/etc/systemd/system/$unit" > /dev/null
done
sudo systemctl daemon-reload

info "Restarting services..."
sudo systemctl restart nurboard nurboard-kiosk

info "Done! Check status with: sudo systemctl status nurboard nurboard-kiosk"
