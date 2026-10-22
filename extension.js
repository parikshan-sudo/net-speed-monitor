// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Parikshan
/**
 * extension.js — Main extension lifecycle controller.
 *
 * Orchestrates:
 *   - NetReader (network statistics sampling)
 *   - HistoryBuffer (graph data store)
 *   - Dashboard (panel indicator + popup)
 *   - NotificationManager
 *   - PersistenceManager (optional)
 *   - GLib.timeout polling loop
 *
 * GNOME 45+ ESM module style (ES6 imports, default export class).
 *
 * Net Speed Monitor — GNOME Shell Extension
 * Ubuntu 26.04 / GNOME Shell 50.x
 */

import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { NetReader } from './netReader.js';
import { HistoryBuffer } from './historyBuffer.js';
import { Dashboard } from './dashboard.js';
import { NotificationManager } from './notifications.js';
import { PersistenceManager } from './persistence.js';
import { monotonicSeconds } from './utils.js';

export default class NetSpeedMonitorExtension extends Extension {
    enable() {
        this._settings  = this.getSettings();
        this._reader    = new NetReader();
        this._history   = new HistoryBuffer(
            this._settings.get_int('graph-history-minutes')
        );
        this._notifs    = new NotificationManager(this._settings);
        this._persist   = new PersistenceManager();

        // Restore persistence setting.
        this._persist.setEnabled(this._settings.get_boolean('history-enabled'));
        this._history.paused = this._settings.get_boolean('graph-paused');

        // Apply initial interface setting.
        const ifaceMode = this._settings.get_string('interface-mode');
        if (ifaceMode === 'manual') {
            const ifaceName = this._settings.get_string('interface-name');
            if (ifaceName) this._reader.setInterface(ifaceName);
        } else {
            this._reader.setAutoMode();
        }

        // Connect settings changes.
        this._settingsConns = [
            this._settings.connect('changed::monitoring-enabled', () => {
                if (this._settings.get_boolean('monitoring-enabled'))
                    this._startTimer();
                else
                    this._stopTimer();
            }),
            this._settings.connect('changed::refresh-interval', () => {
                this._stopTimer();
                this._startTimer();
            }),
            this._settings.connect('changed::graph-history-minutes', () => {
                this._history.windowMinutes =
                    this._settings.get_int('graph-history-minutes');
            }),
            this._settings.connect('changed::history-enabled', () => {
                this._persist.setEnabled(
                    this._settings.get_boolean('history-enabled')
                );
            }),
        ];

        // Build panel indicator.
        this._dashboard = new Dashboard({
            netReader:     this._reader,
            historyBuffer: this._history,
            extension:     this,
        });

        // Add to panel: right zone, before the status area indicators.
        Main.panel.addToStatusArea('net-speed-monitor', this._dashboard, 1, 'right');

        // Flush persistence every 60 seconds.
        this._persistTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT_IDLE,
            60,
            () => {
                this._persist.flush(this._settings.get_int('history-retention-days'));
                return GLib.SOURCE_CONTINUE;
            }
        );

        // Start the main polling loop.
        if (this._settings.get_boolean('monitoring-enabled'))
            this._startTimer();
    }

    disable() {
        // Stop timers first to prevent callbacks firing during teardown.
        this._stopTimer();

        if (this._persistTimer) {
            GLib.source_remove(this._persistTimer);
            this._persistTimer = null;
        }

        // Flush remaining data.
        if (this._persist) {
            this._persist.flush(this._settings?.get_int('history-retention-days') ?? 30);
        }

        // Disconnect settings signals.
        if (this._settingsConns) {
            for (const id of this._settingsConns)
                this._settings?.disconnect(id);
            this._settingsConns = null;
        }

        // Destroy panel indicator (also destroys the popup).
        if (this._dashboard) {
            this._dashboard.destroy();
            this._dashboard = null;
        }

        this._reader  = null;
        this._history = null;
        this._notifs?.destroy();
        this._notifs  = null;
        this._persist = null;
        this._settings = null;
    }

    // ── Timer management ──────────────────────────────────────────────────────

    _startTimer() {
        if (this._timerId) return; // Guard against duplicates.

        const intervalMs = this._settings.get_int('refresh-interval');

        this._timerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            intervalMs,
            () => {
                try {
                    this._tick();
                } catch (e) {
                    logError(e, 'NSM: tick error');
                }
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
    }

    // ── Per-tick update ───────────────────────────────────────────────────────

    _tick() {
        const sample = this._reader.sample();

        // Push to history buffer.
        this._history.push(
            monotonicSeconds(),
            sample.downloadBps,
            sample.uploadBps
        );

        // Update panel indicator + open dashboard (if open).
        if (this._dashboard)
            this._dashboard.updateSample(sample);

        // Notifications.
        if (this._notifs)
            this._notifs.evaluate(sample);

        // Persist delta bytes (persistence manager tracks its own deltas
        // via the reader's session counters — we just forward the current
        // rates so it can update peaks).
        if (this._persist?.enabled) {
            // Compute per-tick byte deltas from rates × interval.
            const intervalSec = this._settings.get_int('refresh-interval') / 1000;
            this._persist.record(
                Math.round(sample.downloadBps * intervalSec),
                Math.round(sample.uploadBps   * intervalSec),
                sample.downloadBps,
                sample.uploadBps
            );
        }
    }
}
