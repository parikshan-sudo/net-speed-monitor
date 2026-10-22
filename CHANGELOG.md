# Changelog

All notable changes to the **Net Speed Monitor** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-22

### Added
- **Core Monitoring Engine**: Non-blocking `/sys/class/net` byte-counter delta calculation with clock-drift, rollover, and interface reset safeguards.
- **Top Panel Indicator**: Real-time download and upload transfer rates (`↓ ... ↑ ...`) with configurable units (`B/s`, `KB/s`, `MB/s`, `KiB/s`, `MiB/s`, and `auto`).
- **Interactive Dashboard**:
  - Live statistics display (rates, active interface, status, uptime).
  - Hardware-accelerated Clutter/Cairo live speed graph with pause/resume and 1, 5, 15, and 30-minute retention windows.
  - Smart Network Interface selector with automatic default-route detection and physical/virtual interface grouping.
  - Connection details including live link speed, operstate, and connection type.
  - Session statistics tracker (total RX/TX, peaks, averages, and reset trigger).
  - On-demand Cloudflare-based speed testing engine.
- **Adaptive Theme Engine**: Dedicated `stylesheet-dark.css` and `stylesheet-light.css` stylesheets with real-time dynamic switching via `St.Settings` color-scheme signals.
- **Scrollable Layout**: Integrated `St.ScrollView` on dashboard root and interface container to prevent menu clipping on constrained vertical displays.
- **Native Preferences UI**: Complete 5-page Libadwaita settings dialog (`Monitoring`, `Interface`, `Graph`, `Notifications`, `Speed Test`).
- **Developer & CI Tooling**: Automated `Makefile`, `package.sh` packager, and GitHub Actions CI workflow.

### Fixed & Refined
- **Redundant Network Icon**: Removed duplicate connection icon from the top-panel indicator pill to eliminate clutter next to system tray connection glyphs.
- **Panel Footprint**: Reduced button natural horizontal padding (`-natural-hpadding: 4px`) and tightened label bounds to create a snug, modern panel pill.
- **Light Theme Readability**: Resolved invisible text on light popups by introducing high-contrast typography, darker grid lines, and adaptive Cairo graph curves.
- **CSS Font Warning**: Normalized `font-family: monospace` across stylesheets to silence Pango font family parsing errors in GNOME Shell journal logs.
