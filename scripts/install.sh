#!/usr/bin/env bash
#
# Nurboard — full Pi setup (idempotent, safe to re-run).
#
# Usage: curl ... | bash   OR   ./scripts/install.sh
#
# Must be run as the user who will own the kiosk session (typically "pi").
# The script uses sudo where root is needed.

set -euo pipefail

REPO_URL="https://github.com/acmsi/nurboard.git"
INSTALL_DIR="/opt/nurboard"
CURRENT_USER="$(whoami)"

info()  { echo "[nurboard] $*"; }
error() { echo "[nurboard] ERROR: $*" >&2; exit 1; }

# ── Preflight ──────────────────────────────────────────────────────────
[ "$(uname -m)" = "aarch64" ] || info "WARNING: expected aarch64 (Raspberry Pi 64-bit), got $(uname -m)"
[ "$CURRENT_USER" != "root" ] || error "Run as a regular user, not root. The script uses sudo internally."

# ── System packages ────────────────────────────────────────────────────
info "Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq cec-utils chromium git

# ── Deno ───────────────────────────────────────────────────────────────
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

if ! command -v deno &>/dev/null; then
  info "Installing Deno..."
  curl -fsSL https://deno.land/install.sh | sh
else
  info "Deno already installed: $(deno --version | head -1)"
fi

# Persist Deno in PATH for future shell sessions
DENO_PATH_LINE='export DENO_INSTALL="$HOME/.deno" && export PATH="$DENO_INSTALL/bin:$PATH"'
if ! grep -q '.deno/bin' "$HOME/.bashrc" 2>/dev/null; then
  echo "$DENO_PATH_LINE" >> "$HOME/.bashrc"
  info "Added Deno to ~/.bashrc"
fi

# ── Clone or update repo ──────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing repo..."
  sudo -u "$CURRENT_USER" git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning repo to $INSTALL_DIR..."
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$CURRENT_USER":"$CURRENT_USER" "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ── Build ──────────────────────────────────────────────────────────────
info "Installing dependencies and building..."
cd "$INSTALL_DIR"
deno install
deno task build

# ── Systemd units ──────────────────────────────────────────────────────
info "Installing systemd units for user=$CURRENT_USER..."
for unit in nurboard.service nurboard-kiosk.service; do
  sed "s/__USER__/$CURRENT_USER/g" "$INSTALL_DIR/systemd/$unit" \
    | sudo tee "/etc/systemd/system/$unit" > /dev/null
done

sudo systemctl daemon-reload
sudo systemctl enable nurboard.service nurboard-kiosk.service
sudo systemctl restart nurboard.service nurboard-kiosk.service

# ── Disable screen blanking ───────────────────────────────────────────
info "Disabling screen blanking..."

# DPMS (display power management)
LIGHTDM_CONF="/etc/lightdm/lightdm.conf.d/99-nurboard.conf"
sudo mkdir -p "$(dirname "$LIGHTDM_CONF")"
sudo tee "$LIGHTDM_CONF" > /dev/null <<'EOF'
[SeatDefaults]
xserver-command=X -s 0 -dpms
EOF

# Console blanking
if ! grep -q "consoleblank=0" /boot/firmware/cmdline.txt 2>/dev/null; then
  sudo sed -i '$ s/$/ consoleblank=0/' /boot/firmware/cmdline.txt
  info "Added consoleblank=0 to kernel cmdline (takes effect after reboot)."
fi

# ── Done ───────────────────────────────────────────────────────────────
info "Installation complete!"
info ""
info "Services:"
info "  sudo systemctl status nurboard"
info "  sudo systemctl status nurboard-kiosk"
info ""
info "Manual steps remaining:"
info "  1. Enable auto-login to desktop: sudo raspi-config -> System -> Boot -> Desktop Autologin"
info "  2. Configure Wi-Fi if needed: sudo raspi-config -> Network"
info "  3. Enable SSH if needed: sudo raspi-config -> Interfaces -> SSH"
info "  4. Reboot to apply all changes: sudo reboot"
