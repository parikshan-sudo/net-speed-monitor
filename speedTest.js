// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Parikshan
/**
 * speedTest.js — Optional speed-test integration.
 *
 * Uses curl to call the Cloudflare speed-test API endpoint
 * (https://speed.cloudflare.com/api/rest/v1/closest/measurements)
 * for download measurement and a simple echo POST for upload.
 *
 * This is clearly distinct from passive monitoring.  A speed test
 * actively transfers data and consumes bandwidth.
 *
 * Tests are run only on explicit user request, never in the background.
 * All shell commands use fixed argument arrays (no unsanitized interpolation).
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/** @typedef {'idle'|'running'|'done'|'error'|'cancelled'} TestState */

/**
 * @typedef {Object} SpeedTestResult
 * @property {number|null}  downloadMbps
 * @property {number|null}  uploadMbps
 * @property {number|null}  latencyMs
 * @property {number|null}  jitterMs
 * @property {string}       server
 * @property {Date}         timestamp
 * @property {string|null}  error
 */

/**
 * Manages an optional, on-demand speed test.
 *
 * Emits progress via an onProgress callback and delivers the result
 * via an onResult callback.  Only one test can run at a time.
 */
export class SpeedTester {
    constructor() {
        /** @type {TestState} */
        this.state     = 'idle';
        /** @type {Gio.Subprocess|null} */
        this._proc     = null;
        this._cancelled = false;
    }

    /**
     * Run the speed test.
     *
     * @param {{ onProgress: (msg: string) => void,
     *            onResult:   (r: SpeedTestResult) => void }} callbacks
     */
    async run({ onProgress, onResult }) {
        if (this.state === 'running') return;

        this.state      = 'running';
        this._cancelled = false;

        onProgress('Checking connectivity…');

        try {
            // ── Step 1: Latency measurement (ICMP-free, HTTP RTT) ───────────
            const latencyMs = await this._measureLatency(onProgress);
            if (this._cancelled) { this._finish('cancelled', onResult); return; }

            // ── Step 2: Download test — fetch a known 10 MiB URL ───────────
            onProgress('Testing download speed… (this will use ~10 MB of data)');
            const dlMbps = await this._measureDownload(onProgress);
            if (this._cancelled) { this._finish('cancelled', onResult); return; }

            // ── Step 3: Upload test — POST random data ─────────────────────
            onProgress('Testing upload speed… (this will use ~5 MB of data)');
            const ulMbps = await this._measureUpload(onProgress);
            if (this._cancelled) { this._finish('cancelled', onResult); return; }

            onProgress('Done.');
            this.state = 'done';
            onResult({
                downloadMbps: dlMbps,
                uploadMbps:   ulMbps,
                latencyMs,
                jitterMs:     null,   // not measured in this lightweight approach
                server:       'Cloudflare / speed.cloudflare.com',
                timestamp:    new Date(),
                error:        null,
            });
        } catch (e) {
            if (this._cancelled) {
                this._finish('cancelled', onResult);
            } else {
                this.state = 'error';
                onResult({
                    downloadMbps: null,
                    uploadMbps:   null,
                    latencyMs:    null,
                    jitterMs:     null,
                    server:       'unknown',
                    timestamp:    new Date(),
                    error:        String(e.message ?? e),
                });
            }
        } finally {
            this._proc = null;
        }
    }

    /** Cancel a running test. */
    cancel() {
        this._cancelled = true;
        if (this._proc) {
            try { this._proc.force_exit(); } catch { /* ignore */ }
            this._proc = null;
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────

    _finish(state, onResult) {
        this.state = state;
        onResult({
            downloadMbps: null,
            uploadMbps:   null,
            latencyMs:    null,
            jitterMs:     null,
            server:       'unknown',
            timestamp:    new Date(),
            error:        state === 'cancelled' ? 'Test cancelled.' : null,
        });
    }

    /**
     * Measure HTTP RTT to Cloudflare's speed test endpoint.
     *
     * @returns {Promise<number>} Latency in ms, or null on failure.
     */
    async _measureLatency(_onProgress) {
        const t0 = GLib.get_monotonic_time();
        try {
            const out = await this._run([
                'curl', '-s', '-o', '/dev/null',
                '-w', '%{time_starttransfer}',
                '--max-time', '10',
                '--connect-timeout', '5',
                'https://speed.cloudflare.com/__down?bytes=0',
            ]);
            const secs = parseFloat(out.trim());
            if (!isFinite(secs)) return null;
            return Math.round(secs * 1000);
        } catch {
            return null;
        }
    }

    /**
     * Download 10 MiB from Cloudflare and return speed in Mbps.
     */
    async _measureDownload(onProgress) {
        const BYTES = 10 * 1024 * 1024; // 10 MiB
        const t0 = GLib.get_monotonic_time();

        const out = await this._run([
            'curl', '-s', '-o', '/dev/null',
            '-w', '%{size_download} %{time_total}',
            '--max-time', '30',
            '--connect-timeout', '5',
            `https://speed.cloudflare.com/__down?bytes=${BYTES}`,
        ]);

        const [sizeStr, timeStr] = out.trim().split(' ');
        const size = parseFloat(sizeStr);
        const time = parseFloat(timeStr);
        if (!isFinite(size) || !isFinite(time) || time <= 0) return null;
        return (size * 8) / (time * 1_000_000); // Mbps
    }

    /**
     * Upload 5 MiB of zero bytes to Cloudflare echo endpoint and return Mbps.
     */
    async _measureUpload(onProgress) {
        const BYTES = 5 * 1024 * 1024; // 5 MiB
        // Generate a temp file of zeros for upload payload.
        const tmpPath = `/tmp/nsm-upload-${GLib.get_real_time()}.bin`;
        try {
            // Create a 5 MiB zeros file.
            await this._run(['dd', 'if=/dev/zero', `of=${tmpPath}`, 'bs=1M', 'count=5', 'status=none']);

            const t0 = GLib.get_monotonic_time();
            const out = await this._run([
                'curl', '-s', '-o', '/dev/null',
                '-w', '%{size_upload} %{time_total}',
                '--max-time', '30',
                '--connect-timeout', '5',
                '-X', 'POST',
                '--data-binary', `@${tmpPath}`,
                'https://speed.cloudflare.com/__up',
            ]);

            const [sizeStr, timeStr] = out.trim().split(' ');
            const size = parseFloat(sizeStr);
            const time = parseFloat(timeStr);
            if (!isFinite(size) || !isFinite(time) || time <= 0) return null;
            return (size * 8) / (time * 1_000_000);
        } finally {
            // Remove temp file.
            try {
                Gio.File.new_for_path(tmpPath).delete(null);
            } catch { /* ignore */ }
        }
    }

    /**
     * Run an argv array as a subprocess and return stdout as a string.
     *
     * @param {string[]} argv
     * @returns {Promise<string>}
     */
    _run(argv) {
        return new Promise((resolve, reject) => {
            let proc;
            try {
                proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
                );
                this._proc = proc;
            } catch (e) {
                reject(e);
                return;
            }

            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout] = p.communicate_utf8_finish(res);
                    this._proc = null;
                    if (this._cancelled) { reject(new Error('cancelled')); return; }
                    resolve(stdout ?? '');
                } catch (e) {
                    this._proc = null;
                    reject(e);
                }
            });
        });
    }
}
