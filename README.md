# Nurboard

Dashboard and kiosk system for the [Nur Mosque](https://acmsi.ch) in
Saint-Imier, Switzerland. Runs on a Raspberry Pi 5 connected via HDMI to a 50"
TV.

## What it does

- Displays prayer times via [Mawaqit](https://mawaqit.net) in a fullscreen kiosk
- Controls the TV power schedule via HDMI-CEC (auto on/off around prayer times)
- Serves a local web dashboard on `localhost:3000`

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

Pulls latest code, rebuilds, and restarts the service.

## Architecture

A single Deno process handles both the Astro web dashboard and the CEC TV
scheduler. Chrome runs in kiosk mode as a separate systemd service pointing at
`localhost:3000`.

```
Raspberry Pi 5 (4GB)
├── nurboard.service      Deno — web dashboard + CEC scheduler
├── nurboard-kiosk.service  Chrome kiosk → localhost:3000
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
- [Mawaqit](https://mawaqit.net) prayer times widget
- HDMI-CEC via `cec-client` (`cec-utils`)
- systemd for process management

## License

Private project of [ACMSI](https://acmsi.ch) (Association Culturelle Musulmane
de Saint-Imier).
