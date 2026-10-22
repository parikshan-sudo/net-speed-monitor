/**
 * prefs.js — Extension preferences window.
 *
 * Uses GTK4 + libadwaita (Adw) as required for GNOME 45+ extensions.
 * Opens via `gnome-extensions prefs net-speed-monitor@pnr.tech` or
 * from the GNOME Extensions app.
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ExtensionPreferences, gettext as _ } from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class NetSpeedMonitorPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(620, 700);

        // ── Page 1: Monitoring ───────────────────────────────────────────────
        const monPage = new Adw.PreferencesPage({
            title: 'Monitoring',
            icon_name: 'network-wired-symbolic',
        });
        window.add(monPage);

        // General group.
        const genGroup = new Adw.PreferencesGroup({ title: 'General' });
        monPage.add(genGroup);

        genGroup.add(this._switchRow('monitoring-enabled', 'Enable Monitoring',
            'Turn live network speed monitoring on or off.', settings));

        genGroup.add(this._spinRow('refresh-interval', 'Refresh Interval (ms)',
            'How often to sample network counters. 1000 ms recommended.',
            500, 10000, 100, settings));

        // Display group.
        const dispGroup = new Adw.PreferencesGroup({ title: 'Panel Display' });
        monPage.add(dispGroup);

        dispGroup.add(this._comboRow('display-mode', 'Display Mode',
            'What to show in the top panel indicator.',
            [
                { value: 'both',      label: 'Download + Upload' },
                { value: 'download',  label: 'Download only' },
                { value: 'upload',    label: 'Upload only' },
                { value: 'compact',   label: 'Compact combined' },
                { value: 'icon-only', label: 'Icon only' },
            ],
            settings));

        dispGroup.add(this._comboRow('speed-unit', 'Speed Units',
            'Units used for displayed transfer rates.',
            [
                { value: 'auto',  label: 'Automatic (decimal)' },
                { value: 'MBps',  label: 'MB/s (megabytes/s)' },
                { value: 'KBps',  label: 'KB/s (kilobytes/s)' },
                { value: 'MiBps', label: 'MiB/s (mebibytes/s)' },
                { value: 'KiBps', label: 'KiB/s (kibibytes/s)' },
                { value: 'Bps',   label: 'B/s (bytes/s)' },
            ],
            settings));

        dispGroup.add(this._switchRow('use-fixed-width', 'Fixed-Width Labels',
            'Prevent panel labels from shifting when speed values change width.',
            settings));

        dispGroup.add(this._switchRow('show-icon', 'Show Network Icon',
            'Display network interface icon next to speed counters in the top panel.',
            settings));

        // ── Page 2: Interface ────────────────────────────────────────────────
        const ifPage = new Adw.PreferencesPage({
            title: 'Interface',
            icon_name: 'preferences-system-network-symbolic',
        });
        window.add(ifPage);

        const ifGroup = new Adw.PreferencesGroup({
            title: 'Network Interface',
            description: 'Automatic mode selects the interface with the default route. ' +
                         'Manual mode lets you pin a specific interface.',
        });
        ifPage.add(ifGroup);

        ifGroup.add(this._comboRow('interface-mode', 'Selection Mode',
            'How to choose the monitored interface.',
            [
                { value: 'auto',   label: 'Automatic (default route)' },
                { value: 'manual', label: 'Manual' },
            ],
            settings));

        const ifNameRow = new Adw.EntryRow({
            title: 'Interface Name',
            show_apply_button: true,
        });
        ifNameRow.set_text(settings.get_string('interface-name'));
        ifNameRow.connect('apply', () => {
            settings.set_string('interface-name', ifNameRow.get_text().trim());
        });
        ifGroup.add(ifNameRow);

        // ── Page 3: Graph & History ──────────────────────────────────────────
        const graphPage = new Adw.PreferencesPage({
            title: 'Graph',
            icon_name: 'utilities-system-monitor-symbolic',
        });
        window.add(graphPage);

        const graphGroup = new Adw.PreferencesGroup({ title: 'Graph Settings' });
        graphPage.add(graphGroup);

        graphGroup.add(this._spinRow('graph-history-minutes', 'History Window (minutes)',
            'How many minutes of history to display in the speed graph.',
            1, 30, 1, settings));

        // History persistence group.
        const histGroup = new Adw.PreferencesGroup({ title: 'Historical Storage' });
        graphPage.add(histGroup);

        histGroup.add(this._switchRow('history-enabled', 'Enable Historical Storage',
            'Save daily network totals and peak speeds to disk.',
            settings));

        histGroup.add(this._spinRow('history-retention-days', 'Retention (days)',
            'How many days of historical data to keep.',
            1, 365, 1, settings));

        // ── Page 4: Notifications ─────────────────────────────────────────────
        const notifPage = new Adw.PreferencesPage({
            title: 'Notifications',
            icon_name: 'preferences-system-notifications-symbolic',
        });
        window.add(notifPage);

        const notifGroup = new Adw.PreferencesGroup({
            title: 'Smart Notifications',
            description: 'Optional notifications for network events. ' +
                         'Disabled by default to prevent disruption.',
        });
        notifPage.add(notifGroup);

        notifGroup.add(this._switchRow('notifications-enabled', 'Enable Notifications',
            'Enable or disable all smart notifications.', settings));

        notifGroup.add(this._spinDoubleRow('notification-threshold-mbps',
            'High-Usage Threshold (MB/s)',
            'Send a notification when combined traffic exceeds this rate. 0 = disabled.',
            0.0, 10000.0, 1.0, settings));

        notifGroup.add(this._spinRow('notification-cooldown-seconds',
            'Notification Cooldown (seconds)',
            'Minimum time between repeated notifications.',
            10, 3600, 10, settings));

        // ── Page 5: Speed Test ────────────────────────────────────────────────
        const testPage = new Adw.PreferencesPage({
            title: 'Speed Test',
            icon_name: 'network-transmit-receive-symbolic',
        });
        window.add(testPage);

        const testGroup = new Adw.PreferencesGroup({
            title: 'Optional Speed Test',
            description: 'The speed test actively transfers data to measure your connection. ' +
                         'It uses Cloudflare\'s public speed test API. ' +
                         'No account required. Tests run only on explicit request.',
        });
        testPage.add(testGroup);

        testGroup.add(this._switchRow('speedtest-enabled', 'Show Speed Test in Dashboard',
            'Enable or disable the speed test panel in the dashboard.',
            settings));
    }

    // ── Widget factories ──────────────────────────────────────────────────────

    _switchRow(key, title, subtitle, settings) {
        const row = new Adw.SwitchRow({ title, subtitle });
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _spinRow(key, title, subtitle, min, max, step, settings) {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({
                lower: min, upper: max,
                step_increment: step,
                value: settings.get_int(key),
            }),
        });
        row.connect('notify::value', () => settings.set_int(key, row.get_value()));
        settings.connect(`changed::${key}`, () => row.set_value(settings.get_int(key)));
        return row;
    }

    _spinDoubleRow(key, title, subtitle, min, max, step, settings) {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            digits: 1,
            adjustment: new Gtk.Adjustment({
                lower: min, upper: max,
                step_increment: step,
                value: settings.get_double(key),
            }),
        });
        row.connect('notify::value', () => settings.set_double(key, row.get_value()));
        settings.connect(`changed::${key}`, () => row.set_value(settings.get_double(key)));
        return row;
    }

    _comboRow(key, title, subtitle, choices, settings) {
        const model = new Gtk.StringList();
        choices.forEach(c => model.append(c.label));

        const row = new Adw.ComboRow({ title, subtitle, model });
        const current = settings.get_string(key);
        const idx = choices.findIndex(c => c.value === current);
        row.set_selected(idx >= 0 ? idx : 0);

        row.connect('notify::selected', () => {
            const sel = row.get_selected();
            if (sel >= 0 && sel < choices.length)
                settings.set_string(key, choices[sel].value);
        });
        settings.connect(`changed::${key}`, () => {
            const val = settings.get_string(key);
            const i   = choices.findIndex(c => c.value === val);
            if (i >= 0) row.set_selected(i);
        });
        return row;
    }
}
