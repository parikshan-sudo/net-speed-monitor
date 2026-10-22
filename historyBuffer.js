// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Parikshan
/**
 * historyBuffer.js — Bounded ring-buffer for graph history data.
 *
 * Stores time-stamped speed samples in a fixed-length array.
 * Supports configurable time-window trimming and pause/resume.
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

'use strict';

/**
 * A single historical speed sample.
 * @typedef {{ t: number, dl: number, ul: number }} SpeedSample
 */

/**
 * Bounded time-series buffer for download/upload history.
 * Entries older than the configured window are pruned on each push.
 *
 * @param {number} windowMinutes  Maximum history in minutes to retain.
 */
export class HistoryBuffer {
    constructor(windowMinutes = 5) {
        /** @type {SpeedSample[]} */
        this._data   = [];
        this._window = windowMinutes * 60; // seconds
        this._paused = false;
        this._peakDl = 0;
        this._peakUl = 0;
    }

    /** Update the retention window. Immediately trims old data. */
    set windowMinutes(minutes) {
        this._window = Math.max(1, minutes) * 60;
        this._trim();
    }

    get windowMinutes() {
        return this._window / 60;
    }

    get paused() { return this._paused; }
    set paused(v) { this._paused = !!v; }

    get peakDownloadBps() { return this._peakDl; }
    get peakUploadBps()   { return this._peakUl; }

    /**
     * Append a new sample. Ignored when paused.
     *
     * @param {number} t   Timestamp in seconds (monotonic).
     * @param {number} dl  Download speed, bytes/s.
     * @param {number} ul  Upload speed, bytes/s.
     */
    push(t, dl, ul) {
        if (this._paused) return;
        dl = Math.max(0, dl);
        ul = Math.max(0, ul);
        this._data.push({ t, dl, ul });
        if (dl > this._peakDl) this._peakDl = dl;
        if (ul > this._peakUl) this._peakUl = ul;
        this._trim();
    }

    /**
     * Return a copy of samples within the current window.
     *
     * @returns {SpeedSample[]}
     */
    getData() {
        return this._data.slice();
    }

    /**
     * Return samples mapped to x-positions (0–1) and y-values (bytes/s).
     * Useful for canvas rendering.
     *
     * @returns {{ xs: number[], dls: number[], uls: number[], maxSpeed: number }}
     */
    getNormalized() {
        if (this._data.length < 2) {
            return { xs: [], dls: [], uls: [], maxSpeed: 0 };
        }
        const first = this._data[0].t;
        const last  = this._data[this._data.length - 1].t;
        const span  = last - first || 1;

        let maxSpeed = 0;
        const xs  = [];
        const dls = [];
        const uls = [];

        for (const s of this._data) {
            xs.push((s.t - first) / span);
            dls.push(s.dl);
            uls.push(s.ul);
            if (s.dl > maxSpeed) maxSpeed = s.dl;
            if (s.ul > maxSpeed) maxSpeed = s.ul;
        }

        return { xs, dls, uls, maxSpeed };
    }

    /**
     * Compute session averages across all retained samples.
     *
     * @returns {{ avgDl: number, avgUl: number }}
     */
    getAverages() {
        if (this._data.length === 0) return { avgDl: 0, avgUl: 0 };
        let sumDl = 0, sumUl = 0;
        for (const s of this._data) {
            sumDl += s.dl;
            sumUl += s.ul;
        }
        const n = this._data.length;
        return { avgDl: sumDl / n, avgUl: sumUl / n };
    }

    /**
     * Reset all stored data and peak values.
     */
    reset() {
        this._data  = [];
        this._peakDl = 0;
        this._peakUl = 0;
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _trim() {
        if (this._data.length === 0) return;
        const cutoff = this._data[this._data.length - 1].t - this._window;
        // Binary search or simple splice from front.
        let i = 0;
        while (i < this._data.length && this._data[i].t < cutoff) i++;
        if (i > 0) this._data.splice(0, i);
    }
}
