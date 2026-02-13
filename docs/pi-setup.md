# Raspberry Pi Setup

Complete guide for setting up the nurboard kiosk on a Raspberry Pi 5.

## Prerequisites

- Raspberry Pi 5 (4GB+) with Raspberry Pi OS 64-bit (Desktop variant)
- HDMI cable connected to the Panasonic TX-50JXW834 TV
- Network access (Ethernet or Wi-Fi)
- SSH access to the Pi

## 1. HDMI Configuration

Force 1080p HDMI output by editing `/boot/firmware/config.txt`. See
[rpi-boot-config.md](rpi-boot-config.md) for the required settings.

Reboot after editing.

## 2. Run the Install Script

SSH into the Pi and run:

```bash
git clone https://github.com/acmsi/nurboard.git /tmp/nurboard-setup
/tmp/nurboard-setup/scripts/install.sh
```

Or if the repo is already at `/opt/nurboard`:

```bash
/opt/nurboard/scripts/install.sh
```

The script is idempotent — safe to run multiple times. It will:

- Install system packages (`cec-utils`, `chromium`, `git`)
- Install Deno (if missing)
- Clone or update the repo at `/opt/nurboard`
- Build the Astro dashboard
- Install and enable systemd services
- Disable screen blanking (DPMS + console)

## 3. Remote Access (Tailscale)

Tailscale is installed automatically by `install.sh`. It creates a mesh VPN so
you can SSH into the Pi from anywhere, even behind NAT.

### One-time setup

```bash
sudo tailscale up --ssh
```

This prints a URL — open it in a browser to authenticate with your Tailscale
account. Once authenticated, the Pi joins your tailnet and is reachable via its
Tailscale IP (`100.x.y.z`) or MagicDNS hostname.

### Usage

From any device on the same tailnet:

```bash
# SSH (no key management needed with --ssh)
ssh nasiridina@nurboard-pi

# Dashboard
curl http://nurboard-pi:3000/api/tabs

# Or use the Tailscale IP directly
ssh nasiridina@100.x.y.z
```

Tailscale runs as a systemd service and survives reboots automatically.

The free plan (3 users, 100 devices) covers this use case. Tailscale is built on
WireGuard, so if we ever need to eliminate the third-party dependency,
[Headscale](https://github.com/juanfont/headscale) is a self-hosted drop-in
replacement for the coordination server.

### Verify

```bash
tailscale status     # show tailnet peers
tailscale ip         # show this device's Tailscale IP
```

## 4. Manual Steps

After `install.sh` completes, configure these via `sudo raspi-config`:

### Auto-login to desktop

**System Options > Boot / Auto Login > Desktop Autologin**

The kiosk Chrome needs a desktop session to run.

### SSH (if not already enabled)

**Interface Options > SSH > Enable**

### Wi-Fi (if not using Ethernet)

**System Options > Wireless LAN**

### Reboot

```bash
sudo reboot
```

## Updating

For day-to-day code updates via SSH:

```bash
/opt/nurboard/scripts/update.sh
```

This pulls the latest code, rebuilds, reinstalls systemd units, and restarts
both services. The tab rotator will reconnect to Chrome via CDP automatically.

## Troubleshooting

### Check service status

```bash
sudo systemctl status nurboard
sudo systemctl status nurboard-kiosk
```

### View logs

```bash
# Nurboard service (dashboard + CEC scheduler)
journalctl -u nurboard -f

# Chrome kiosk
journalctl -u nurboard-kiosk -f

# Both since last boot
journalctl -u nurboard -u nurboard-kiosk -b
```

### Test CEC (TV control)

```bash
# Check TV power status
echo "pow 0" | cec-client -s -d 1

# Turn TV on
echo "on 0" | cec-client -s -d 1

# Put TV in standby
echo "standby 0" | cec-client -s -d 1
```

### Test tab control (CDP)

```bash
# Check tab status
curl localhost:3000/api/tabs

# Switch to the dashboard tab
curl -X POST localhost:3000/api/tabs -H 'Content-Type: application/json' \
  -d '{"action":"show","tab":"dashboard"}'

# Switch to the Mawaqit tab
curl -X POST localhost:3000/api/tabs -H 'Content-Type: application/json' \
  -d '{"action":"show","tab":"mawaqit"}'
```

### Restart services

```bash
sudo systemctl restart nurboard          # dashboard + CEC
sudo systemctl restart nurboard-kiosk    # Chrome kiosk only
```

### Full reinstall

```bash
sudo systemctl stop nurboard nurboard-kiosk
/opt/nurboard/scripts/install.sh
sudo reboot
```
