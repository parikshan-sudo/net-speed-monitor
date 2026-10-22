/**
 * utils.js — Formatting, unit conversion, and small helpers.
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

'use strict';

// ─── Unit definitions ────────────────────────────────────────────────────────

/** All supported unit descriptors. */
export const UNITS = {
    Bps:   { divisor: 1,          label: 'B/s'   },
    KBps:  { divisor: 1_000,      label: 'KB/s'  },
    MBps:  { divisor: 1_000_000,  label: 'MB/s'  },
    KiBps: { divisor: 1_024,      label: 'KiB/s' },
    MiBps: { divisor: 1_048_576,  label: 'MiB/s' },
};

/**
 * Format a speed value (bytes/s) to a human-readable string.
 *
 * @param {number}  bytesPerSec  Raw speed in bytes per second.
 * @param {string}  unitKey      One of the UNITS keys, or 'auto'.
 * @param {number}  [decimals=1] Decimal places to show.
 * @returns {{ value: string, unit: string, full: string }}
 */
export function formatSpeed(bytesPerSec, unitKey = 'auto', decimals = 1) {
    if (!isFinite(bytesPerSec) || bytesPerSec < 0)
        bytesPerSec = 0;

    let divisor, label;

    if (unitKey === 'auto') {
        // Auto-scale using decimal units.
        if (bytesPerSec >= 1_000_000) {
            divisor = 1_000_000;
            label   = 'MB/s';
        } else if (bytesPerSec >= 1_000) {
            divisor = 1_000;
            label   = 'KB/s';
        } else {
            divisor = 1;
            label   = 'B/s';
        }
    } else {
        const u = UNITS[unitKey] ?? UNITS.MBps;
        divisor = u.divisor;
        label   = u.label;
    }

    const value = (bytesPerSec / divisor).toFixed(decimals);
    return { value, unit: label, full: `${value} ${label}` };
}

/**
 * Format a byte count as a human-readable total (e.g. "1.24 GB").
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GiB`;
    if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(2)} MiB`;
    if (bytes >= 1_024)         return `${(bytes / 1_024).toFixed(1)} KiB`;
    return `${bytes} B`;
}

/**
 * Format a duration in seconds to a human-readable string.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

/**
 * Format a Date object as a local time/date string.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
    if (!(date instanceof Date) || isNaN(date)) return '—';
    return date.toLocaleString();
}

/**
 * Clamp a number between min and max.
 *
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Return a monotonic time in seconds with millisecond resolution,
 * derived from GLib.get_monotonic_time() if available, else Date.now().
 *
 * @returns {number}
 */
export function monotonicSeconds() {
    try {
        // GLib is available in the Shell process context.
        const { GLib } = imports.gi; // eslint-disable-line no-undef
        return GLib.get_monotonic_time() / 1_000_000;
    } catch {
        return Date.now() / 1_000;
    }
}
