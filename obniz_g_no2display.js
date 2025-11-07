const Obniz = require('obniz');
const fetch = require('node-fetch');

// =========================
// 設定値
// =========================
const SERVER_URL = "http://192.168.1.4:5000/event";
const RSSI_THRESHOLD = -90; 
const SPAM_PREVENTION_MS = 2000; 

const RECEIVERS = [
    {"id": "10:68:38:e5:ca:31", "name": "ラインA", "mac": "10:68:38:e5:ca:31"}, // PC
    {"id": "7873-1040",      "name": "ラインB", "mac": "a0:76:4e:7d:59:c8"}, // Gateway1
    {"id": "2544-5267",      "name": "ラインC", "mac": "60:55:f9:cd:d2:94"}, // Gateway2
    {"id": "6223-2809",      "name": "ラインD", "mac": "9c:9c:1f:0f:35:1c"}, // Gateway3
];

// ★★★ このゲートウェイのID ★★★
const THIS_GATEWAY_OBNIZ_ID = '2544-5267'; // Gateway2 (ラインC)

// (これ以降のコードは gateway_app.js と同じ)

const THIS_GATEWAY_CONFIG = RECEIVERS.find(r => r.id === THIS_GATEWAY_OBNIZ_ID);

if (!THIS_GATEWAY_CONFIG) {
    console.error(`Error: Config not found for obniz ID ${THIS_GATEWAY_OBNIZ_ID}`);
}

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

let lastSent = {};
let scanLock = false; // ★ 簡易ロック

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
    // ★ 簡易ロック
    if (scanLock) return;
    scanLock = true;

    try {
    	  const macRaw = peripheral.address || "";
    	  const mac = macRaw.toLowerCase();
    	  const uuidRaw = peripheral.iBeacon?.uuid || "";
  	 	  const uuid = uuidRaw.toLowerCase();
      const ibeacon = peripheral.iBeacon;
    	  const rssi = peripheral.rssi;
    	  const now = Date.now();

      let beaconLabel = "";
      let matchedId = ""; 

      if (mac && KNOWN_BEACONS[mac]) {
          beaconLabel = KNOWN_BEACONS[mac];
          matchedId = mac;
      } else if (uuid && KNOWN_BEACONS[uuid]) {
          beaconLabel = KNOWN_BEACONS[uuid];
          matchedId = uuid;
      }

      // 1. ターゲット外
      if (!beaconLabel) {
          scanLock = false; // ★ ロック解除
          return; 
      }
      
      // 2. RSSIしきい値
      if (rssi < RSSI_THRESHOLD) {
          scanLock = false; // ★ ロック解除
          return;
      }
      
      const current_status = "near";

      // 3. スパム防止
    	  if (lastSent[matchedId] && now - lastSent[matchedId] < SPAM_PREVENTION_MS) {
          scanLock = false; // ★ ロック解除
          return;
      }
  	 	  lastSent[matchedId] = now;
      
      // ★ デバッグ: ビーコン検知＆送信時にディスプレイ表示
      obniz.display.clear();
      obniz.display.print(`${beaconLabel}\nRSSI: ${rssi}`);


  	 	  const payload = {
        "receiver_id": THIS_GATEWAY_CONFIG.id,   
        "receiver_name": THIS_GATEWAY_CONFIG.name,
        "label": beaconLabel,
        "beacon_address": mac,
        "uuid": uuid,
        "major": ibeacon?.major || "",
        "minor": ibeacon?.minor || "",
        "rssi": rssi,
        "status": current_status,
        "ts": new Date().toISOString()
  	 	  };

  	 	  console.log(`[${THIS_GATEWAY_CONFIG.name}] POST to server: ${payload.label} (RSSI=${rssi})`);

  	 	  await fetch(SERVER_URL, {
    	  	method: "POST",
    	  	headers: { "Content-Type": "application/json" },
    	  	body: JSON.stringify(payload),
  	 	  }).catch((err) => {
    	  	console.error(`[${THIS_GATEWAY_CONFIG.name}] POST failed:`, err.message);
        
        // ★ デバッグ: fetch失敗時にディスプレイ表示
        obniz.display.clear();
        obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}]\nPOST Failed\n${err.message.slice(0, 30)}`);
  	 	  });

  	 } catch (e) {
  	 	  console.error(`[${THIS_GATEWAY_CONFIG.name}] onfind error:`, e);
      // ★ デバッグ: 不明なエラー時にディスプレイ表示
      obniz.display.clear();
      obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}]\nScan Error\n${e.message.slice(0, 30)}`);
  	 } finally {
      scanLock = false; // ★ ロック解除
    }
  };

  obniz.ble.scan.start({
  	 duration: null,
  	 duplicate: true 
  });
};

obniz.onclose = function () {
  console.log(`[Agent] obniz ${obniz.id} disconnected.`);
  try {
    obniz.display.clear();
    obniz.display.print(`[${THIS_GATEWAY_CONFIG.name}]\nOffline`);
  } catch(e) {}
};