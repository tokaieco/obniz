const Obniz = require('obniz');
const fetch = require('node-fetch');

// =========================
// 設定値（Python側と共通化）
// =========================
// ... 既存の設定コード ...
// あなたのPCサーバー
const SERVER_URL = "http://192.168.1.4:5000/event";
// Python側と合わせる (このRSSI以下のビーコンは無視)
const RSSI_THRESHOLD = -90; 
// スパム防止 (同じビーコンは2秒間送信しない)
const SPAM_PREVENTION_MS = 2000; 

// ★ Python側の RECEIVERS リスト (共通定義)
const RECEIVERS = [
    {"id": "10:68:38:e5:ca:31", "name": "ラインA", "mac": "10:68:38:e5:ca:31"}, // PC
    {"id": "7873-1040",      "name": "ラインB", "mac": "a0:76:4e:7d:59:c8"}, // Gateway1
    {"id": "2544-5267",      "name": "ラインC", "mac": "60:55:f9:cd:d2:94"}, // Gateway2
    {"id": "6223-2809",      "name": "ラインD", "mac": "9c:9c:1f:0f:35:1c"}, // Gateway3
];

// ★★★ このゲートウェイのID ★★★
// Gateway1 (7873-1040) 用
const THIS_GATEWAY_OBNIZ_ID = '7873-1040'; 
// (もし Gateway2 で動かす場合は '2544-5267' に書き換えてください)

// このゲートウェイの設定を検索
const THIS_GATEWAY_CONFIG = RECEIVERS.find(r => r.id === THIS_GATEWAY_OBNIZ_ID);

if (!THIS_GATEWAY_CONFIG) {
    console.error(`Error: Config not found for obniz ID ${THIS_GATEWAY_OBNIZ_ID}`);
    // throw new Error("Config not found"); // 本来は停止すべき
}

// ★ Python側の TARGETS と KNOWN_BEACONS をマージ (MAC/UUIDをキーにする)
const KNOWN_BEACONS = {
  "ac:23:3f:ac:70:1f": "400-MMBLEBC5-1", // MAC
  "e2c56db5-dffb-48d2-b060-d0f5a71096e0": "400-MMBLEBC5-1", // UUID
  "e02cc25e-0049-4185-832c-3a65db755d01": "NKH52W-ACS", // UUID
  "ea:77:79:fe:14:22": "RE-BC-BLE401W-1", // MAC (Python側では "-1" がないが、obniz側で区別)
  "2a:2c:03:7c:ef:4a": "RE-BC-BLE401W-2", // MAC
  "d2:fc:53:ac:fa:31": "RE-BC-BLE401W-3", // MAC
  "f4:2e:e9:f5:d4:55": "RE-BC-BLE401W-4", // MAC
  "e0:15:03:73:1b:14": "RE-BC-BLE401W-5", // MAC
  "d4:a0:e7:9b:6e:2a": "RE-BC-BLE401W-6", // MAC
};
// ... 既存の設定コード ...

// スパム防止: 最後に送信した時間
let lastSent = {};

// obniz IDを指定して接続
const obniz = new Obniz(THIS_GATEWAY_OBNIZ_ID);

obniz.onconnect = async function () {
  // ★ デバッグ: 接続時にディスプレイ表示
  obniz.display.clear();
  obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}] Online`);

  await obniz.ble.initWait();
  
  // ★ デバッグ: スキャン開始時にディスプレイ表示
  obniz.display.clear();
  obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}] Scan...`);

  obniz.ble.scan.onfind = async (peripheral) => {
    try {
      const macRaw = peripheral.address || "";
// ... 既存のコード ...
      const mac = macRaw.toLowerCase();
      const uuidRaw = peripheral.iBeacon?.uuid || "";
      const uuid = uuidRaw.toLowerCase();
      const ibeacon = peripheral.iBeacon; // major/minor取得用
      const rssi = peripheral.rssi;
      const now = Date.now();

      let beaconLabel = "";
// ... 既存のコード ...
      let matchedId = ""; // マッチしたキー (MAC or UUID)

      // Python側と同様に、MACまたはUUIDで KNOWN_BEACONS を検索
      if (mac && KNOWN_BEACONS[mac]) {
// ... 既存のコード ...
          beaconLabel = KNOWN_BEACONS[mac];
          matchedId = mac;
      } else if (uuid && KNOWN_BEACONS[uuid]) {
          beaconLabel = KNOWN_BEACONS[uuid];
          matchedId = uuid;
      }

      // 1. ターゲット（KNOWN_BEACONS）外なら無視
// ... 既存のコード ...
      if (!beaconLabel) {
          // console.log(`Ignored: MAC=${mac} UUID=${uuid}`);
          return; 
      }
      
      // 2. RSSIしきい値（Python側 "near" 判定ロジック）以下なら無視
// ... 既存のコード ...
      if (rssi < RSSI_THRESHOLD) {
          // console.log(`RSSI too low: ${beaconLabel} (RSSI=${rssi})`);
          return;
      }
      
      // 'near' 判定 (obnizは 'far' を送信するタイムアウト処理は未実装)
// ... 既存のコード ...
      const current_status = "near";

      // 3. スパム防止 (短時間での連続送信を防止)
      if (lastSent[matchedId] && now - lastSent[matchedId] < SPAM_PREVENTION_MS) {
        return;
      }
      lastSent[matchedId] = now;
      
      // ★ デバッグ: ビーコン検知＆送信時にディスプレイ表示
      obniz.display.clear();
      obniz.display.print(`${beaconLabel}\nRSSI: ${rssi}`);


      // ★ Python側の payload 形式に統一
      const payload = {
// ... 既存のペイロード ...
        "receiver_id": THIS_GATEWAY_CONFIG.id,   // obniz ID
        "receiver_name": THIS_GATEWAY_CONFIG.name, // "ラインB" など
        "label": beaconLabel,
        "beacon_address": mac, // UUIDでマッチしてもMACアドレスを優先的に記録
        "uuid": uuid,
        "major": ibeacon?.major || "",
        "minor": ibeacon?.minor || "",
        "rssi": rssi,
        "status": current_status, // "near"
        "ts": new Date().toISOString()
      };

      // ★ console.log は見れないが、念のため残しておく
      console.log(`[${THIS_GATEWAY_CONFIG.name}] POST to server: ${payload.label} (RSSI=${rssi})`);

      await fetch(SERVER_URL, {
// ... 既存の fetch ...
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        // ★ ネットワークエラーがここで表示されるはず
        console.error(`[${THIS_GATEWAY_CONFIG.name}] POST failed:`, err.message);
        
        // ★ デバッグ: fetch失敗時にディスプレイ表示
        obniz.display.clear();
        obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}]\nPOST Failed\n${err.message.slice(0, 30)}`); // エラーメッセージの最初だけ表示
      });

    } catch (e) {
      console.error(`[${THIS_GATEWAY_CONFIG.name}] onfind error:`, e);
      // ★ デバッグ: 不明なエラー時にディスプレイ表示
      obniz.display.clear();
      obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}]\nScan Error\n${e.message.slice(0, 30)}`);
    }
  };

  // スキャン開始
// ... 既存のコード ...
  obniz.ble.scan.start({
    duration: null,
    duplicate: true // 継続的に onfind を呼ぶ
  });
};

obniz.onclose = function () {
  console.log(`[Agent] obniz ${obniz.id} disconnected.`);
  // ★ デバッグ: 切断時にディスプレイ表示（一瞬だけかも）
  try {
    obniz.display.clear();
    obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}]\nOffline`);
  } catch(e) {}
};
