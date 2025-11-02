import fetch from "node-fetch";  // Node v22 なら組み込みのfetchでもOK

// あなたの obniz 情報を入れる
const OBNIZ_ID = "6223-2809";
const TOKEN = "RsqE1ycnlT1oMkaRw91KvSuicIy3Runly3vmubaCBakuJTP8vriVRDBE5lfOTT0K"; // Device設定画面の Websocket URL の中にある access_token
const WIFI_SSID = "siPhone";
const WIFI_PASS = "sanseido3";

async function setWifi() {
  const res = await fetch(`https://obniz.io/obniz/${OBNIZ_ID}/wifi`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ssid: WIFI_SSID,
      password: WIFI_PASS
    })
  });

  if (res.ok) {
    console.log("✅ Wi-Fi設定を更新しました。再起動してください。");
  } else {
    console.error("❌ エラー:", res.status, await res.text());
  }
}

setWifi();
