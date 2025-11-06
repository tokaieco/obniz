const Obniz = require('obniz');
const fetch = require('node-fetch');

// =========================
// 設定値（あなたの環境用に調整済み）
// =========================

// あなたのPCサーバー
const SERVER_URL = "http://192.168.1.4:5000/event";

// ゲートウェイid=2544-5267
const GATEWAY_LABEL = "Gateway2";

// ゲートウェイ自身のMAC（Wi-Fi MACなど。固定でいい）
const GATEWAY_MAC = "60:55:f9:cd:d2:94";

// キャッチしたビーコンID(MAC or UUID) → 人間が分かる名前
const KNOWN_BEACONS = {
  "ac:23:3f:ac:70:1f": "400-MMBLEBC5-1",
  "e2c56db5-dffb-48d2-b060-d0f5a71096e0": "400-MMBLEBC5-1",
  "e02cc25e-0049-4185-832c-3a65db755d01": "NKH52W-ACS",
  "ea:77:79:fe:14:22": "RE-BC-BLE401W-1",
  "2a:2c:03:7c:ef:4a": "RE-BC-BLE401W-2",
  "d2:fc:53:ac:fa:31": "RE-BC-BLE401W-3",
  "f4:2e:e9:f5:d4:55": "RE-BC-BLE401W-4",
  "e0:15:03:73:1b:14": "RE-BC-BLE401W-5",
  "d4:a0:e7:9b:6e:2a": "RE-BC-BLE401W-6",
};

// スパム防止: 同じビーコンを短時間で何回も送らないようにする
let lastSent = {};

const obniz = new Obniz('2544-5267');

obniz.onconnect = async function () {
  await obniz.ble.initWait();

  obniz.ble.scan.onfind = async (peripheral) => {
    try {
      const macRaw = peripheral.address || "";
      const mac = macRaw.toLowerCase();
      const uuidRaw = peripheral.iBeacon?.uuid || "";
      const uuid = uuidRaw.toLowerCase();
      const beaconId = mac || uuid || "unknown";
      const beaconLabel = KNOWN_BEACONS[beaconId] || beaconId;
      const rssi = peripheral.rssi;
      const now = Date.now();

      if (lastSent[beaconId] && now - lastSent[beaconId] < 2000) return;
      lastSent[beaconId] = now;

      const payload = {
        gateway_label: GATEWAY_LABEL,
        gateway_mac: GATEWAY_MAC,
        beacon_label: beaconLabel,
        beacon_id: beaconId,
        rssi: rssi,
        event: "seen",
        time: new Date().toISOString()
      };

      console.log("POST to server:", payload);

      await fetch(SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error("POST failed:", err);
      });

    } catch (e) {
      console.error("onfind error:", e);
    }
  };

  obniz.ble.scan.start({
    duration: null,
    duplicate: true
  });
};

obniz.onclose = function () {
  console.log(`[Agent] obniz ${obniz.id} disconnected.`);
};

