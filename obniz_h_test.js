// === 環境依存の設定 ===

// あなたのPCサーバー（Flask）のURL
const SERVER_URL = "http://192.168.1.4:5000/event";

// ゲートウェイのラベル（どこに置いたか分かる名前）
const GATEWAY_LABEL = "RX02";        // 例: ライン名・エリア名
const GATEWAY_MAC   = "192.168.1.4"; // 又はこのobnizの識別 (固定でいい)

// あなたが教えてくれたビーコン一覧をマッピング
const KNOWN_BEACONS = {
  "ac:23:3f:ac:70:1f": "400-MMBLEBC5-1",
  "e2c56db5-dffb-48d2-b060-d0f5a71096e0": "400-MMBLEBC5-1",

  "e02cc25e-0049-4185-832c-3a65db755d01": "NKH52W-ACS",

  "ea:77:79:fe:14:22": "RE-BC-BLE401W",
  "2a:2c:03:7c:ef:4a": "RE-BC-BLE401W",
  "d2:fc:53:ac:fa:31": "RE-BC-BLE401W",
  "f4:2e:e9:f5:d4:55": "RE-BC-BLE401W",
  "e0:15:03:73:1b:14": "RE-BC-BLE401W",
  "d4:a0:e7:9b:6e:2a": "RE-BC-BLE401W",
};

// 短時間に同じビーコンを何度も送らないようにするための記録
let lastSent = {}; // { beaconIdLower: timestamp_ms }

obniz.onconnect = async function () {
  // BLEの初期化
  await obniz.ble.initWait();

  // 見つかったBLEデバイスごとに呼ばれる
  obniz.ble.scan.onfind = async (peripheral) => {
    try {
      const macRaw = peripheral.address || "";
      const mac = macRaw.toLowerCase();

      const uuidRaw =
        peripheral.iBeacon && peripheral.iBeacon.uuid
          ? peripheral.iBeacon.uuid
          : "";
      const uuid = uuidRaw.toLowerCase();

      // beaconIdは MAC優先。なければUUID
      const beaconId = mac || uuid || "unknown";

      // 人間にわかりやすいラベル（KNOWN_BEACONSに登録されていなければそのままID）
      const beaconLabel = KNOWN_BEACONS[beaconId] || beaconId;

      // 電波強度
      const rssi = peripheral.rssi;

      // 2秒以内は同じビーコンを送らない (スパム防止)
      const now = Date.now();
      if (lastSent[beaconId] && now - lastSent[beaconId] < 2000) {
        return;
      }
      lastSent[beaconId] = now;

      // サーバーに送るJSON
      const payload = {
        gateway_label: GATEWAY_LABEL, // "RX02" など
        gateway_mac: GATEWAY_MAC,     // "192.168.1.4"でも"ラインA"でもOK
        beacon_label: beaconLabel,    // "RE-BC-BLE401W" 等
        beacon_id: beaconId,          // MACやUUID
        rssi: rssi,
        event: "seen",
        time: new Date().toISOString(),
      };

      console.log("POST to server:", payload);

      // PCのFlaskサーバーにPOST
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

  // スキャン開始
  obniz.ble.scan.start({
    duration: null,   // 無限にスキャン
    duplicate: true,  // 同じビーコンも繰り返し通知
  });
};
