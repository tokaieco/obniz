const Obniz = require('obniz');
const fetch = require('node-fetch');

// ===== あなたの環境設定 =====

// FlaskサーバーのURL
const SERVER_URL = "http://192.168.1.4:5000/event";

// ゲートウェイ名（ライン名など）
const GATEWAY_LABEL = "RX02";

// ゲートウェイ本体のWi-Fi MAC
const GATEWAY_MAC = "a0:76:4e:7d:59:c8";

// あなたのobnizデバイス
const obniz = new Obniz("7873-1040", {
  access_token: "ここにアクセストークン"
});

// ビーコンの人間用ラベル対応表
// キーは「小文字・コロン抜き」に正規化したID
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
  // ほかも必要なら追記
};

// コロンを消して小文字にする関数
function normalizeId(id) {
  return (id || "").toLowerCase().replace(/:/g, "");
}

// スパム抑止用
let lastSent = {};

obniz.onconnect = async function () {
  console.log("✅ connected to obniz gateway");

  await obniz.ble.initWait();

  obniz.ble.scan.onfind = async (peripheral) => {
    try {
      // 表示用のMAC（コロンあり）。無い場合は ""。
      const macDisplay = (peripheral.address || "").toLowerCase(); // 例 "ea:77:79:fe:14:22"

      // UUID（iBeaconとかの場合に出る。こっちはコロンじゃなくてハイフン入り）
      const uuidDisplay = (peripheral.iBeacon?.uuid || "").toLowerCase();

      // 優先ルール: MACがあればMACを使う。なければUUIDを使う
      const displayId = macDisplay || uuidDisplay || "unknown";

      // ラベル引き当て用ID（コロン消して小文字にしたもの）
      const normId = normalizeId(displayId);

      // 人間向けの名前が分かればそれ、なければ生IDそのまま
      const humanLabel = KNOWN_BEACONS[normId] || displayId;

      const rssi = peripheral.rssi;
      const now = Date.now();

      // スパム防止（同じIDを2秒以内に繰り返し送らない）
      if (lastSent[normId] && now - lastSent[normId] < 2000) {
        return;
      }
      lastSent[normId] = now;

      const payload = {
        gateway_label: GATEWAY_LABEL,   // RX02 とか
        gateway_mac: GATEWAY_MAC,       // a0:76:4e:7d:59:c8
        beacon_label: humanLabel,       // "RE-BC-BLE401W-3" とか "400-MMBLEBC5-1"
        beacon_id: displayId,           // "ea:77:79:fe:14:22" などコロン入り
        rssi: rssi,                     // -50 くらいで近い
        event: "seen",
        time: new Date().toISOString(), // UTC ISO
      };

      console.log("POST to server:", payload);

      await fetch(SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error("POST failed:", err);
      });

    } catch (err) {
      console.error("onfind error:", err);
    }
  };

  // スキャン開始
  obniz.ble.scan.start({
    duration: null,
    duplicate: true,
  });
};

obniz.onclose = function () {
  console.log(`[Agent] obniz ${obniz.id} disconnected.`);
};
