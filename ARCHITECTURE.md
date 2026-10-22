# Net Speed Monitor — Architecture & Technical Specifications

This document outlines the internal architecture, data flow, memory model, and rendering mechanisms of the **Net Speed Monitor** GNOME Shell extension.

---

## 1. System Overview & Module Decomposition

The extension adopts an asynchronous, modular architecture adhering to modern GNOME 45+ ES Module (ESM) standards.

```
┌─────────────────────────────────────────────────────────────┐
│                 NetSpeedMonitorExtension                    │
│                       (extension.js)                        │
└──────┬─────────────┬─────────────┬─────────────┬────────────┘
       │             │             │             │
       ▼             ▼             ▼             ▼
┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
│  NetReader   │ │HistoryBuffer│ │Dashboard    │ │Notification│
│(netReader.js)│ │(history.js) │ │(dashboard.js│ │  Manager   │
└──────┬───────┘ └──────┬──────┘ └──────┬──────┘ └────────────┘
       │                │               │
       ▼                ▼               ▼
 /sys/class/net   Normalized time-   SpeedGraph (Cairo)
  kernel stats         series        + PopupMenu
```

### Module Responsibilities

| Module | Role |
|---|---|
| `extension.js` | Extension lifecycle controller (`enable()` / `disable()`). Manages GLib timeout loops, GSettings connections, and coordinates subsystem updates. |
| `netReader.js` | Direct kernel `/sys/class/net` counter reader. Calculates rate deltas, detects default routing, and handles counter rollovers/resets safely. |
| `historyBuffer.js` | In-memory bounded ring buffer storing timestamped speed samples. Normalizes series for Cairo canvas graph rendering. |
| `dashboard.js` | Subclasses `PanelMenu.Button`. Constructs the panel indicator, Cairo `SpeedGraph`, and scrollable multi-section dashboard popup. |
| `speedTest.js` | Subprocess-driven bandwidth tester using non-blocking asynchronous `curl` against Cloudflare speed measurement endpoints. |
| `persistence.js` | Atomic JSON disk storage for optional daily traffic totals and historic peaks in `~/.local/share/net-speed-monitor/`. |
| `notifications.js` | Threshold and disconnection detector with debounce counters and cooldown timers to prevent notification spam. |
| `prefs.js` | Libadwaita / GTK4 preferences interface implementing `ExtensionPreferences`. |
| `utils.js` | Formatting utilities for decimal/binary units, time intervals, and monotonic clock access. |

---

## 2. Real-Time Network Measurement Engine

### Kernel Interface Statistics
`netReader.js` reads byte counters directly from sysfs:
- RX bytes: `/sys/class/net/<interface>/statistics/rx_bytes`
- TX bytes: `/sys/class/net/<interface>/statistics/tx_bytes`

Sysfs lookups are kernel-level synthetic files that resolve without blocking disk I/O, maintaining zero overhead on the GNOME Shell main loop.

### Transfer Rate Calculation
```
Rate (bytes/s) = (Bytes_current - Bytes_previous) / Δt
```
- Monotonic timestamps are acquired via `GLib.get_monotonic_time() / 1_000_000`.
- **Clock Jump Handling**: If `Δt <= 0` (e.g. system suspend/resume), counters are reset without publishing negative or spiked rates.
- **Counter Rollover / Interface Resets**: If `Bytes_current < Bytes_previous` (e.g. link renegotiation or counter wraparound), delta is clamped to `0`.

### Active Interface Detection
1. **Routing Table Inspection**: Inspects `/proc/net/route` for destination `00000000` (default gateway route).
2. **Virtual Interface Filtering**: Ignores loopback, Docker, bridge (`br-*`), and virtual ethernet (`veth*`) devices during automatic detection.
3. **Failover**: Falls back to the first operational `UP` physical interface (`en*`, `eth*`, `wl*`) if the route table is unavailable.

---

## 3. High-Performance Graph Rendering (Clutter / Cairo)

The dashboard renders real-time traffic using a native `St.DrawingArea` canvas (`SpeedGraph`):
- Avoids embedding heavy WebKit or external rendering runtimes.
- Implements two distinct series:
  - **Download**: High-contrast green area fill with distinct outline.
  - **Upload**: High-contrast orange/amber area fill with distinct outline.
- **Dynamic Theme Awareness**:
  - Subscribes to `St.Settings.get().connect('notify::color-scheme')`.
  - In **Light Mode**: Inverts canvas backgrounds, dims grid lines to subtle dark strokes (`rgba(0, 0, 0, 0.08)`), and darkens axis labels for crisp readability.
  - In **Dark Mode**: Uses soft translucent dark fills (`rgba(0, 0, 0, 0.25)`) and light grid lines.

---

## 4. Theme Engine & Stylesheet Architecture

To comply with GNOME Shell's style variant architecture, the extension provides two dedicated stylesheets:
- `stylesheet-dark.css`: Loaded when GNOME Shell is in dark mode.
- `stylesheet-light.css`: Loaded when GNOME Shell is in light mode.
- `stylesheet.css`: Serves as the fallback.

When the user switches their system appearance in Ubuntu Settings:
GNOME Shell's `_reloadExtensionStylesheets()` detects `-dark.css` and `-light.css`, unloads the previous stylesheet, and loads the active variant without requiring an extension restart.

---

## 5. Memory Safety & Lifecycle Guarantees

GNOME extensions execute in-process within `gnome-shell`. Memory leaks or dangling callbacks degrade desktop responsiveness.

### Safety Guards in `disable()`
1. **Timer Destruction**:
   ```javascript
   if (this._timerId) {
       GLib.source_remove(this._timerId);
       this._timerId = null;
   }
   ```
2. **Signal Disconnection**: All GSettings and St.Settings signal IDs are stored and explicitly disconnected during teardown.
3. **Actor Cleanup**: `Dashboard.destroy()` removes child widgets, canvas DrawingAreas, and speed-test subprocesses.
4. **Bounded Buffers**: `HistoryBuffer` automatically splices and drops entries older than the configured time window (`N` minutes), enforcing a hard cap on memory consumption.
