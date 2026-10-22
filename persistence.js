/**
 * persistence.js — Optional session and historical statistics storage.
 *
 * Stores data in ~/.local/share/net-speed-monitor/ as JSON.
 * Uses atomic writes (write-to-temp + rename) to prevent corruption.
 * History is bounded by a configurable retention window.
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DATA_DIR = GLib.build_filenamev([
    GLib.get_user_data_dir(), 'net-speed-monitor',
]);

const HISTORY_FILE = GLib.build_filenamev([DATA_DIR, 'history.json']);

/**
 * Ensure the data directory exists.
 */
function ensureDir() {
    try {
        Gio.File.new_for_path(DATA_DIR).make_directory_with_parents(null);
    } catch { /* already exists */ }
}

/**
 * Atomically write a JSON object to a file.
 *
 * @param {string} path
 * @param {object} data
 * @returns {boolean} Success.
 */
function writeJSON(path, data) {
    ensureDir();
    try {
        const json  = JSON.stringify(data, null, 2);
        const bytes = new TextEncoder().encode(json);
        const tmpPath = path + '.tmp';
        const tmpFile = Gio.File.new_for_path(tmpPath);
        tmpFile.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        // Rename over target.
        tmpFile.move(Gio.File.new_for_path(path), Gio.FileCopyFlags.OVERWRITE, null, null);
        return true;
    } catch (e) {
        logError(e, 'NSM persistence: writeJSON failed');
        return false;
    }
}

/**
 * Read and parse a JSON file.
 *
 * @param {string} path
 * @returns {object|null}
 */
function readJSON(path) {
    try {
        const file = Gio.File.new_for_path(path);
        const [ok, contents] = file.load_contents(null);
        if (!ok) return null;
        return JSON.parse(new TextDecoder().decode(contents));
    } catch {
        return null;
    }
}

// ─── History record shape ────────────────────────────────────────────────────

/**
 * @typedef {Object} DayRecord
 * @property {string} date        ISO date string 'YYYY-MM-DD'.
 * @property {number} rxBytes     Total received bytes for the day.
 * @property {number} txBytes     Total transmitted bytes for the day.
 * @property {number} peakDl      Peak download speed (bytes/s).
 * @property {number} peakUl      Peak upload speed (bytes/s).
 */

// ─── PersistenceManager class ─────────────────────────────────────────────────

export class PersistenceManager {
    constructor() {
        /** @type {DayRecord[]} */
        this._history = [];
        this._dirty   = false;
        this._enabled = false;
    }

    get enabled() { return this._enabled; }

    /** Enable or disable persistence. When disabling, data is not deleted. */
    setEnabled(v) {
        this._enabled = !!v;
        if (v) this._load();
    }

    /**
     * Record bytes transferred today.
     *
     * @param {number} rxDelta  Bytes downloaded since last call.
     * @param {number} txDelta  Bytes uploaded since last call.
     * @param {number} dlBps    Current download speed (for peak tracking).
     * @param {number} ulBps    Current upload speed (for peak tracking).
     */
    record(rxDelta, txDelta, dlBps, ulBps) {
        if (!this._enabled) return;

        const today = this._todayStr();
        let rec = this._history.find(r => r.date === today);
        if (!rec) {
            rec = { date: today, rxBytes: 0, txBytes: 0, peakDl: 0, peakUl: 0 };
            this._history.push(rec);
        }

        rec.rxBytes += rxDelta;
        rec.txBytes += txDelta;
        if (dlBps > rec.peakDl) rec.peakDl = dlBps;
        if (ulBps > rec.peakUl) rec.peakUl = ulBps;

        this._dirty = true;
    }

    /**
     * Flush to disk if dirty. Call periodically (e.g., every minute).
     *
     * @param {number} retentionDays
     */
    flush(retentionDays = 30) {
        if (!this._enabled || !this._dirty) return;
        this._prune(retentionDays);
        writeJSON(HISTORY_FILE, { records: this._history });
        this._dirty = false;
    }

    /**
     * Return a copy of all history records, newest first.
     *
     * @returns {DayRecord[]}
     */
    getHistory() {
        return [...this._history].reverse();
    }

    /**
     * Reset all stored statistics (in memory and on disk).
     */
    reset() {
        this._history = [];
        this._dirty   = false;
        try {
            Gio.File.new_for_path(HISTORY_FILE).delete(null);
        } catch { /* ignore */ }
    }

    // ── Private ──────────────────────────────────────────────────────────────

    _load() {
        const data = readJSON(HISTORY_FILE);
        if (data && Array.isArray(data.records)) {
            this._history = data.records.filter(r =>
                r && typeof r.date === 'string' &&
                typeof r.rxBytes === 'number' &&
                typeof r.txBytes === 'number'
            );
        } else {
            this._history = [];
        }
    }

    _prune(days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        this._history = this._history.filter(r => r.date >= cutoffStr);
    }

    _todayStr() {
        return new Date().toISOString().slice(0, 10);
    }
}
