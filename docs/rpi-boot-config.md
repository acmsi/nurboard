# Raspberry Pi Boot Configuration

The following settings are added to `/boot/firmware/config.txt` on the Pi to
force 1080p HDMI output even when no display is detected (needed for headless
SSH/Rustdesk access):

```ini
framebuffer_width=1920
framebuffer_height=1080
hdmi_force_hotplug=1
hdmi_group=1
hdmi_mode=16
hdmi_drive=2
```

| Setting              | Value | Purpose                                          |
| -------------------- | ----- | ------------------------------------------------ |
| `framebuffer_width`  | 1920  | Frame buffer width in pixels                     |
| `framebuffer_height` | 1080  | Frame buffer height in pixels                    |
| `hdmi_force_hotplug` | 1     | Force HDMI output even if no display is detected |
| `hdmi_group`         | 1     | CEA (TV) display group                           |
| `hdmi_mode`          | 16    | 1080p @ 60Hz                                     |
| `hdmi_drive`         | 2     | Force HDMI mode (with audio), not DVI            |
