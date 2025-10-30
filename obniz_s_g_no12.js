const Obniz = require('obniz');
const fetch = require('node-fetch');

// === Gatewayごとに変更する ===
const RECEIVER_ID = "gateway2";       // 例: gateway1, gateway2, gateway3
const RECEIVER_NAME = "Gateway_2";    // 表示名

const CENTRAL_URL = "http://192.168.1.4:5000/event";
const RSSI_THRESHOLD = -90;
const CONSECUTIVE_NEAR = 2;
const SHOW_ALL_DEVICES = true;

const TARGETS = [
    { label: "400-MMBLEBC5-1", mac: "AC:23:3F:AC:70:1F", uuid: "e2c56db5-dffb-48d2-b060-d0f5a71096e0" },
    { label: "NKH52W-ACS", mac: "", uuid: "e02cc25e-0049-4185-832c-3a65db755d01" },
    { label: "RE-BC-BLE401W", mac: "EA:77:79:FE:14:22", uuid: "" },
    { label: "RE-BC-BLE401W", mac: "2A:2C:03:7C:EF:4A", uuid: "" },
    { label: "RE-BC-BLE401W", mac: "D2:FC:53:AC:FA:31", uuid: "" },
    { label: "RE-BC-BLE401W", mac: "F4:2E:E9:F5:D4:55", uuid: "" },
    { label: "RE-BC-BLE401W", mac: "E0:15:03:73:1B:14", uuid: "" },
    { label: "RE-BC-BLE401W", mac: "D4:A0:E7:9B:6E:2A", uuid: "" }
];

const state = {};
TARGETS.forEach(t => { state[t.label] = { near: false, count: 0, last_addr: "" }; });
const rssi_hist = {};

function normalize_mac(s) {
    if (!s) return "";
    const h = s.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
    return (h.length === 12) ? h.match(/.{1,2}/g).join(':') : s.toLowerCase();
}

function parse_ibeacon(peripheral) {
    if (peripheral.iBeacon) {
        return {
            uuid: peripheral.iBeacon.uuid?.toLowerCase(),
            major: peripheral.iBeacon.major,
            minor: peripheral.iBeacon.minor
        };
    }
    return null;
}

function is_match(addr, ibe, t) {
    const match_mac = t.mac && normalize_mac(addr) === normalize_mac(t.mac);
    const match_uuid = t.uuid && ibe && ibe.uuid === t.uuid.toLowerCase();
    return match_mac || match_uuid;
}

function getJSTString() {
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(now.getTime() + jstOffset);
    return jstDate.toISOString().slice(0, 19);
}

async function post_event(label, addr, ibe, rssi, status, gateway_id, gateway_mac) {
    const payload = {
        receiver_id: RECEIVER_ID,
        receiver_name: RECEIVER_NAME,
        gateway_id: gateway_id,
        gateway_mac: gateway_mac,
        label: label,
        beacon_address: addr,
        uuid: (ibe || {}).uuid || "",
        major: (ibe || {}).major || "",
        minor: (ibe || {}).minor || "",
        rssi: rssi,
        status: status,
        ts: getJSTString()
    };

    try {
        await fetch(CENTRAL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            timeout: 2000
        });
        console.log(`✅ Sent: ${label} ${status} RSSI=${rssi}`);
    } catch (e) {
        console.error(`❌ POST failed: ${e.message || e}`);
    }
}

const obniz = new Obniz();

obniz.onconnect = async function () {
    console.log(`[Agent] obniz ${obniz.id} connected.`);
    await obniz.ble.initWait();
    const gateway_id = obniz.id;
    const gateway_mac = obniz.macAddress || "unknown";

    obniz.ble.scan.onfind = async function (peripheral) {
        const addr = peripheral.address || "unknown";
        const rssi = peripheral.rssi;
        const ibe = parse_ibeacon(peripheral);

        if (SHOW_ALL_DEVICES) {
            const ibeacon_info = ibe ? `, iBeacon: ${ibe.uuid}` : "";
            console.log(`  ...Found BLE device: ${addr} (RSSI: ${rssi})${ibeacon_info}`);
        }

        if (!rssi_hist[addr]) rssi_hist[addr] = [];
        rssi_hist[addr].push(rssi);
        if (rssi_hist[addr].length > 5) rssi_hist[addr].shift();
        const avg = rssi_hist[addr].reduce((a, b) => a + b, 0) / rssi_hist[addr].length;

        for (const t of TARGETS) {
            if (is_match(addr, ibe, t)) {
                const stt = state[t.label];
                if (avg >= RSSI_THRESHOLD) {
                    stt.count += 1;
                    if (!stt.near && stt.count >= CONSECUTIVE_NEAR) {
                        stt.near = true;
                        stt.last_addr = addr;
                        await post_event(t.label, addr, ibe, Math.round(avg), "near", gateway_id, gateway_mac);
                    }
                } else {
                    if (stt.near) {
                        stt.near = false;
                        await post_event(t.label, addr, ibe, Math.round(avg), "far", gateway_id, gateway_mac);
                    }
                    stt.count = 0;
                }
            }
        }
    };

    await obniz.ble.scan.start({ duration: null, duplicate: true });
};

obniz.onclose = function () {
    console.log(`[Agent] obniz ${obniz.id} disconnected.`);
};
