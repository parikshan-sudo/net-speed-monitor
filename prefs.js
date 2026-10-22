// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Parikshan
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
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ExtensionPreferences, gettext as _ } from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class NetSpeedMonitorPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(620, 720);

        // Register custom icons directory with GtkIconTheme if available
        const display = Gdk.Display.get_default();
        if (display && this.path) {
            const iconTheme = Gtk.IconTheme.get_for_display(display);
            const iconsPath = GLib.build_filenamev([this.path, 'icons']);
            if (!iconTheme.get_search_path().includes(iconsPath)) {
                iconTheme.add_search_path(iconsPath);
            }
        }

        // ── Page 1: Monitoring ───────────────────────────────────────────────
        const monPage = new Adw.PreferencesPage({
            title: _('Monitoring'),
            icon_name: 'network-wired-symbolic',
        });
        window.add(monPage);

        // General group.
        const genGroup = new Adw.PreferencesGroup({ title: _('General') });
        monPage.add(genGroup);

        genGroup.add(this._switchRow('monitoring-enabled', _('Enable Monitoring'),
            _('Turn live network speed monitoring on or off.'), settings));

        genGroup.add(this._spinRow('refresh-interval', _('Refresh Interval (ms)'),
            _('How often to sample network counters. 1000 ms recommended.'),
            500, 10000, 100, settings));

        // Display group.
        const dispGroup = new Adw.PreferencesGroup({ title: _('Panel Display') });
        monPage.add(dispGroup);

        dispGroup.add(this._comboRow('display-mode', _('Display Mode'),
            _('What to show in the top panel indicator.'),
            [
                { value: 'both',      label: _('Download + Upload') },
                { value: 'download',  label: _('Download only') },
                { value: 'upload',    label: _('Upload only') },
                { value: 'compact',   label: _('Compact combined') },
                { value: 'icon-only', label: _('Icon only') },
            ],
            settings));

        dispGroup.add(this._comboRow('speed-unit', _('Speed Units'),
            _('Units used for displayed transfer rates.'),
            [
                { value: 'dynamic-bytes', label: _('Dynamic (KB/s, MB/s, GB/s)') },
                { value: 'bytes',         label: _('Force Bytes (B/s)') },
                { value: 'kilobytes',     label: _('Force Kilobytes (KB/s)') },
                { value: 'megabytes',     label: _('Force Megabytes (MB/s)') },
                { value: 'gigabytes',     label: _('Force Gigabytes (GB/s)') },
                { value: 'dynamic-bits',  label: _('Dynamic Bits (Kbps, Mbps, Gbps)') },
                { value: 'bits',          label: _('Force Bits (bps)') },
                { value: 'kilobits',      label: _('Force Kilobits (Kbps)') },
                { value: 'megabits',      label: _('Force Megabits (Mbps)') },
                { value: 'gigabits',      label: _('Force Gigabits (Gbps)') },
            ],
            settings));

        dispGroup.add(this._spinRow('decimal-places', _('Decimal Places'),
            _('Number of decimal digits shown in speeds (0 to 3).'),
            0, 3, 1, settings));

        dispGroup.add(this._comboRow('speed-display-type', _('Indicator Label'),
            _('Short prefix style in the panel indicator.'),
            [
                { value: 'arrows',   label: 'Arrows (↓ / ↑)' },
                { value: 'letters',  label: 'Letters (D: / U:)' },
                { value: 'words',    label: 'Words (In: / Out:)' },
                { value: 'none',     label: _('None (numbers only)') },
            ],
            settings));

        // ── Page 2: Interface ─────────────────────────────────────────────────
        const ifPage = new Adw.PreferencesPage({
            title: _('Interface'),
            icon_name: 'network-workgroup-symbolic',
        });
        window.add(ifPage);

        const ifGroup = new Adw.PreferencesGroup({
            title: _('Interface Selection'),
            description: _('Choose which network interfaces to monitor.'),
        });
        ifPage.add(ifGroup);

        ifGroup.add(this._comboRow('interface-mode', _('Selection Mode'),
            _('Auto selects the active default route. All combines all interfaces.'),
            [
                { value: 'auto',     label: _('Auto (default gateway)') },
                { value: 'all',      label: _('All (sum all active)') },
                { value: 'specific', label: _('Specific interface') },
            ],
            settings));

        const ifNameRow = new Adw.EntryRow({
            title: _('Interface Name'),
            show_apply_button: true,
        });
        ifNameRow.set_text(settings.get_string('interface-name'));
        ifNameRow.connect('apply', () => {
            settings.set_string('interface-name', ifNameRow.get_text().trim());
        });
        ifGroup.add(ifNameRow);

        // ── Page 3: Graph & History ──────────────────────────────────────────
        const graphPage = new Adw.PreferencesPage({
            title: _('Graph'),
            icon_name: 'utilities-system-monitor-symbolic',
        });
        window.add(graphPage);

        const graphGroup = new Adw.PreferencesGroup({ title: _('Graph Settings') });
        graphPage.add(graphGroup);

        graphGroup.add(this._spinRow('graph-history-minutes', _('History Window (minutes)'),
            _('How many minutes of history to display in the speed graph.'),
            1, 30, 1, settings));

        // History persistence group.
        const histGroup = new Adw.PreferencesGroup({ title: _('Historical Storage') });
        graphPage.add(histGroup);

        histGroup.add(this._switchRow('history-enabled', _('Enable Historical Storage'),
            _('Save daily network totals and peak speeds to disk.'),
            settings));

        histGroup.add(this._spinRow('history-retention-days', _('Retention (days)'),
            _('How many days of historical data to keep.'),
            1, 365, 1, settings));

        // ── Page 4: Notifications ─────────────────────────────────────────────
        const notifPage = new Adw.PreferencesPage({
            title: _('Notifications'),
            icon_name: 'preferences-system-notifications-symbolic',
        });
        window.add(notifPage);

        const notifGroup = new Adw.PreferencesGroup({
            title: _('Smart Notifications'),
            description: _('Optional notifications for network events. Disabled by default to prevent disruption.'),
        });
        notifPage.add(notifGroup);

        notifGroup.add(this._switchRow('notifications-enabled', _('Enable Notifications'),
            _('Enable or disable all smart notifications.'), settings));

        notifGroup.add(this._spinDoubleRow('notification-threshold-mbps',
            _('High-Usage Threshold (MB/s)'),
            _('Send a notification when combined traffic exceeds this rate. 0 = disabled.'),
            0.0, 10000.0, 1.0, settings));

        notifGroup.add(this._spinRow('notification-cooldown-seconds',
            _('Notification Cooldown (seconds)'),
            _('Minimum time between repeated notifications.'),
            10, 3600, 10, settings));

        // ── Page 5: Speed Test ────────────────────────────────────────────────
        const testPage = new Adw.PreferencesPage({
            title: _('Speed Test'),
            icon_name: 'network-transmit-receive-symbolic',
        });
        window.add(testPage);

        const testGroup = new Adw.PreferencesGroup({
            title: _('Optional Speed Test'),
            description: _("The speed test actively transfers data to measure your connection. It uses Cloudflare's public speed test API. No account required. Tests run only on explicit request."),
        });
        testPage.add(testGroup);

        testGroup.add(this._switchRow('speedtest-enabled', _('Show Speed Test in Dashboard'),
            _('Enable or disable the speed test panel in the dashboard.'),
            settings));

        // ── Page 6: About & Standards ─────────────────────────────────────────
        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const aboutAppGroup = new Adw.PreferencesGroup();
        aboutPage.add(aboutAppGroup);

        const appHeaderRow = new Adw.ActionRow({
            title: 'Net Speed Monitor',
            subtitle: _('Real-time internet download & upload monitor for GNOME Shell'),
            icon_name: 'net-speed-monitor',
        });
        const creditsBtn = new Gtk.Button({
            label: _('About Net Speed Monitor'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        creditsBtn.connect('clicked', () => this._showAboutDialog(window));
        appHeaderRow.add_suffix(creditsBtn);
        aboutAppGroup.add(appHeaderRow);

        const verRow = new Adw.ActionRow({
            title: _('Version'),
            subtitle: '1.0.0 (GNOME 45 – 50)',
        });
        aboutAppGroup.add(verRow);

        const devRow = new Adw.ActionRow({
            title: _('Developer'),
            subtitle: 'Parikshan',
        });
        aboutAppGroup.add(devRow);

        const linksGroup = new Adw.PreferencesGroup({ title: _('Links & Community') });
        aboutPage.add(linksGroup);

        const repoRow = new Adw.ActionRow({
            title: _('GitHub Repository'),
            subtitle: 'https://github.com/parikshan-sudo/net-speed-monitor',
            activatable: true,
        });
        repoRow.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));
        repoRow.connect('activated', () => {
            Gio.AppInfo.launch_default_for_uri('https://github.com/parikshan-sudo/net-speed-monitor', null);
        });
        linksGroup.add(repoRow);

        const issuesRow = new Adw.ActionRow({
            title: _('Issue Tracker & Feature Requests'),
            subtitle: 'https://github.com/parikshan-sudo/net-speed-monitor/issues',
            activatable: true,
        });
        issuesRow.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));
        issuesRow.connect('activated', () => {
            Gio.AppInfo.launch_default_for_uri('https://github.com/parikshan-sudo/net-speed-monitor/issues', null);
        });
        linksGroup.add(issuesRow);

        const licenseRow = new Adw.ActionRow({
            title: _('License'),
            subtitle: 'GNU General Public License v3.0 or later (GPL-3.0-or-later)',
        });
        linksGroup.add(licenseRow);
    }

    _showAboutDialog(window) {
        const params = {
            application_name: 'Net Speed Monitor',
            application_icon: 'net-speed-monitor',
            developer_name: 'Parikshan',
            version: '1.0.0',
            website: 'https://github.com/parikshan-sudo/net-speed-monitor',
            issue_url: 'https://github.com/parikshan-sudo/net-speed-monitor/issues',
            license_type: Gtk.License.GPL_3_0,
            copyright: '© 2026 Parikshan',
            comments: _('Real-time internet speed monitor in the top panel with live graph, session statistics, speed test, and configurable interface selection.'),
        };

        if (Adw.AboutDialog) {
            const dialog = new Adw.AboutDialog(params);
            dialog.present(window);
        } else if (Adw.AboutWindow) {
            const win = new Adw.AboutWindow(Object.assign({
                transient_for: window,
                modal: true,
            }, params));
            win.present();
        }
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
