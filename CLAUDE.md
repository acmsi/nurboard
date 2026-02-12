# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nurboard** is a dashboard/kiosk system for the Nur Mosque in Saint-Imier, Switzerland. It runs on a Raspberry Pi 5 (4GB) connected via HDMI to a Panasonic TX-50JXW834 50" TV.

Primary goals:
- Display prayer times via [Mawaqit](https://mawaqit.net/fr/mosquee-nur-2610-saint-imier-switzerland)
- Show membership payment reminders and overdue count
- Display event calendar, donation campaigns, announcements
- Control TV power on/off schedule via HDMI-CEC

Association website: https://acmsi.ch

## Architecture

### Standalone kiosk — no Docker, no Coolify

The 4GB Pi at the mosque runs everything locally and is fully self-contained. A separate homeserver Pi (8GB, different location) running Coolify is used only for remote access via Wireguard/Cloudflared — the nurboard Pi must work regardless of internet or homeserver availability.

### Single Deno service

One process handles both the web dashboard (HTTP server on `localhost:3000`) and CEC TV control (scheduling + manual commands via `cec-client`). The two concerns are tightly coupled — a TV displaying nothing is no better than a TV that's off. If the service is down, both are broken; when it restarts, both recover together. Runs as a systemd unit with `Restart=always`.

### Chrome kiosk

A separate systemd service launches Chrome in kiosk mode pointing at `localhost:3000` at 1920x1080 (matching `/boot/firmware/config.txt`).

### Deployment

Git pull + systemd restart via SSH or Wireguard tunnel. No CI/CD pipeline initially.

```
┌─────────────────────────────────────────────┐
│  Raspberry Pi 5 (4GB) — Mosque              │
│                                             │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │ Chrome Kiosk │───▶│ Nurboard Service  │  │
│  │ (systemd)    │    │ Deno :3000        │  │
│  └──────────────┘    │                   │  │
│                      │ - Web dashboard   │  │
│                      │ - CEC scheduler   │  │
│                      │ - TV control API  │  │
│                      └────────┬──────────┘  │
│                               │ HDMI-CEC    │
│                               ▼             │
│                      ┌─────────────────┐    │
│                      │ Panasonic TV    │    │
│                      │ TX-50JXW834     │    │
│                      └─────────────────┘    │
└─────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Deno (preferred for all custom development)
- **Target**: Raspberry Pi OS 64-bit on RPi5, kiosk-mode browser display at 1920x1080
- **TV Control**: HDMI-CEC via `cec-client` ("VIERA Link" on this Panasonic TV)
- **Remote Access**: Cloudflared tunnel (planned), SSH, Rustdesk/VNC

## Hardware & CEC Commands

The TV is controlled via CEC over HDMI:

```bash
# Check TV power status
echo "pow 0" | cec-client -s -d 1

# Turn TV on
echo "on 0" | cec-client -s -d 1

# Put TV in standby
echo "standby 0" | cec-client -s -d 1
```

The Pi has headless HDMI output forced in `/boot/firmware/config.txt` — see [docs/rpi-boot-config.md](docs/rpi-boot-config.md) for details.

## Repository Structure

- `bootstrap.md` — Original project specification (in French)
- `archives/` — Legacy scripts from previous setup (reference only, not active code)
- `docs/rpi-boot-config.md` — Raspberry Pi `/boot/firmware/config.txt` HDMI settings

## Development Conventions

- All code and documentation in **English**
- Prefer Deno over Node.js for all custom tooling and services
- SD card backup strategy should be maintained for disaster recovery
