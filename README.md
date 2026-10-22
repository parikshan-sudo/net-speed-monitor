# Net Speed Monitor

[![GNOME Shell 45-50](https://img.shields.io/badge/GNOME%20Shell-45%20%7C%2046%20%7C%2047%20%7C%2048%20%7C%2049%20%7C%2050-blue.svg)](https://extensions.gnome.org)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-green.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform: Linux / Wayland & X11](https://img.shields.io/badge/Platform-Linux%20(Wayland%20%2F%20X11)-orange.svg)]()

A lightweight, production-quality GNOME Shell extension that displays **real-time internet download and upload transfer rates** directly in the top panel, coupled with an interactive dashboard, live hardware-accelerated traffic graph, connection intelligence, and an on-demand speed test.

---

## ✨ Features

- **Glanceable Top-Panel Indicator**:
  - Live download and upload rates (e.g. `↓ 12.4 MB/s   ↑ 1.8 MB/s`).
  - Snug, compact footprint with customized horizontal padding.
  - No redundant network icon next to system tray connection indicators (configurable).
  - Multiple display modes: `Both`, `Download only`, `Upload only`, `Compact combined`, and `Icon only`.
  - Automatic and decimal/binary unit scaling (`B/s`, `KB/s`, `MB/s`, `KiB/s`, `MiB/s`).

- **Interactive Dashboard Popup**:
  - **Live Network Statistics**: Instant transfer rates, active interface, connection status, and session uptime.
  - **Clutter Canvas Speed Graph**: Real-time download (green) and upload (orange) time-series graph with pause/resume and 1, 5, 15, and 30-minute history windows.
  - **Network Interface Selector**: Auto-detects default-route connection; supports pinning specific physical/virtual interfaces. Inactive virtual bridge/Docker interfaces are kept in a scrollable, sorted container.
  - **Connection Information**: Real-time link speed (e.g. `100 Mb/s`, `1000 Mb/s`), interface operstate, and link type.
  - **Session Statistics**: Cumulative download/upload totals, peak speeds, and session averages with a one-click reset action.
  - **On-Demand Speed Test**: Explicit Cloudflare-backed latency, download, and upload measurement that never runs passively in the background.

- **Adaptive Light & Dark Theme Support**:
  - Native dynamic styling that swaps instantly between [`stylesheet-dark.css`](stylesheet-dark.css) and [`stylesheet-light.css`](stylesheet-light.css) via GNOME Shell's style variant engine.
  - Canvas graph automatically adjusts background, grid lines, and curve contrast for high legibility in both light and dark desktop themes.

- **Safe, Performant & Private**:
  - Passive monitoring uses non-blocking kernel `/sys/class/net` counter deltas—zero external network requests.
  - Duplicate timer guards and safe cleanup on extension `disable()` cycles.
  - No root/sudo privileges required.

---

## 🖥️ Compatibility

- **GNOME Shell**: `45`, `46`, `47`, `48`, `49`, `50`
- **Display Servers**: Wayland & X11
- **Tested Distributions**: Ubuntu 24.04 LTS, Ubuntu 26.04 LTS, Debian 12+, Fedora 39+, Arch Linux

---

## 🚀 Quick Start & Installation

### Option 1: One-Line Install from Source

```bash
git clone https://github.com/your-username/net-speed-monitor.git
cd net-speed-monitor
make install
```

### Option 2: Build Distribution Package

```bash
make package
# Or run:
./package.sh
```
This produces `dist/net-speed-monitor@pnr.tech.zip` ready for upload to [extensions.gnome.org](https://extensions.gnome.org).

### Enabling the Extension

On **X11**, restart GNOME Shell (`Alt + F2`, type `r`, and hit Enter).  
On **Wayland**, log out and log back in, then enable:

```bash
gnome-extensions enable net-speed-monitor@pnr.tech
```

To access the preferences window:

```bash
gnome-extensions prefs net-speed-monitor@pnr.tech
```

---

## ⚙️ Configuration & Settings

Preferences are built natively using **GTK4 / libadwaita** and organized into 5 intuitive pages:

| Setting | Options / Range | Default | Description |
|---|---|---|---|
| `monitoring-enabled` | Boolean | `true` | Turn live speed monitoring on or off |
| `refresh-interval` | 500 – 10000 ms | `1000` | Counter sampling interval |
| `display-mode` | `both`, `download`, `upload`, `compact`, `icon-only` | `both` | Panel presentation style |
| `speed-unit` | `auto`, `Bps`, `KBps`, `MBps`, `KiBps`, `MiBps` | `auto` | Unit scaling |
| `show-icon` | Boolean | `false` | Show/hide panel network icon |
| `use-fixed-width` | Boolean | `true` | Prevents shifting nearby panel elements |
| `interface-mode` | `auto`, `manual` | `auto` | Auto-detect default route vs manual pin |
| `interface-name` | String | `""` | Interface name when mode is manual |
| `graph-history-minutes` | 1 – 30 minutes | `5` | History retained in live canvas graph |
| `session-stats-enabled`| Boolean | `true` | Enable/disable session accumulation |
| `history-enabled` | Boolean | `false` | Enable daily statistics persistence |
| `history-retention-days`| 1 – 365 days | `30` | Number of days to retain on disk |
| `notifications-enabled`| Boolean | `false` | Alert on disconnect or sustained spikes |
| `speedtest-enabled` | Boolean | `true` | Display Speed Test section in menu |

---

## 🛠️ Project Structure

```
net-speed-monitor/
├── extension.js           # Lifecycle controller & GLib polling orchestrator
├── dashboard.js           # PanelMenu button, Clutter SpeedGraph, dashboard popup
├── netReader.js           # Kernel /sys/class/net counter reader & rate math
├── historyBuffer.js       # Fixed ring-buffer for time-series graph points
├── utils.js               # Unit formatting & monotonic time helpers
├── speedTest.js           # Optional, on-demand curl speed test runner
├── persistence.js         # Atomic JSON local history persistence
├── notifications.js       # Smart notification debouncer & threshold monitor
├── prefs.js               # Libadwaita GTK4 preferences window
├── stylesheet.css         # Fallback stylesheet
├── stylesheet-dark.css    # High-contrast Dark theme stylesheet
├── stylesheet-light.css   # High-contrast Light theme stylesheet
├── schemas/               # GSettings schema XML definition
├── Makefile               # Build, install, package, and lint automation
├── package.sh             # EGO zip packager
└── .github/workflows/     # Continuous integration & validation
```

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)** — see the [LICENSE](LICENSE) file for details.
