const Obniz = require('obniz');

// ★ Gateway2 (ラインC) のID
const THIS_GATEWAY_OBNIZ_ID = '2544-5267'; 

const obniz = new Obniz(THIS_GATEWAY_OBNIZ_ID);

obniz.onconnect = async function () {
  
  // 接続したら、まずディスプレイをクリア
  obniz.display.clear();
  
  // 1行目に「Test Start」と表示
  obniz.display.print("Test Start");
  
  // 2行目に「Gateway2 (Line C)」と表示
  obniz.display.text("Gateway2 (Line C)", 1, 10); 
  
  console.log("Test code running. Display should be on.");

  // 5秒ごとに表示を変える (動作確認用)
  let count = 0;
  setInterval(() => {
    count++;
    obniz.display.clear();
    obniz.display.print(`Test Running: ${count}`);
    obniz.display.text("Gateway2 (Line C)", 1, 10); 
    console.log(`Test count: ${count}`);
  }, 5000);

};

obniz.onclose = function () {
  console.log(`Test code stopped (disconnected).`);
};