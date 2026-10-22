// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Parikshan
/**
 * notifications.js — Smart notification manager.
 *
 * Fires optional user-configurable notifications for:
 *   - Sustained high-bandwidth utilisation.
 *   - Network disconnection.
 *   - Network reconnection.
 *
 * Uses thresholds, cooldowns, and debouncing to prevent spam.
 * Disabled by default.
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { formatSpeed } from './utils.js';

/** How many consecutive high samples before firing a threshold notification. */
const HIGH_BW_DEBOUNCE_COUNTS = 5;

export class NotificationManager {
    constructor(settings) {
        this._settings = settings;
        this._source   = null;

        // State tracking.
        this._wasConnected     = true;
        this._highBwCount      = 0;
        this._lastNotifyTime   = 0;   // ms epoch of last notification
    }

    /**
     * Evaluate the current sample and fire notifications if warranted.
     *
     * @param {import('./netReader.js').SampleResult} sample
     */
    evaluate(sample) {
        if (!this._settings.get_boolean('notifications-enabled')) return;

        const now = Date.now();
        const cooldownMs = this._settings.get_int('notification-cooldown-seconds') * 1000;

        // ── Disconnection / Reconnection ────────────────────────────────────
        if (this._wasConnected && !sample.connected) {
            this._wasConnected = false;
            if (now - this._lastNotifyTime >= cooldownMs) {
                this._notify(
                    'Network Disconnected',
                    `Interface ${sample.iface ?? 'unknown'} went offline.`,
                    'network-offline-symbolic'
                );
                this._lastNotifyTime = now;
            }
        } else if (!this._wasConnected && sample.connected) {
            this._wasConnected = true;
            if (now - this._lastNotifyTime >= cooldownMs) {
                this._notify(
                    'Network Reconnected',
                    `Interface ${sample.iface ?? 'unknown'} is back online.`,
                    'network-wired-symbolic'
                );
                this._lastNotifyTime = now;
            }
        }

        // ── High-bandwidth threshold ─────────────────────────────────────────
        const thresholdMbps = this._settings.get_double('notification-threshold-mbps');
        if (thresholdMbps > 0 && sample.connected) {
            const combinedBps = sample.downloadBps + sample.uploadBps;
            const thresholdBps = thresholdMbps * 1_000_000;

            if (combinedBps >= thresholdBps) {
                this._highBwCount++;
                if (
                    this._highBwCount >= HIGH_BW_DEBOUNCE_COUNTS &&
                    now - this._lastNotifyTime >= cooldownMs
                ) {
                    const dl = formatSpeed(sample.downloadBps, 'auto').full;
                    const ul = formatSpeed(sample.uploadBps,   'auto').full;
                    this._notify(
                        'High Network Usage',
                        `Sustained traffic: ↓ ${dl}  ↑ ${ul}`,
                        'network-wired-symbolic'
                    );
                    this._lastNotifyTime = now;
                    this._highBwCount    = 0;
                }
            } else {
                this._highBwCount = 0;
            }
        }
    }

    _notify(title, body, iconName = 'network-wired-symbolic') {
        try {
            if (!this._source || this._source.isDestroyed) {
                this._source = new MessageTray.Source({
                    title: 'Net Speed Monitor',
                    icon_name: iconName,
                });
                Main.messageTray.add(this._source);
            }

            const notification = new MessageTray.Notification({
                source: this._source,
                title,
                body,
                isTransient: true,
            });

            this._source.addNotification(notification);
        } catch (e) {
            // Notification failure must not crash the extension.
            logError(e, 'NSM notifications: notify failed');
        }
    }

    destroy() {
        // Nothing to clean up; notifications are managed by messageTray.
    }
}
