/*
 * obniz_scanner.js
 * obniz BLE Gateway (6223-2809) Scanner Program
 * Sends data to the same server as beacon_watch44.py
 */

// Import Libraries
const Obniz = require('obniz');
const fetch = require('node-fetch');

// ====== Settings ======
// Server IP and Port
const CENTRAL_URL = "http://192.168.1.4:5000/event";

// Receiver ID (Name for this gateway)
const RECEIVER_ID = "gateway2";//変更
const RECEIVER_NAME = "Gateway_2";//変更

// RSSI threshold to determine "near"
const RSSI_THRESHOLD = -90;
// Number of consecutive "near" readings to change state
const CONSECUTIVE_NEAR = 2;

// Target Beacon List
const TARGETS = [
    {"label":"400-MMBLEBC5-1", "mac":"AC:23:3F:AC:70:1F", "uuid":"e2c56db5-dffb-48d2-b060-d0f5a71096e0", "major":"", "minor":""},
    {"label":"NKH52W-ACS", "mac":"", "uuid":"e02cc25e-0049-4185-832c-3a65db755d01", "major":"", "minor":""},
    {"label":"RE-BC-BLE401W", "mac":"EA:77:79:FE:14:22", "uuid":"", "major":"", "minor":""},
];

// ★★★ Debug Setting ★★★
// true: Logs all found BLE devices to the console
const SHOW_ALL_DEVICES = true;
// =====================================

// --- Program Body (No changes needed below) ---

const state = {};
TARGETS.forEach(t => {
    state[t.label] = { near: false, count: 0, last_addr: "" };
});

const rssi_hist = {};

function normalize_mac(s) {
    if (!s) return "";
    const h = s.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
    return (h.length === 12) ? h.match(/.{1,2}/g).join(':') : (s.strip ? s.strip().toLowerCase() : s.toLowerCase());
}

function parse_ibeacon(peripheral) {
    if (peripheral.iBeacon) {
        return {
            uuid: peripheral.iBeacon.uuid,
            major: peripheral.iBeacon.major,
            minor: peripheral.iBeacon.minor
        };
    }
    return null; 
}

function is_match(addr, ibe, t) {
    if (t.uuid) {
        if (!ibe) return false;
        if (ibe.uuid.toLowerCase() !== t.uuid.toLowerCase()) return false;
        if (t.major && ibe.major.toString() !== t.major.toString()) return false;
        if (t.minor && ibe.minor.toString() !== t.minor.toString()) return false;
        return true;
    }
    return t.mac && normalize_mac(addr) === normalize_mac(t.mac);
}

function getJSTString() {
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // JST (+9 hours)
    const jstDate = new Date(now.getTime() + jstOffset);
    return jstDate.toISOString().slice(0, 19); 
}

async function post_event(label, addr, ibe, rssi, status) {
    console.log(`  >>> Sending data to server: ${label} is ${status} (RSSI: ${rssi})`);
    
    const payload = {
        "receiver_id": RECEIVER_ID,
        "receiver_name": RECEIVER_NAME,
        "label": label,
        "beacon_address": addr,
        "uuid": (ibe || {}).uuid || "",
        "major": (ibe || {}).major || "",
        "minor": (ibe || {}).minor || "",
        "rssi": rssi,
        "status": status,
        "ts": getJSTString()
    };

    try {
        await fetch(CENTRAL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            timeout: 2000
        });
    } catch (e) {
        console.error(`POST failed: ${e.message || e}`);
    }
}

const obniz = new Obniz(); 

obniz.onconnect = async function () {
    console.log(`[Agent] obniz ${obniz.id} connected.`);
    await obniz.ble.initWait();
    console.log(`[Agent] BLE initialized. scanning... -> ${CENTRAL_URL}`);

    obniz.ble.scan.onfind = async function (peripheral) {
        const addr = peripheral.address || "unknown";
        const rssi = peripheral.rssi;
        const ibe = parse_ibeacon(peripheral);

        if (SHOW_ALL_DEVICES) {
            const ibeacon_info = ibe ? `, iBeacon: ${ibe.uuid}` : "";
            console.log(`  ...Found BLE device: ${addr} (RSSI: ${rssi})${ibeacon_info}`);
        }

        if (!rssi_hist[addr]) {
            rssi_hist[addr] = [];
        }
        rssi_hist[addr].push(rssi);
        if (rssi_hist[addr].length > 5) {
            rssi_hist[addr].shift();
        }
        const avg = rssi_hist[addr].reduce((a, b) => a + b, 0) / rssi_hist[addr].length;

        for (const t of TARGETS) {
            if (is_match(addr, ibe, t)) {
                const stt = state[t.label];
                if (avg >= RSSI_THRESHOLD) {
                    stt.count += 1;
                    if (!stt.near && stt.count >= CONSECUTIVE_NEAR) {
                        stt.near = true;
                        stt.last_addr = addr;
                        await post_event(t.label, addr, ibe, Math.round(avg), "near");
                    }
                } else {
                    if (stt.near) {
                        stt.near = false;
                        await post_event(t.label, addr, ibe, Math.round(avg), "far");
                    }
                    stt.count = 0;
                }
            }
        }
    };

    await obniz.ble.scan.start({ duration: null, duplicate: true });
};

obniz.onclose = function() {
  console.log(`[Agent] obniz ${obniz.id} disconnected.`);
};