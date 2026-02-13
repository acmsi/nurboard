# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

**Nurboard** is a dashboard/kiosk system for the Nur Mosque in Saint-Imier,
Switzerland. It runs on a Raspberry Pi 5 (4GB) connected via HDMI to a Panasonic
TX-50JXW834 50" TV.

Primary goals:

- Display prayer times via
  [Mawaqit](https://mawaqit.net/fr/mosquee-nur-2610-saint-imier-switzerland)
- Show membership payment reminders and overdue count
- Display event calendar, donation campaigns, announcements
- Control TV power on/off schedule via HDMI-CEC

Association website: https://acmsi.ch

## Architecture

### Standalone kiosk — no Docker, no Coolify

The 4GB Pi at the mosque runs everything locally and is fully self-contained. A
separate homeserver Pi (8GB, different location) running Coolify is used only
for remote access via Tailscale — the nurboard Pi must work regardless of
internet or homeserver availability.

### Single Deno service

One process handles both the web dashboard (HTTP server on `localhost:3000`) and
CEC TV control (scheduling + manual commands via `cec-client`). The two concerns
are tightly coupled — a TV displaying nothing is no better than a TV that's off.
If the service is down, both are broken; when it restarts, both recover
together. Runs as a systemd unit with `Restart=always`.

### Chrome kiosk + CDP tab control

A separate systemd service launches Chrome in kiosk mode pointing at
`localhost:3000` at 1920x1080 (matching `/boot/firmware/config.txt`). Chrome
exposes `--remote-debugging-port=9222` so the Deno service can control tabs via
the Chrome DevTools Protocol (CDP) JSON API.

The Deno service manages two tabs:

1. **Mawaqit** — the full prayer times page (loaded as a native tab, bypassing
   X-Frame-Options restrictions that block iframe embedding)
2. **Dashboard** — the Astro app at `localhost:3000` (announcements, payment
   reminders, events — future)

Tabs rotate on a configurable interval (`TAB_ROTATION_SECS`, default 120s).
Kiosk mode hides the tab bar, so switching looks like a seamless full-screen
transition.

### Deployment

Git pull + systemd restart via SSH over Tailscale. No CI/CD pipeline initially.

```
┌───────────────────────────────────────────────────┐
│  Raspberry Pi 5 (4GB) — Mosque                    │
│                                                   │
│  ┌──────────────┐  CDP :9222  ┌────────────────┐  │
│  │ Chrome Kiosk │◄───────────▶│ Nurboard Svc   │  │
│  │ (systemd)    │  HTTP :3000 │ Deno :3000     │  │
│  └──────┬───────┘             │                │  │
│         │ tabs:               │ - Dashboard    │  │
│         │  - localhost:3000   │ - CEC sched    │  │
│         │  - mawaqit.net     │ - Tab rotator  │  │
│         │                    │ - REST API     │  │
│         │                    └───────┬────────┘  │
│         │                            │ HDMI-CEC  │
│         │ HDMI                       ▼           │
│         │                   ┌─────────────────┐  │
│         └──────────────────▶│ Panasonic TV    │  │
│                             │ TX-50JXW834     │  │
│                             └─────────────────┘  │
└───────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Deno (preferred for all custom development)
- **Web Framework**: Astro (SSR via `@astrojs/node`, standalone mode)
- **Target**: Raspberry Pi OS 64-bit on RPi5, kiosk-mode browser display at
  1920x1080
- **TV Control**: HDMI-CEC via `cec-client` ("VIERA Link" on this Panasonic TV)
- **Tab Control**: Chrome DevTools Protocol (CDP) JSON API on port 9222
- **Remote Access**: Tailscale (mesh VPN, SSH via tailnet), Cloudflared
  (planned, for public dashboard access)

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

The Pi has headless HDMI output forced in `/boot/firmware/config.txt` — see
[docs/rpi-boot-config.md](docs/rpi-boot-config.md) for details.

## Repository Structure

- `main.ts` — Entry point: starts CEC scheduler, tab rotator, then Astro server
- `src/lib/cec.ts` — CEC client (TV on/off/status via `cec-client`)
- `src/lib/scheduler.ts` — TV power on/off schedule by hour
- `src/lib/cdp.ts` — CDP client (Chrome tab list/create/activate/close)
- `src/lib/tab-rotator.ts` — Tab orchestration (setup, rotation, resilience)
- `src/pages/api/cec.ts` — REST API for TV control
- `src/pages/api/tabs.ts` — REST API for tab control
- `src/pages/index.astro` — Dashboard page (placeholder, future content)
- `systemd/` — systemd unit files for Deno service and Chrome kiosk
- `scripts/` — Install (`install.sh`), update (`update.sh`), SD backup
- `docs/` — Pi setup guide, boot config reference
- `bootstrap.md` — Original project specification (in French)
- `archives/` — Legacy scripts from previous setup (reference only)

## Development Conventions

- All code and documentation in **English**
- Prefer Deno over Node.js for all custom tooling and services
- SD card backup strategy should be maintained for disaster recovery
