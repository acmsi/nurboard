#!/usr/bin/env bash
#
# Backup the Raspberry Pi SD card to a compressed image.
# Run on the Pi itself — writes to the specified destination.
#
# Usage: sudo ./scripts/backup-sd.sh /path/to/backup/dir
#

set -euo pipefail

DEST="${1:?Usage: $0 /path/to/backup/dir}"
DEVICE="/dev/mmcblk0"
DATE=$(date +%Y%m%d-%H%M)
FILENAME="nurboard-${DATE}.img.gz"

if [ ! -b "$DEVICE" ]; then
  echo "Error: $DEVICE not found — are you running this on the Pi?"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: must run as root (sudo)"
  exit 1
fi

echo "Backing up $DEVICE to ${DEST}/${FILENAME}..."
dd if="$DEVICE" bs=4M status=progress | gzip > "${DEST}/${FILENAME}"
echo "Done: ${DEST}/${FILENAME}"
