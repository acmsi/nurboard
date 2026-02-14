# Nurboard

Dashboard and kiosk system for the [Nur Mosque](https://acmsi.ch) in
Saint-Imier, Switzerland. Runs on a Raspberry Pi 5 connected via HDMI to a 50"
TV.

## What it does

- Displays prayer times via [Mawaqit](https://mawaqit.net) as a full-screen
  Chrome tab (managed via Chrome DevTools Protocol)
- Shows a dashboard with 3-slide carousel: membership CTA with benefits,
  donation campaign progress (Projet Xhamia Nur), and an overview combining both
- Fetches live data from external APIs (Cloudflare Worker for donations, Google
  Apps Script for membership stats) with 1h cache, 24h staleness detection, and
  graceful fallbacks when APIs are unreachable
- Rotates between Mawaqit and the dashboard tab every 2 minutes (configurable)
- Controls the TV power schedule via HDMI-CEC (auto on/off around prayer times)
- Exposes REST APIs for tab switching (`/api/tabs`) and TV control (`/api/cec`)

## Quick install (Raspberry Pi)

SSH into the Pi and run:

```bash
curl -fsSL https://raw.githubusercontent.com/acmsi/nurboard/main/scripts/install.sh | bash
```

Or clone first and run locally:

```bash
git clone https://github.com/acmsi/nurboard.git /opt/nurboard
/opt/nurboard/scripts/install.sh
```

The install script is idempotent (safe to re-run). It installs Deno, system
dependencies, builds the dashboard, and configures systemd services.

See [docs/pi-setup.md](docs/pi-setup.md) for the full setup guide.

## Updating

```bash
/opt/nurboard/scripts/update.sh
```

Pulls latest code, rebuilds, updates systemd units, and restarts both services.

## Architecture

A single Deno process handles the Astro web dashboard, CEC TV scheduler, and CDP
tab rotation. Chrome runs in kiosk mode as a separate systemd service. The Deno
service connects to Chrome's CDP port (`--remote-debugging-port=9222`) to manage
tabs — this bypasses `X-Frame-Options` restrictions that prevent embedding
Mawaqit in an iframe.

```
Raspberry Pi 5 (4GB)
├── nurboard.service         Deno — dashboard + CEC scheduler + tab rotator
├── nurboard-kiosk.service   Chrome kiosk (CDP :9222) → localhost:3000
│   ├── Tab: localhost:3000    (dashboard)
│   └── Tab: mawaqit.net      (prayer times)
└── HDMI-CEC → Panasonic TX-50JXW834
```

## Development

Requires [Deno](https://deno.land).

```bash
deno install        # install dependencies
deno task dev       # start dev server (with hot reload)
deno task build     # production build
deno task start     # run production server
```

## Tech stack

- [Deno](https://deno.land) runtime
- [Astro](https://astro.build) (SSR, `@astrojs/node` adapter)
- [Mawaqit](https://mawaqit.net) prayer times (full page via CDP tab control)
- Chrome DevTools Protocol (CDP) for tab management
- HDMI-CEC via `cec-client` (`cec-utils`)
- [Tailscale](https://tailscale.com) for remote access (SSH over mesh VPN)
- systemd for process management

## License

Private project of [ACMSI](https://acmsi.ch) (Association Culturelle Musulmane
de Saint-Imier).
