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

## 3. Manual Steps

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

This pulls the latest code, rebuilds, and restarts the nurboard service. The
kiosk Chrome will automatically reconnect.

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
