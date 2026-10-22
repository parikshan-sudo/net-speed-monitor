// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Parikshan
/**
 * netReader.js — Network interface statistics reader.
 *
 * Reads byte counters from /sys/class/net/<iface>/statistics/ using
 * non-blocking Gio.File operations. Computes per-second transfer rates
 * from counter deltas. Handles counter resets, interface changes,
 * and disconnections safely.
 *
 * Net Speed Monitor — GNOME Shell Extension
 * GNOME 45+ ESM module style.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// ─── Excluded interface prefixes ──────────────────────────────────────────────
// lo (loopback) and docker/bridge/virtual interfaces should not be reported as
// "internet traffic". We include them in the interface list but exclude them
// from automatic selection.
const AUTO_EXCLUDE_PREFIXES = ['lo', 'docker', 'br-', 'veth', 'virbr', 'vmnet', 'vbox'];

/**
 * Test if an interface name should be excluded from auto-detection.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isVirtualInterface(name) {
    return AUTO_EXCLUDE_PREFIXES.some(p => name.startsWith(p));
}

// ─── Low-level file read helpers ─────────────────────────────────────────────

/**
 * Synchronously read a small sysfs file and return its trimmed content.
 * Returns null on failure. Safe to call from the Shell main loop because
 * sysfs reads are instantaneous kernel operations, not blocking I/O.
 *
 * @param {string} path
 * @returns {string|null}
 */
function readSysFile(path) {
    try {
        const file = Gio.File.new_for_path(path);
        const [ok, contents] = file.load_contents(null);
        if (!ok) return null;
        return new TextDecoder().decode(contents).trim();
    } catch {
        return null;
    }
}

/**
 * Read a 64-bit unsigned integer from a sysfs counter file.
 * Returns null if the file is missing or unparseable.
 *
 * @param {string} path
 * @returns {number|null}
 */
function readSysCounter(path) {
    const raw = readSysFile(path);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return isFinite(n) ? n : null;
}

// ─── Interface discovery ──────────────────────────────────────────────────────

/**
 * List all network interfaces visible in /sys/class/net/.
 *
 * @returns {string[]}
 */
export function listInterfaces() {
    try {
        const dir = Gio.File.new_for_path('/sys/class/net');
        const enumerator = dir.enumerate_children(
            'standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        const names = [];
        let info;
        while ((info = enumerator.next_file(null)) !== null)
            names.push(info.get_name());
        enumerator.close(null);
        return names.sort();
    } catch {
        return [];
    }
}

/**
 * Read the operstate of an interface ('up', 'down', 'unknown', …).
 *
 * @param {string} iface
 * @returns {string}
 */
export function getOperstate(iface) {
    return readSysFile(`/sys/class/net/${iface}/operstate`) ?? 'unknown';
}

/**
 * Return the default-route interface by parsing the kernel route table.
 * Falls back to the first non-virtual UP interface if the route file
 * is unavailable.
 *
 * @returns {string|null}
 */
export function detectDefaultInterface() {
    // Method 1: /proc/net/route — fastest, no subprocess.
    const routeContent = readSysFile('/proc/net/route');
    if (routeContent) {
        for (const line of routeContent.split('\n').slice(1)) {
            const fields = line.trim().split(/\s+/);
            // Destination 00000000 = default route.
            if (fields.length >= 4 && fields[1] === '00000000' && fields[3] !== '0000') {
                const iface = fields[0];
                if (iface && !isVirtualInterface(iface))
                    return iface;
            }
        }
    }

    // Method 2: First UP non-virtual interface.
    for (const iface of listInterfaces()) {
        if (!isVirtualInterface(iface) && getOperstate(iface) === 'up')
            return iface;
    }

    return null;
}

/**
 * Return human-readable interface type hint.
 *
 * @param {string} iface
 * @returns {string}
 */
export function getInterfaceType(iface) {
    if (iface.startsWith('eth') || iface.startsWith('en'))  return 'Ethernet';
    if (iface.startsWith('wl'))                              return 'Wi-Fi';
    if (iface.startsWith('ww') || iface.startsWith('mb'))   return 'Mobile';
    if (iface.startsWith('tun') || iface.startsWith('tap')) return 'VPN/Tunnel';
    if (iface.startsWith('ppp'))                             return 'PPP';
    if (iface.startsWith('lo'))                              return 'Loopback';
    return 'Network';
}

// ─── Counter reading ──────────────────────────────────────────────────────────

/**
 * Read rx_bytes and tx_bytes for an interface.
 *
 * @param {string} iface
 * @returns {{ rx: number, tx: number } | null}
 */
export function readCounters(iface) {
    if (!iface) return null;
    const rx = readSysCounter(`/sys/class/net/${iface}/statistics/rx_bytes`);
    const tx = readSysCounter(`/sys/class/net/${iface}/statistics/tx_bytes`);
    if (rx === null || tx === null) return null;
    return { rx, tx };
}

// ─── NetReader class ──────────────────────────────────────────────────────────

/**
 * Maintains state between two consecutive counter samples and computes
 * per-second download/upload rates.
 *
 * Usage:
 *   const reader = new NetReader();
 *   reader.setInterface('enp3s0f3u1u2u3');   // or setAutoMode()
 *   const sample = reader.sample();
 *   // later…
 *   const sample2 = reader.sample();
 *   // sample2.downloadBps, sample2.uploadBps
 */
export class NetReader {
    constructor() {
        this._iface       = null;    // currently monitored interface
        this._autoMode    = true;
        this._prevRx      = null;
        this._prevTx      = null;
        this._prevTime    = null;
        this._sessionRx   = 0;       // session-total download bytes
        this._sessionTx   = 0;       // session-total upload bytes
        this._sessionStart = Date.now();
        this._firstSample = true;    // skip rate calculation on first call
    }

    /** Switch to automatic interface detection. */
    setAutoMode() {
        this._autoMode = true;
        this._reset();
    }

    /**
     * Pin the reader to a specific interface name.
     *
     * @param {string} iface
     */
    setInterface(iface) {
        this._autoMode = false;
        if (iface !== this._iface) {
            this._iface = iface;
            this._reset();
        }
    }

    /** Current active interface name, or null if not yet determined. */
    get currentInterface() {
        return this._iface;
    }

    /** Accumulated session download bytes since construction or reset. */
    get sessionDownloadBytes() {
        return this._sessionRx;
    }

    /** Accumulated session upload bytes since construction or reset. */
    get sessionUploadBytes() {
        return this._sessionTx;
    }

    /** Session start timestamp (ms). */
    get sessionStart() {
        return this._sessionStart;
    }

    /** Reset session totals to zero. */
    resetSession() {
        this._sessionRx    = 0;
        this._sessionTx    = 0;
        this._sessionStart = Date.now();
        this._reset();
    }

    /**
     * Take a sample and return computed rates.
     *
     * Returns an object with:
     *   - iface          {string|null}  Active interface name.
     *   - downloadBps    {number}       Download speed, bytes/s.
     *   - uploadBps      {number}       Upload speed, bytes/s.
     *   - connected      {boolean}      Whether a live interface was found.
     *   - operstate      {string}       Interface operstate string.
     *   - rxTotal        {number}       Cumulative RX counter value.
     *   - txTotal        {number}       Cumulative TX counter value.
     *
     * @returns {SampleResult}
     */
    sample() {
        // Resolve active interface.
        if (this._autoMode) {
            const detected = detectDefaultInterface();
            if (detected !== this._iface) {
                this._iface = detected;
                this._reset();
            }
        }

        const iface = this._iface;

        if (!iface) {
            return this._noData(null);
        }

        const operstate = getOperstate(iface);
        if (operstate !== 'up') {
            this._reset();
            return this._noData(iface, operstate);
        }

        const counters = readCounters(iface);
        if (!counters) {
            this._reset();
            return this._noData(iface, operstate);
        }

        const now = GLib.get_monotonic_time() / 1_000_000; // seconds

        if (this._firstSample || this._prevRx === null) {
            // First sample: store baseline, report zero rates.
            this._prevRx    = counters.rx;
            this._prevTx    = counters.tx;
            this._prevTime  = now;
            this._firstSample = false;
            return {
                iface,
                downloadBps: 0,
                uploadBps:   0,
                connected:   true,
                operstate,
                rxTotal:     counters.rx,
                txTotal:     counters.tx,
            };
        }

        const dt = now - this._prevTime;
        if (dt <= 0) {
            // Clock went backwards (e.g., suspend/resume) — reset.
            this._prevRx   = counters.rx;
            this._prevTx   = counters.tx;
            this._prevTime = now;
            return {
                iface,
                downloadBps: 0,
                uploadBps:   0,
                connected:   true,
                operstate,
                rxTotal:     counters.rx,
                txTotal:     counters.tx,
            };
        }

        let dRx = counters.rx - this._prevRx;
        let dTx = counters.tx - this._prevTx;

        // Guard against counter reset or 32-bit wraparound.
        // Linux sysfs counters are 64-bit on 64-bit kernels; occasional
        // counter resets (interface down/up) appear as large negative deltas.
        if (dRx < 0) dRx = 0;
        if (dTx < 0) dTx = 0;

        const downloadBps = dRx / dt;
        const uploadBps   = dTx / dt;

        // Accumulate session totals.
        this._sessionRx += dRx;
        this._sessionTx += dTx;

        this._prevRx   = counters.rx;
        this._prevTx   = counters.tx;
        this._prevTime = now;

        return {
            iface,
            downloadBps,
            uploadBps,
            connected: true,
            operstate,
            rxTotal:   counters.rx,
            txTotal:   counters.tx,
        };
    }

    // ── Private helpers ────────────────────────────────────────────────────

    _reset() {
        this._prevRx      = null;
        this._prevTx      = null;
        this._prevTime    = null;
        this._firstSample = true;
    }

    _noData(iface, operstate = 'unknown') {
        return {
            iface,
            downloadBps: 0,
            uploadBps:   0,
            connected:   false,
            operstate,
            rxTotal:     0,
            txTotal:     0,
        };
    }
}

/**
 * @typedef {Object} SampleResult
 * @property {string|null} iface
 * @property {number}      downloadBps
 * @property {number}      uploadBps
 * @property {boolean}     connected
 * @property {string}      operstate
 * @property {number}      rxTotal
 * @property {number}      txTotal
 */
