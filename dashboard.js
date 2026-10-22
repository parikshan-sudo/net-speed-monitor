/**
 * dashboard.js — Interactive dashboard popup menu.
 *
 * Opened by clicking the panel indicator.  Contains:
 *   A. Live network statistics
 *   B. Real-time speed graph (drawn with Clutter canvas)
 *   C. Network interface selector
 *   D. Connection information
 *   E. Session statistics
 *   F. Optional speed test panel
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { formatSpeed, formatBytes, formatDuration, formatDateTime } from './utils.js';
import { listInterfaces, getInterfaceType, getOperstate, detectDefaultInterface } from './netReader.js';
import { SpeedTester } from './speedTest.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const GRAPH_WIDTH  = 380;
const GRAPH_HEIGHT = 80;
const GRAPH_PAD    = 4;   // pixels of internal padding

// Download colour  (green-ish)
const DL_R = 0.17, DL_G = 0.77, DL_B = 0.42;
// Upload colour    (orange-ish)
const UL_R = 1.00, UL_G = 0.55, UL_B = 0.00;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create an St.Label with optional CSS classes.
 *
 * @param {string}   text
 * @param {string[]} classes
 * @returns {St.Label}
 */
function label(text, classes = []) {
    const l = new St.Label({ text, y_align: Clutter.ActorAlign.CENTER });
    for (const c of classes) l.add_style_class_name(c);
    return l;
}

/**
 * Create a horizontal box with two labels acting as a key-value row.
 *
 * @param {string} key
 * @param {string} value
 * @param {string} [valueClass]
 * @returns {{ row: St.BoxLayout, valueLabel: St.Label }}
 */
function kvRow(key, value, valueClass) {
    const row = new St.BoxLayout({ style_class: 'nsm-kv-row' });
    const keyLabel = label(key, ['nsm-key']);
    const valLabel = label(value, ['nsm-value', ...(valueClass ? [valueClass] : [])]);
    // Push value to the right.
    keyLabel.x_expand = true;
    row.add_child(keyLabel);
    row.add_child(valLabel);
    return { row, valueLabel: valLabel };
}

// ─── SpeedGraph ───────────────────────────────────────────────────────────────

/**
 * Clutter Canvas-backed graph that draws download and upload speed history.
 */
const SpeedGraph = GObject.registerClass(
class SpeedGraph extends St.DrawingArea {
    _init() {
        super._init({
            style_class: 'nsm-graph',
            width:  GRAPH_WIDTH,
            height: GRAPH_HEIGHT,
        });
        this._historyData = null;
        this._maxSpeed    = 1;

        this.connect('repaint', this._onRepaint.bind(this));

        try {
            this._themeChangeId = St.Settings.get().connect('notify::color-scheme', () => {
                this.queue_repaint();
            });
        } catch {
            this._themeChangeId = null;
        }
    }

    destroy() {
        if (this._themeChangeId) {
            try {
                St.Settings.get().disconnect(this._themeChangeId);
            } catch { /* ignore */ }
            this._themeChangeId = null;
        }
        super.destroy();
    }

    /**
     * Feed new normalised data and trigger a redraw.
     *
     * @param {{ xs: number[], dls: number[], uls: number[], maxSpeed: number }} data
     */
    update(data) {
        this._historyData = data;
        this._maxSpeed    = Math.max(data.maxSpeed, 1024); // ≥ 1 KB/s floor
        this.queue_repaint();
    }

    _onRepaint(area) {
        const cr   = area.get_context();
        const [aw, ah] = area.get_surface_size();
        const w = aw - GRAPH_PAD * 2;
        const h = ah - GRAPH_PAD * 2;

        let isLight = false;
        try {
            isLight = Main.getStyleVariant() === 'light';
        } catch {
            isLight = false;
        }

        // ── Background ──────────────────────────────────────────────────────
        if (isLight) {
            cr.setSourceRGBA(0, 0, 0, 0.04);
        } else {
            cr.setSourceRGBA(0, 0, 0, 0.25);
        }
        this._roundedRect(cr, 0, 0, aw, ah, 6);
        cr.fill();

        // ── Grid lines ──────────────────────────────────────────────────────
        if (isLight) {
            cr.setSourceRGBA(0, 0, 0, 0.08);
        } else {
            cr.setSourceRGBA(1, 1, 1, 0.08);
        }
        cr.setLineWidth(1);
        for (let i = 1; i < 4; i++) {
            const y = GRAPH_PAD + (h * i / 4);
            cr.moveTo(GRAPH_PAD, y);
            cr.lineTo(GRAPH_PAD + w, y);
            cr.stroke();
        }

        if (!this._historyData || this._historyData.xs.length < 2) {
            // No data — show placeholder text.
            if (isLight) {
                cr.setSourceRGBA(0, 0, 0, 0.45);
            } else {
                cr.setSourceRGBA(1, 1, 1, 0.3);
            }
            cr.selectFontFace('Sans', 0, 0);
            cr.setFontSize(11);
            const msg = 'No data yet…';
            const ext = cr.textExtents(msg);
            cr.moveTo(aw / 2 - ext.width / 2, ah / 2 + ext.height / 2);
            cr.showText(msg);
            cr.$dispose();
            return;
        }

        const { xs, dls, uls, maxSpeed } = this._historyData;
        const n = xs.length;

        // Adaptive series colors for strong visibility in both modes
        const dlR = isLight ? 0.08 : DL_R;
        const dlG = isLight ? 0.55 : DL_G;
        const dlB = isLight ? 0.25 : DL_B;

        const ulR = isLight ? 0.85 : UL_R;
        const ulG = isLight ? 0.38 : UL_G;
        const ulB = isLight ? 0.00 : UL_B;

        // ── Draw filled download area ────────────────────────────────────────
        this._drawSeries(cr, xs, dls, w, h, dlR, dlG, dlB, isLight ? 0.22 : 0.18, 0.85, true);

        // ── Draw filled upload area ──────────────────────────────────────────
        this._drawSeries(cr, xs, uls, w, h, ulR, ulG, ulB, isLight ? 0.18 : 0.14, 0.80, true);

        // ── Draw download line ───────────────────────────────────────────────
        this._drawSeries(cr, xs, dls, w, h, dlR, dlG, dlB, 1, 1.5, false);

        // ── Draw upload line ─────────────────────────────────────────────────
        this._drawSeries(cr, xs, uls, w, h, ulR, ulG, ulB, 1, 1.5, false);

        // ── Y-axis label: max speed ──────────────────────────────────────────
        const topLabel = formatSpeed(this._maxSpeed, 'auto', 1).full;
        if (isLight) {
            cr.setSourceRGBA(0, 0, 0, 0.65);
        } else {
            cr.setSourceRGBA(1, 1, 1, 0.45);
        }
        cr.selectFontFace('Monospace', 0, 0);
        cr.setFontSize(9);
        cr.moveTo(GRAPH_PAD + 2, GRAPH_PAD + 11);
        cr.showText(topLabel);

        cr.$dispose();
    }

    _drawSeries(cr, xs, ys, w, h, r, g, b, alpha, lineWidth, fill) {
        const maxSpd = this._maxSpeed;
        const n = xs.length;
        cr.newPath();
        const px0 = GRAPH_PAD + xs[0] * w;
        const py0 = GRAPH_PAD + h - (ys[0] / maxSpd) * h;
        cr.moveTo(px0, py0);
        for (let i = 1; i < n; i++) {
            cr.lineTo(GRAPH_PAD + xs[i] * w, GRAPH_PAD + h - (ys[i] / maxSpd) * h);
        }
        if (fill) {
            cr.lineTo(GRAPH_PAD + xs[n - 1] * w, GRAPH_PAD + h);
            cr.lineTo(GRAPH_PAD + xs[0] * w,     GRAPH_PAD + h);
            cr.closePath();
            cr.setSourceRGBA(r, g, b, alpha);
            cr.fill();
        } else {
            cr.setSourceRGBA(r, g, b, alpha);
            cr.setLineWidth(lineWidth);
            cr.stroke();
        }
    }

    _roundedRect(cr, x, y, w, h, r) {
        cr.newSubPath();
        cr.arc(x + w - r, y + r,     r, -Math.PI / 2, 0);
        cr.arc(x + w - r, y + h - r, r,  0,            Math.PI / 2);
        cr.arc(x + r,     y + h - r, r,  Math.PI / 2,  Math.PI);
        cr.arc(x + r,     y + r,     r,  Math.PI,      3 * Math.PI / 2);
        cr.closePath();
    }
});

// ─── Dashboard (PanelMenu.Button subclass) ────────────────────────────────────

export const Dashboard = GObject.registerClass(
class Dashboard extends PanelMenu.Button {
    /**
     * @param {object} params
     * @param {import('./netReader.js').NetReader}     params.netReader
     * @param {import('./historyBuffer.js').HistoryBuffer} params.historyBuffer
     * @param {import('resource:///org/gnome/shell/extensions/extension.js').Extension} params.extension
     */
    _init(params) {
        super._init(0.0, 'Net Speed Monitor');
        this.add_style_class_name('nsm-panel-button');

        this._netReader     = params.netReader;
        this._history       = params.historyBuffer;
        this._ext           = params.extension;
        this._settings      = params.extension.getSettings();
        this._speedTester   = new SpeedTester();
        this._lastSample    = null;

        // ── Panel indicator ──────────────────────────────────────────────────
        this._indicatorBox = new St.BoxLayout({
            style_class: 'nsm-indicator-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._indicatorBox);

        // Icon — a small network-wired icon.
        this._panelIcon = new St.Icon({
            icon_name: 'network-wired-symbolic',
            style_class: 'nsm-panel-icon system-status-icon',
        });
        this._indicatorBox.add_child(this._panelIcon);

        // Speed labels.
        this._dlLabel = new St.Label({
            text: '↓ —',
            style_class: 'nsm-dl-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._ulLabel = new St.Label({
            text: '↑ —',
            style_class: 'nsm-ul-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._indicatorBox.add_child(this._dlLabel);
        this._indicatorBox.add_child(this._ulLabel);

        // ── Build popup menu ─────────────────────────────────────────────────
        this._buildMenu();

        // Apply initial display mode.
        this._applyDisplayMode();
        this._settings.connect('changed::display-mode', () => this._applyDisplayMode());
        this._settings.connect('changed::use-fixed-width', () => this._applyDisplayMode());
        this._settings.connect('changed::show-icon', () => this._applyDisplayMode());
    }

    // ── Panel indicator update ────────────────────────────────────────────────

    /**
     * Update the panel label and dashboard values with a fresh sample.
     *
     * @param {import('./netReader.js').SampleResult} sample
     */
    updateSample(sample) {
        this._lastSample = sample;
        const unitKey    = this._settings.get_string('speed-unit');
        const mode       = this._settings.get_string('display-mode');

        const dl = sample.connected ? formatSpeed(sample.downloadBps, unitKey) : null;
        const ul = sample.connected ? formatSpeed(sample.uploadBps,   unitKey) : null;

        // ── Panel label ──────────────────────────────────────────────────────
        if (mode === 'icon-only') {
            this._dlLabel.set_text('');
            this._ulLabel.set_text('');
        } else if (mode === 'download') {
            this._dlLabel.set_text(dl ? `↓ ${dl.full}` : '↓ —');
            this._ulLabel.set_text('');
        } else if (mode === 'upload') {
            this._dlLabel.set_text('');
            this._ulLabel.set_text(ul ? `↑ ${ul.full}` : '↑ —');
        } else if (mode === 'compact') {
            const dlV = dl ? dl.value : '—';
            const ulV = ul ? ul.value : '—';
            const unit = dl ? dl.unit : '';
            this._dlLabel.set_text(`↓${dlV} ↑${ulV} ${unit}`);
            this._ulLabel.set_text('');
        } else {
            // 'both' (default)
            this._dlLabel.set_text(dl ? `↓ ${dl.full}` : '↓ —');
            this._ulLabel.set_text(ul ? `↑ ${ul.full}` : '↑ —');
        }

        // Update icon based on interface type.
        if (sample.iface) {
            const type = getInterfaceType(sample.iface);
            this._panelIcon.set_icon_name(
                type === 'Wi-Fi' ? 'network-wireless-symbolic' : 'network-wired-symbolic'
            );
        }

        // ── Dashboard live values ────────────────────────────────────────────
        if (this.menu.isOpen) this._refreshDashboard();
    }

    // ── Menu construction ─────────────────────────────────────────────────────

    _buildMenu() {
        const menu = this.menu;
        menu.removeAll();

        // Wrapper box for the entire popup content.
        const contentItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'nsm-popup-item',
        });

        const scrollView = new St.ScrollView({
            style_class: 'nsm-scrollview',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            enable_mouse_scrolling: true,
        });

        const root = new St.BoxLayout({
            vertical: true,
            style_class: 'nsm-dashboard',
            width: GRAPH_WIDTH + 24,
        });
        scrollView.add_child(root);
        contentItem.add_child(scrollView);
        menu.addMenuItem(contentItem);

        // ── A. Live stats ────────────────────────────────────────────────────
        this._buildStatsSection(root);
        root.add_child(this._separator());

        // ── B. Graph ────────────────────────────────────────────────────────
        this._buildGraphSection(root);
        root.add_child(this._separator());

        // ── C. Interface selector ────────────────────────────────────────────
        this._buildIfaceSection(root);
        root.add_child(this._separator());

        // ── D. Connection info ───────────────────────────────────────────────
        this._buildConnInfoSection(root);
        root.add_child(this._separator());

        // ── E. Session statistics ────────────────────────────────────────────
        this._buildSessionSection(root);

        // ── F. Speed test (optional) ─────────────────────────────────────────
        if (this._settings.get_boolean('speedtest-enabled')) {
            root.add_child(this._separator());
            this._buildSpeedTestSection(root);
        }

        // ── Settings link ────────────────────────────────────────────────────
        root.add_child(this._separator());
        const settingsBtn = new St.Button({
            label: 'Preferences…',
            style_class: 'nsm-prefs-btn',
            x_align: Clutter.ActorAlign.CENTER,
        });
        settingsBtn.connect('clicked', () => {
            this._ext.openPreferences();
            menu.close();
        });
        root.add_child(settingsBtn);

        // Refresh on open.
        menu.connect('open-state-changed', (m, open) => {
            if (open) {
                this._refreshDashboard();
                this._refreshIfaceList();
                this._refreshConnInfo();
            }
        });
    }

    // ── Section A: Live stats ─────────────────────────────────────────────────

    _buildStatsSection(parent) {
        const box = new St.BoxLayout({ vertical: true, style_class: 'nsm-section' });

        const title = label('Live Network Statistics', ['nsm-section-title']);
        box.add_child(title);

        const { row: dlRow, valueLabel: dlVal } = kvRow('Download', '—', 'nsm-dl-value');
        const { row: ulRow, valueLabel: ulVal } = kvRow('Upload', '—', 'nsm-ul-value');
        const { row: ifRow, valueLabel: ifVal } = kvRow('Interface', '—');
        const { row: stRow, valueLabel: stVal } = kvRow('Status', '—');
        const { row: upRow, valueLabel: upVal } = kvRow('Session uptime', '—');

        this._liveDlVal = dlVal;
        this._liveUlVal = ulVal;
        this._liveIfVal = ifVal;
        this._liveStVal = stVal;
        this._liveUpVal = upVal;

        for (const r of [dlRow, ulRow, ifRow, stRow, upRow])
            box.add_child(r);

        parent.add_child(box);
    }

    // ── Section B: Graph ──────────────────────────────────────────────────────

    _buildGraphSection(parent) {
        const box = new St.BoxLayout({ vertical: true, style_class: 'nsm-section' });

        // Header row: title + controls.
        const header = new St.BoxLayout({ style_class: 'nsm-graph-header' });

        const titleLbl = label('Speed Graph', ['nsm-section-title']);
        titleLbl.x_expand = true;
        header.add_child(titleLbl);

        // Pause/Resume button.
        this._pauseBtn = new St.Button({
            label: this._history.paused ? 'Resume' : 'Pause',
            style_class: 'nsm-small-btn',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pauseBtn.connect('clicked', () => {
            this._history.paused = !this._history.paused;
            this._settings.set_boolean('graph-paused', this._history.paused);
            this._pauseBtn.set_label(this._history.paused ? 'Resume' : 'Pause');
        });
        header.add_child(this._pauseBtn);
        box.add_child(header);

        // Legend.
        const legend = new St.BoxLayout({ style_class: 'nsm-graph-legend' });
        const dlDot = new St.Label({ text: '● ', style_class: 'nsm-dl-dot' });
        const dlLegend = label('Download', ['nsm-legend-label']);
        const ulDot = new St.Label({ text: '● ', style_class: 'nsm-ul-dot' });
        const ulLegend = label('Upload', ['nsm-legend-label']);
        for (const c of [dlDot, dlLegend, ulDot, ulLegend])
            legend.add_child(c);
        box.add_child(legend);

        // Graph canvas.
        this._graph = new SpeedGraph();
        box.add_child(this._graph);

        // Window selector.
        const winBox = new St.BoxLayout({ style_class: 'nsm-graph-windows' });
        const winLabel = label('History: ', ['nsm-key']);
        winBox.add_child(winLabel);
        for (const mins of [1, 5, 15, 30]) {
            const btn = new St.Button({
                label: `${mins}m`,
                style_class: 'nsm-window-btn',
                toggle_mode: true,
            });
            const currentWindow = this._settings.get_int('graph-history-minutes');
            if (mins === currentWindow) btn.set_checked(true);
            this._applyWindowBtnStyle(btn);
            btn.connect('clicked', () => {
                this._settings.set_int('graph-history-minutes', mins);
                this._history.windowMinutes = mins;
                // Deselect siblings.
                winBox.get_children().forEach(c => {
                    if (c instanceof St.Button && c !== btn) {
                        c.set_checked(false);
                        this._applyWindowBtnStyle(c);
                    }
                });
                btn.set_checked(true);
                this._applyWindowBtnStyle(btn);
            });
            winBox.add_child(btn);
        }
        box.add_child(winBox);

        parent.add_child(box);
    }

    _applyWindowBtnStyle(btn) {
        btn.remove_style_class_name('nsm-window-btn-active');
        if (btn.get_checked())
            btn.add_style_class_name('nsm-window-btn-active');
    }

    // ── Section C: Interface selector ─────────────────────────────────────────

    _buildIfaceSection(parent) {
        const box = new St.BoxLayout({ vertical: true, style_class: 'nsm-section' });
        const title = label('Network Interface', ['nsm-section-title']);
        box.add_child(title);

        const scroll = new St.ScrollView({
            style_class: 'nsm-iface-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            enable_mouse_scrolling: true,
        });

        this._ifaceListBox = new St.BoxLayout({ vertical: true, style_class: 'nsm-iface-list' });
        scroll.add_child(this._ifaceListBox);
        box.add_child(scroll);

        parent.add_child(box);
    }

    _refreshIfaceList() {
        const box    = this._ifaceListBox;
        box.remove_all_children();

        const ifaces  = listInterfaces();
        const autoIface = detectDefaultInterface();
        const current = this._settings.get_string('interface-mode') === 'auto'
            ? null
            : this._settings.get_string('interface-name');

        // Auto option.
        const autoBtn = this._ifaceButton(
            `Auto (${autoIface ?? 'none'})`,
            current === null,
            () => {
                this._settings.set_string('interface-mode', 'auto');
                this._netReader.setAutoMode();
                this._refreshIfaceList();
            }
        );
        box.add_child(autoBtn);

        // Sort interfaces:
        // 1. Up/active interfaces first
        // 2. Physical (en/wl) before virtual (docker/br/veth/lo)
        const sortedIfaces = [...ifaces].sort((a, b) => {
            const stateA = getOperstate(a);
            const stateB = getOperstate(b);
            if (stateA === 'up' && stateB !== 'up') return -1;
            if (stateA !== 'up' && stateB === 'up') return 1;

            const isVirtA = a.startsWith('lo') || a.startsWith('docker') || a.startsWith('br-') || a.startsWith('veth');
            const isVirtB = b.startsWith('lo') || b.startsWith('docker') || b.startsWith('br-') || b.startsWith('veth');
            if (!isVirtA && isVirtB) return -1;
            if (isVirtA && !isVirtB) return 1;

            return a.localeCompare(b);
        });

        for (const iface of sortedIfaces) {
            const state = getOperstate(iface);
            const type  = getInterfaceType(iface);
            const lbl   = `${iface}  (${type}, ${state})`;
            const btn   = this._ifaceButton(lbl, current === iface, () => {
                this._settings.set_string('interface-mode', 'manual');
                this._settings.set_string('interface-name', iface);
                this._netReader.setInterface(iface);
                this._refreshIfaceList();
            });
            box.add_child(btn);
        }
    }

    _ifaceButton(text, active, cb) {
        const btn = new St.Button({
            label: text,
            style_class: 'nsm-iface-btn' + (active ? ' nsm-iface-btn-active' : ''),
            x_align: Clutter.ActorAlign.START,
        });
        btn.connect('clicked', () => { cb(); this.menu.close(); });
        return btn;
    }

    // ── Section D: Connection info ────────────────────────────────────────────

    _buildConnInfoSection(parent) {
        const box = new St.BoxLayout({ vertical: true, style_class: 'nsm-section' });
        const title = label('Connection Info', ['nsm-section-title']);
        box.add_child(title);

        const { row: ciTypeRow, valueLabel: ciTypeVal } = kvRow('Type', '—');
        const { row: ciStateRow, valueLabel: ciStateVal } = kvRow('State', '—');
        const { row: ciSpeedRow, valueLabel: ciSpeedVal } = kvRow('Link speed', '—');

        this._ciTypeVal  = ciTypeVal;
        this._ciStateVal = ciStateVal;
        this._ciSpeedVal = ciSpeedVal;

        for (const r of [ciTypeRow, ciStateRow, ciSpeedRow])
            box.add_child(r);

        parent.add_child(box);
    }

    _refreshConnInfo() {
        const iface = this._lastSample?.iface;
        if (!iface) {
            this._ciTypeVal.set_text('—');
            this._ciStateVal.set_text('—');
            this._ciSpeedVal.set_text('—');
            return;
        }
        this._ciTypeVal.set_text(getInterfaceType(iface));
        this._ciStateVal.set_text(getOperstate(iface));

        // Read link speed from sysfs if available.
        try {
            const speedFile = `/sys/class/net/${iface}/speed`;
            const [ok, raw] = Gio.File.new_for_path(speedFile).load_contents(null);
            if (ok) {
                const speed = parseInt(new TextDecoder().decode(raw).trim(), 10);
                this._ciSpeedVal.set_text(isFinite(speed) && speed > 0 ? `${speed} Mb/s` : '—');
            } else {
                this._ciSpeedVal.set_text('—');
            }
        } catch {
            this._ciSpeedVal.set_text('—');
        }
    }

    // ── Section E: Session statistics ─────────────────────────────────────────

    _buildSessionSection(parent) {
        const box = new St.BoxLayout({ vertical: true, style_class: 'nsm-section' });
        const titleRow = new St.BoxLayout({ style_class: 'nsm-graph-header' });

        const title = label('Session Statistics', ['nsm-section-title']);
        title.x_expand = true;
        titleRow.add_child(title);

        const resetBtn = new St.Button({ label: 'Reset', style_class: 'nsm-small-btn' });
        resetBtn.connect('clicked', () => {
            this._netReader.resetSession();
            this._history.reset();
            this._refreshDashboard();
        });
        titleRow.add_child(resetBtn);
        box.add_child(titleRow);

        const { row: rxRow, valueLabel: rxVal } = kvRow('Total downloaded', '—');
        const { row: txRow, valueLabel: txVal } = kvRow('Total uploaded', '—');
        const { row: pkDlRow, valueLabel: pkDlVal } = kvRow('Peak download', '—', 'nsm-dl-value');
        const { row: pkUlRow, valueLabel: pkUlVal } = kvRow('Peak upload', '—', 'nsm-ul-value');
        const { row: avgDlRow, valueLabel: avgDlVal } = kvRow('Avg download', '—');
        const { row: avgUlRow, valueLabel: avgUlVal } = kvRow('Avg upload', '—');
        const { row: startRow, valueLabel: startVal } = kvRow('Session started', '—');

        this._sesRxVal   = rxVal;
        this._sesTxVal   = txVal;
        this._sesPkDlVal = pkDlVal;
        this._sesPkUlVal = pkUlVal;
        this._sesAvgDlVal = avgDlVal;
        this._sesAvgUlVal = avgUlVal;
        this._sesStartVal = startVal;

        for (const r of [rxRow, txRow, pkDlRow, pkUlRow, avgDlRow, avgUlRow, startRow])
            box.add_child(r);

        parent.add_child(box);
    }

    // ── Section F: Speed test ─────────────────────────────────────────────────

    _buildSpeedTestSection(parent) {
        const box = new St.BoxLayout({ vertical: true, style_class: 'nsm-section' });

        const headerRow = new St.BoxLayout({ style_class: 'nsm-graph-header' });
        const title = label('Speed Test', ['nsm-section-title']);
        title.x_expand = true;
        headerRow.add_child(title);
        box.add_child(headerRow);

        const disclaimer = label(
            '⚠ Tests consume bandwidth. Run only when needed.',
            ['nsm-disclaimer']
        );
        box.add_child(disclaimer);

        const btnRow = new St.BoxLayout({ style_class: 'nsm-btn-row' });

        this._testBtn = new St.Button({ label: 'Run Speed Test', style_class: 'nsm-test-btn' });
        this._cancelBtn = new St.Button({ label: 'Cancel', style_class: 'nsm-cancel-btn' });
        this._cancelBtn.set_reactive(false);
        this._cancelBtn.hide();

        this._testBtn.connect('clicked', () => this._runSpeedTest());
        this._cancelBtn.connect('clicked', () => this._speedTester.cancel());

        btnRow.add_child(this._testBtn);
        btnRow.add_child(this._cancelBtn);
        box.add_child(btnRow);

        this._testProgressLbl = label('', ['nsm-test-progress']);
        box.add_child(this._testProgressLbl);

        const { row: dlRow, valueLabel: dlVal } = kvRow('Download', '—', 'nsm-dl-value');
        const { row: ulRow, valueLabel: ulVal } = kvRow('Upload', '—', 'nsm-ul-value');
        const { row: latRow, valueLabel: latVal } = kvRow('Latency', '—');
        const { row: srvRow, valueLabel: srvVal } = kvRow('Server', '—');
        const { row: tsRow, valueLabel: tsVal } = kvRow('Tested at', '—');

        this._tstDlVal  = dlVal;
        this._tstUlVal  = ulVal;
        this._tstLatVal = latVal;
        this._tstSrvVal = srvVal;
        this._tstTsVal  = tsVal;

        for (const r of [dlRow, ulRow, latRow, srvRow, tsRow])
            box.add_child(r);

        parent.add_child(box);
    }

    async _runSpeedTest() {
        if (this._speedTester.state === 'running') return;

        this._testBtn.set_reactive(false);
        this._cancelBtn.set_reactive(true);
        this._cancelBtn.show();
        this._testProgressLbl.set_text('Starting…');

        await this._speedTester.run({
            onProgress: msg => {
                this._testProgressLbl.set_text(msg);
            },
            onResult: result => {
                this._testBtn.set_reactive(true);
                this._cancelBtn.set_reactive(false);
                this._cancelBtn.hide();

                if (result.error) {
                    this._testProgressLbl.set_text(`Error: ${result.error}`);
                    return;
                }

                this._testProgressLbl.set_text('');
                this._tstDlVal.set_text(result.downloadMbps !== null
                    ? `${result.downloadMbps.toFixed(2)} Mbps` : '—');
                this._tstUlVal.set_text(result.uploadMbps !== null
                    ? `${result.uploadMbps.toFixed(2)} Mbps` : '—');
                this._tstLatVal.set_text(result.latencyMs !== null
                    ? `${result.latencyMs} ms` : '—');
                this._tstSrvVal.set_text(result.server ?? '—');
                this._tstTsVal.set_text(formatDateTime(result.timestamp));
            },
        });
    }

    // ── Dashboard refresh ─────────────────────────────────────────────────────

    _refreshDashboard() {
        const sample  = this._lastSample;
        const unitKey = this._settings.get_string('speed-unit');
        const reader  = this._netReader;

        // Live stats.
        if (sample?.connected) {
            this._liveDlVal.set_text(formatSpeed(sample.downloadBps, unitKey).full);
            this._liveUlVal.set_text(formatSpeed(sample.uploadBps,   unitKey).full);
            this._liveIfVal.set_text(sample.iface ?? '—');
            this._liveStVal.set_text('Connected');
        } else {
            this._liveDlVal.set_text('—');
            this._liveUlVal.set_text('—');
            this._liveIfVal.set_text(sample?.iface ?? '—');
            this._liveStVal.set_text('Disconnected');
        }

        const uptime = (Date.now() - reader.sessionStart) / 1000;
        this._liveUpVal.set_text(formatDuration(uptime));

        // Graph.
        const data = this._history.getNormalized();
        this._graph.update(data);

        // Session stats.
        this._sesRxVal.set_text(formatBytes(reader.sessionDownloadBytes));
        this._sesTxVal.set_text(formatBytes(reader.sessionUploadBytes));
        this._sesPkDlVal.set_text(formatSpeed(this._history.peakDownloadBps, unitKey).full);
        this._sesPkUlVal.set_text(formatSpeed(this._history.peakUploadBps,   unitKey).full);

        const avgs = this._history.getAverages();
        this._sesAvgDlVal.set_text(formatSpeed(avgs.avgDl, unitKey).full);
        this._sesAvgUlVal.set_text(formatSpeed(avgs.avgUl, unitKey).full);
        this._sesStartVal.set_text(formatDateTime(new Date(reader.sessionStart)));

        // Connection info.
        this._refreshConnInfo();
    }

    // ── Display mode ──────────────────────────────────────────────────────────

    _applyDisplayMode() {
        const mode = this._settings.get_string('display-mode');
        const fixed = this._settings.get_boolean('use-fixed-width');
        const showIcon = this._settings.get_boolean('show-icon');

        if (mode === 'icon-only') {
            this._panelIcon.show();
            this._dlLabel.hide();
            this._ulLabel.hide();
        } else {
            if (showIcon)
                this._panelIcon.show();
            else
                this._panelIcon.hide();

            if (mode === 'download') {
                this._dlLabel.show();
                this._ulLabel.hide();
            } else if (mode === 'upload') {
                this._dlLabel.hide();
                this._ulLabel.show();
            } else if (mode === 'compact') {
                this._dlLabel.show();
                this._ulLabel.hide();
            } else {
                // 'both'
                this._dlLabel.show();
                this._ulLabel.show();
            }
        }

        // Apply fixed width to prevent panel shifting.
        const labelWidth = fixed ? '62px' : '';
        this._dlLabel.set_style(`min-width: ${labelWidth}; font-family: monospace;`);
        this._ulLabel.set_style(`min-width: ${labelWidth}; font-family: monospace;`);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _separator() {
        return new St.Widget({
            style_class: 'nsm-separator',
            height: 1,
            x_expand: true,
        });
    }

    // ── Destructor ────────────────────────────────────────────────────────────

    destroy() {
        if (this._speedTester.state === 'running')
            this._speedTester.cancel();
        super.destroy();
    }
});
