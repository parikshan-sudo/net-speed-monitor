# Contributing to Net Speed Monitor

Thank you for your interest in contributing to **Net Speed Monitor**! We welcome bug reports, feature proposals, and pull requests.

---

## 🧭 Code of Conduct & Principles

- **Glanceable & Lightweight**: The panel indicator must stay unobtrusive, lightweight, and low on CPU/memory usage.
- **Privacy-First**: No background telemetry or external network calls during passive monitoring.
- **Native GNOME Integration**: Use St, Clutter, and Libadwaita primitives rather than embedding third-party web frameworks or heavyweight runtimes.

---

## 💻 Development Workflow

### Setting up Local Development

1. Fork and clone the repository.
2. Link your working repository directly into GNOME Shell's extension directory for rapid iteration:
   ```bash
   ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/net-speed-monitor@pnr.tech
   ```
3. Compile the schema whenever modifying `schemas/*.xml`:
   ```bash
   make compile-schemas
   ```

### Debugging & Logs

To inspect live extension logs and debug output:

```bash
journalctl --user -u org.gnome.Shell@ubuntu.service -f
# Or on general distributions:
journalctl --user -f -o cat /usr/bin/gnome-shell
```

To reload code changes during development:
- **On X11**: `Alt + F2` -> `r` -> `Enter`.
- **On Wayland**: Run a nested session in an isolated window:
  ```bash
  dbus-run-session -- gnome-shell --nested --wayland
  ```

---

## 🧪 Validation & Testing Checklist

Before submitting a Pull Request, ensure all checks pass:

```bash
make check
```

1. **Schema Check**: GSettings XML compiles cleanly without warnings.
2. **Metadata Compatibility**: Supported GNOME Shell versions declared in `metadata.json`.
3. **Lifecycle Safety**: Test enabling and disabling multiple times:
   ```bash
   make reload
   ```
   Confirm no duplicate timers or orphan actors in logs.
4. **Theme Testing**: Verify appearance under both Light and Dark GNOME desktop modes.

---

## 📬 Pull Request Guidelines

1. Create a feature branch (`git checkout -b feature/my-enhancement`).
2. Keep commits descriptive and atomic.
3. Open a PR against `main` explaining the problem and your solution.
