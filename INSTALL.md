# Installation & Packaging Guide

This guide covers installing, updating, and distributing the **Net Speed Monitor** extension across different Linux distributions and environments.

---

## 📦 Distribution Packages

### Supported Operating Systems
- Ubuntu 24.04 LTS (Noble) & 26.04 LTS (Resolute)
- Debian 12 (Bookworm) & Debian Testing/Unstable
- Fedora Workstation 39, 40, 41+
- Arch Linux & Manjaro

---

## 🛠️ Method 1: Building and Installing via Makefile (Recommended)

### Prerequisites
Make sure you have basic build utilities and GSettings compilation tools installed:

**On Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install -y git make zip libglib2.0-bin
```

**On Fedora:**
```bash
sudo dnf install -y git make zip glib2-devel
```

**On Arch Linux:**
```bash
sudo pacman -S --needed git make zip glib2
```

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/parikshan-sudo/net-speed-monitor.git
   cd net-speed-monitor
   ```

2. **Build and install for the current user:**
   ```bash
   make install
   ```
   This compiles the GSettings schema and installs files into:
   `~/.local/share/gnome-shell/extensions/net-speed-monitor@pnr.tech/`

3. **Restart / Reload GNOME Shell:**
   - **X11 Session**: Press `Alt + F2`, type `r`, and hit `Enter`.
   - **Wayland Session**: Log out from your user session and log back in (GNOME Shell on Wayland cannot reload newly installed extensions in-place).

4. **Enable the Extension:**
   ```bash
   gnome-extensions enable net-speed-monitor@pnr.tech
   ```

---

## 📦 Method 2: Manual Zip Installation

1. Generate or download the release zip package:
   ```bash
   ./package.sh
   # Produces: dist/net-speed-monitor@pnr.tech.zip
   ```

2. Install using the `gnome-extensions` command-line utility:
   ```bash
   gnome-extensions install dist/net-speed-monitor@pnr.tech.zip
   ```

3. Compile the schema inside the user extension folder:
   ```bash
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/net-speed-monitor@pnr.tech/schemas/
   ```

4. Log out and log back in (on Wayland) and enable:
   ```bash
   gnome-extensions enable net-speed-monitor@pnr.tech
   ```

---

## 🌐 Method 3: Submission to extensions.gnome.org (EGO)

For maintainers publishing to [extensions.gnome.org](https://extensions.gnome.org/upload/):

1. Run the packager script:
   ```bash
   bash package.sh
   ```
2. The script validates that no forbidden files (such as `.git`, compiled binaries, or temporary editor buffers) are included.
3. Upload the resulting `dist/net-speed-monitor@pnr.tech.zip` through the EGO web portal.

---

## 🗑️ Uninstallation

To cleanly remove the extension:

```bash
make uninstall
```

Or manually:
```bash
gnome-extensions disable net-speed-monitor@pnr.tech 2>/dev/null || true
rm -rf ~/.local/share/gnome-shell/extensions/net-speed-monitor@pnr.tech
rm -rf ~/.local/share/net-speed-monitor
```
