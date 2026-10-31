// ProTimer Control — most prema Electron preload-u (window.pt) ili prazan stub u pregledaču
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

const api = window.pt || {
  sendState(){}, onState(){}, openOutput(){}, closeOutput(){}, toggleFullscreen(){},
  exitFullscreen(){}, setOnTop(){}, getDisplays:async()=>[], isOutputOpen:async()=>false,
  resizeOutput:async()=>({ok:false}), getOutputGeometry:async()=>null, onOutputGeometry(){},
  getOutputQuality:async()=>({ok:false,code:'OUTPUT_UNAVAILABLE'}),
  openSecondaryOutput:async()=>({ok:false}), closeSecondaryOutput(){}, toggleSecondaryFullscreen(){},
  getSecondaryOutputGeometry:async()=>null, onSecondaryOutputGeometry(){},
  getNetworkInfo:async()=>({}), onDisplays(){}, onOutputState(){}, onNetworkInfo(){},
  checkLocalNetwork:async()=>({ok:false}),
  onRemoteCmd(){}, sendToDisplay(){},
  qr:async()=>null, shareStart:async()=>({error:'preview'}), shareStop:async()=>true,
  shareInfo:async()=>({}), onShareInfo(){}, showOutputQr:async()=>false, hideOutputQr(){}, onOutputQr(){}
};
