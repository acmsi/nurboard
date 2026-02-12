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

info "Restarting service..."
sudo systemctl restart nurboard

info "Done! Check status with: sudo systemctl status nurboard"
