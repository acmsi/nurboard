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
2. **Dashboard** — the Astro app at `localhost:3000` (membership CTA, donation
   progress, cash donation reminder, hadith)

Tabs rotate on a configurable interval (`TAB_ROTATION_SECS`, default 120s).
Kiosk mode hides the tab bar, so switching looks like a seamless full-screen
transition. `unclutter-xfixes` runs alongside Chrome to hide the mouse cursor
after 1s of inactivity (launched via `ExecStartPre` in the kiosk service).

### Deployment

Git pull + systemd restart via SSH over Tailscale. GitHub Actions CI runs
format, lint, and tests on every push/PR.

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

## Data Sources

The dashboard fetches live data from two external APIs. Each fetcher uses 5s
timeout, 1h server-side cache, and a `FetchResult<T>` wrapper
(`src/lib/fetch-result.ts`) that exposes `isStale` (cached >24h) and
`isFallback` (using defaults or null) flags for conditional UI rendering.

### Donation data (`src/lib/donation.ts`)

- **API**: `https://acmsi.ch/api/projet-xhamia-nur` (Cloudflare Worker)
- **Fields**: `objectif`, `montant_leve`, `pourcentage`, `derniere_maj`
- **Fallback**: hardcoded defaults (last known values) when API is unreachable
  and no cache exists; stale warning shown in UI

### Membership data (`src/lib/membership.ts`)

- **API**: Google Apps Script published as web app
  (`script.google.com/macros/s/.../exec`) — exposes a small anonymous subset of
  data from the "ACMSI Membres et Cotisations" Google Sheet
- **Fields**: `annee`, `membres_actifs`, `membres_a_jour`,
  `cotisations_esperees`, `cotisations_recoltees`, `taux_recolte`,
  `cotisation_minimale`
- **"Membres a jour" logic**: the spreadsheet uses a prorated formula — a member
  is considered "a jour" if they've paid at least
  `(cotisation * current_month / 12)`, so partial payers (e.g. semi-annual
  installments) aren't penalized early in the year
- **Fallback**: returns `null` data when API is unreachable and no cache exists
  (no hardcoded defaults — unlike donations, membership has no "last updated"
  date, so stale data would be misleading). The dashboard hides stats and shows
  a static CTA with benefits list instead

### Dashboard slideshow

The right panel rotates between 3 slides every 30s with a CSS `translateX`-based
horizontal carousel:

1. **Overview** — membership CTA (with member count) + donation summary
2. **Adhésion** — membership benefits list + optional stats (hidden if API data
   unavailable), QR code to acmsi.ch/donation
3. **Projet Xhamia Nur** — fundraiser progress bar with % inside, cash donation
   reminder, and hadith (Sahih Muslim 533)

Dot indicators with a progress ring animation show countdown to next slide. The
page auto-reloads every 6h so SSR re-fetches fresh data from the APIs.

## Repository Structure

- `main.ts` — Entry point: starts CEC scheduler, tab rotator, then Astro server
- `src/lib/cec.ts` — CEC client (TV on/off/status via `cec-client`)
- `src/lib/scheduler.ts` — TV power on/off schedule by hour
- `src/lib/cdp.ts` — CDP client (Chrome tab list/create/activate/close)
- `src/lib/tab-rotator.ts` — Tab orchestration (setup, rotation, resilience)
- `src/pages/api/cec.ts` — REST API for TV control
- `src/pages/api/tabs.ts` — REST API for tab control
- `src/lib/fetch-result.ts` — Shared `FetchResult<T>` type (isStale, isFallback)
- `src/lib/donation.ts` — Donation API fetcher (Xhamia Nur fundraiser)
- `src/lib/membership.ts` — Membership API fetcher (cotisation stats)
- `src/pages/index.astro` — Dashboard page (slideshow carousel with 3 slides)
- `systemd/` — systemd unit files for Deno service and Chrome kiosk
- `scripts/` — Install (`install.sh`), update (`update.sh`), SD backup
- `docs/` — Pi setup guide, boot config reference
- `bootstrap.md` — Original project specification (in French)
- `archives/` — Legacy scripts from previous setup (reference only)

## Commands

- `deno fmt` — format all files
- `deno lint` — lint all files
- `deno task test` — run unit tests (sets `CEC_ENABLED=false`)
- `deno task dev` — start Astro dev server
- `deno task build` — build Astro for production
- `deno task start` — start full service (Astro + CEC + tab rotator)

## CI

GitHub Actions runs format, lint, and test on push/PR to `main`
(`.github/workflows/ci.yml`).

## Development Conventions

- All code and documentation in **English**
- Prefer Deno over Node.js for all custom tooling and services
- SD card backup strategy should be maintained for disaster recovery
