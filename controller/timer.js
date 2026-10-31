// ProTimer Control — stanje, raspored, tajmer, zvuk, render ogledala
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

// ---------- STANJE ----------
let S = {
  mode:'countdown', running:false,
  durationMs:600000, remMs:600000, endAt:0, elapsedMs:0, startAt:0,
  yellowSec:120, redSec:60,
  flashZero:true, soundZero:false, overtime:true, showProgress:false,
  message:{text:'', flash:false}, blackout:false,
  // izgled
  bgColor:'#000000', fgColor:'#ffffff', useWarnColors:true,
  warnYellow:'#ffc23a', warnRed:'#ff4540',
  text:'', textOnly:false, transparent:false,
  // grid pozicioniranje tajmera na ekranu
  gridOn:false, gridSize:3, gridCell:4,
  // kompaktan prozor (prozor prati veličinu tajmera kad nije fullscreen)
  fitWindow:false,
  outputSize:null, outputLayout:TimerTools.layout(),
  dualTimer:false, dualSplit:'columns', separateOutputs:false, liveTimerView:'both',deckLiveMode:'auto',secondary:TimerTools.secondary(),
  // rundown / raspored
  cues:[], currentCue:-1, showStart:'', showNowNext:false, cueTitleScale:100,
  lang:lang
};
let lastNetInfo = null, lastDisplays = [];
let cues = [], currentCue = -1, autoNext = false, zeroFired = false, outputOpen = false;
let selectedCue = null, editingCue = null, removedCue = null, pendingCueAction = null, rundownHasRun = false;
let rundownRenderKey = '';
let autoAdvanceTimer = null;
let cueDraftMs = 600000, durationPickerTarget = null, durationPickerAnchor = null, targetArmed = false;

const $ = id => document.getElementById(id);
function pad(n){ return String(n).padStart(2,'0'); }
function fmtSecs(s,neg){ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;
  return (neg?'−':'')+(h>0?`${h}:${pad(m)}:${pad(x)}`:`${m}:${pad(x)}`); }
function fmtMs(ms){ return ms>=0?fmtSecs(Math.ceil(ms/1000),false):fmtSecs(Math.floor(-ms/1000),true); }
function parseTime(str){
  str=(str||'').trim().replace(',',':').replace('.',':');
  if(!str) return null;
  if(/^\d+$/.test(str)) return +str*60000;
  const p=str.split(':').map(Number);
  if(p.some(isNaN)) return null;
  if(p.length===2) return (p[0]*60+p[1])*1000;
  if(p.length===3) return (p[0]*3600+p[1]*60+p[2])*1000;
  return null;
}
function formatDurationHMS(ms){
  const total=Math.max(0,Math.round((Number(ms)||0)/1000));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return `${String(h).padStart(2,'0')}:${pad(m)}:${pad(s)}`;
}
function syncDurationDisplays(){
  if($('secondaryDurationValue')) $('secondaryDurationValue').textContent=formatDurationHMS(S.secondary.durationMs);
  if($('durTriggerValue')) $('durTriggerValue').textContent=formatDurationHMS(S.durationMs);
  if($('cueDurationValue')) $('cueDurationValue').textContent=formatDurationHMS(cueDraftMs);
}
function clearTargetArm(clearValue){
  targetArmed=false;
  if($('targetInput')){
    $('targetInput').classList.remove('armed');
    if(clearValue) $('targetInput').value='';
  }
}
function durationUntilTarget(value,now){
  if(!value) return null;
  const parts=value.split(':').map(Number); if(parts.length<2||parts.some(Number.isNaN)) return null;
  const d=new Date(now); d.setHours(parts[0],parts[1],0,0); if(d.getTime()<=now) d.setDate(d.getDate()+1);
  return d.getTime()-now;
}
let deckControl=null;
const zeroAlerts=TimerAlerts.createZeroTracker();
const bellAudio=ProTimerDeckAudio(api,()=>showZeroAudioError());
function processZeroAlerts(now){
  const expired=zeroAlerts.sample(S,now);
  // Consume every crossing, even with sound off. Enabling it in overtime must
  // never ring retroactively. Simultaneous expiries share one non-overlapping bell.
  if(expired.some(id=>(id==='t1'?S:S.secondary).soundZero===true)) void beep();
}
const engineClock=EngineClock.create({onJump:delta=>{EngineClock.shiftRunning(S,delta);api.sendState({...S,cues,currentCue});deckControl?.observe();}});
api.onClockPower?.(state=>{if(state==='suspend')engineClock.suspend();else engineClock.resume();});
function send(){ S.cues=cues; S.currentCue=currentCue; processZeroAlerts(engineClock.sample()); syncDurationDisplays(); api.sendState(S); saveSettings(); deckControl?.observe(); }

// ---------- RASPORED / OVER-UNDER ----------
function todayAt(hhmm, now){
  if(!hhmm) return null;
  const [h,m]=hhmm.split(':').map(Number);
  if(isNaN(h)||isNaN(m)) return null;
  const d=new Date(now); d.setHours(h,m,0,0); return d.getTime();
}
function schedule(now){
  const list=cues||[]; const anchor=todayAt(S.showStart, now);
  let acc=anchor;
  const rows=list.map((c,i)=>{ const start=acc; const end=acc==null?null:acc+c.durationMs; acc=end;
    return {name:c.name,durationMs:c.durationMs,note:c.note||'',color:c.color||'',plannedStart:start,plannedEnd:end,index:i}; });
  let curRem=null;
  if(currentCue>=0 && S.mode==='countdown') curRem=S.running?S.endAt-now:S.remMs;
  let delta=null, plannedEnd=null;
  const total=list.reduce((a,c)=>a+c.durationMs,0);
  if(anchor!=null){ plannedEnd=anchor+total;
    if(currentCue>=0 && curRem!=null){
      const sumAfter=list.slice(currentCue+1).reduce((a,c)=>a+c.durationMs,0);
      delta=(now+Math.max(0,curRem)+sumAfter)-plannedEnd;
    }
  }
  return {rows,curRem,delta,plannedEnd};
}

// ---------- TAJMER ----------
function cancelAutoAdvance(){
  if(autoAdvanceTimer!==null){ clearTimeout(autoAdvanceTimer); autoAdvanceTimer=null; }
}
function tickCountdown(){
  engineClock.sample();
  processZeroAlerts(Date.now());
  // Transport must not depend on an animation frame: a minimized/covered
  // Control may stop painting while both audience outputs remain live.
  if(S.mode!=='countdown'||!S.running||S.endAt>Date.now()||zeroFired) return;
  zeroFired=true;
  if(autoNext&&currentCue>=0&&currentCue+1<cues.length){
    const nextCue=currentCue+1;
    autoAdvanceTimer=setTimeout(()=>{ autoAdvanceTimer=null; loadCue(nextCue,true); },800);
  }
}
function startPause(){
  engineClock.sample();
  cancelAutoAdvance();
  if(!S.running&&targetArmed){
    const targetMs=durationUntilTarget($('targetInput').value,Date.now());
    if(targetMs!==null&&targetMs>0){ targetArmed=false; $('targetInput').classList.remove('armed'); setDuration(targetMs,true); }
  }
  const now=Date.now();
  if(S.mode==='clock') return;
  if(S.running){
    // countup broji naviše; sve ostalo (i countdown) računa preko endAt — usklađeno sa calc()
    if(S.mode==='countup') S.elapsedMs+=now-S.startAt; else S.remMs=S.endAt-now;
    S.running=false;
  } else {
    if(S.mode==='countup') S.startAt=now;
    else { S.endAt=now+S.remMs; if(S.remMs>0) zeroFired=false; }
    S.running=true;
    if(currentCue>=0 && cues[currentCue] && S.mode==='countdown') rundownHasRun=true;
  }
  send(); updateButtons();
}
function reset(){ cancelAutoAdvance(); clearTargetArm(true); S.running=false; S.remMs=S.durationMs; S.elapsedMs=0; zeroFired=false; send(); updateButtons(); }
function setDuration(ms,keepTarget=false){ cancelAutoAdvance(); if(!keepTarget) clearTargetArm(true); S.mode='countdown'; S.durationMs=ms; S.remMs=ms; S.running=false; zeroFired=false; setModeTabs(); send();deckControl?.prepared('t1'); updateButtons(); }
function adjust(sec){
  engineClock.sample();
  if(S.mode!=='countdown') return;
  cancelAutoAdvance(); clearTargetArm(true);
  const d=sec*1000;
  if(S.running) S.endAt+=d; else S.remMs=Math.max(0,S.remMs+d);
  S.durationMs=Math.max(1000,S.durationMs+d);
  if((S.running?S.endAt-Date.now():S.remMs)>0) zeroFired=false;
  send();
}
function setMode(m){ if(!['countdown','countup','clock'].includes(m)) return; cancelAutoAdvance(); clearTargetArm(true); S.mode=m; S.running=false; S.remMs=S.durationMs; S.elapsedMs=0; zeroFired=false; setModeTabs(); send();deckControl?.prepared('t1'); updateButtons(); }
function setModeTabs(){ document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.mode===S.mode)); }

function secondaryRunning(running){
  engineClock.sample();
  if(!S.dualTimer) return;
  TimerTools.setRunning(S.secondary,!!running,Date.now()); send();
}
function secondaryDuration(ms){
  if(!Number.isFinite(ms)||ms<1000||ms>TimerTools.MAX_DURATION) return;
  S.secondary.mode='countdown';S.secondary.durationMs=ms; TimerTools.reset(S.secondary); send();deckControl?.prepared('t2');
}
function primaryRunning(running){ if(S.mode!=='clock'&&S.running!==!!running) startPause(); }
function bothRunning(running){
  if(!running){
    const now=engineClock.sample();cancelAutoAdvance();
    // Publish only after both clocks are paused. An intermediate state must
    // not ring Timer 2 while the operator is deliberately pausing both.
    TimerTools.setRunning(S,false,now);
    if(S.dualTimer) TimerTools.setRunning(S.secondary,false,now);
    send();updateButtons();return;
  }
  primaryRunning(true);if(S.dualTimer) secondaryRunning(true);
}
function syncDualUI(){
  $('chkFit').disabled=S.dualTimer;
  $('chkDual').checked=S.dualTimer; $('dualOptions').hidden=!S.dualTimer;
  $('secondaryZeroAlerts').hidden=!S.dualTimer;
  $('dualSplit').value=S.dualSplit;
  $('layoutTarget').querySelector('[value=secondary]').disabled=!S.dualTimer;
  if(!S.dualTimer) $('layoutTarget').value='primary';
  syncRoutingUI();
  syncOutputSizeFields();
  syncLayoutUI();
}
function syncRoutingUI(){
  const separate=TimerTools.separateOutputs(S);
  $('outputRouting').value=S.separateOutputs?'separate':'together';
  $('secondaryOutputControls').hidden=!separate;
  $('dualSplit').disabled=separate;
  $('dualSplitLabel').hidden=separate;
  $('outputTargetLabel').textContent=t(separate?'primaryOutputLabel':'outLabel');
  $('outputWindowTargetLabel').hidden=!separate;
  $('layoutTargetLabel').hidden=!S.dualTimer||separate;
  $('gridTargetRow').hidden=!separate;
  $('placementContext').hidden=!separate;
  $('gridContext').hidden=!separate;
  if(!separate) $('outputWindowTarget').value='primary';
  $('gridTarget').value=$('outputWindowTarget').value;
  if(separate) $('layoutTarget').value=$('outputWindowTarget').value;
  if(!S.dualTimer) $('layoutTarget').value='primary';
  showSecondaryOutputGeometry(lastSecondaryGeometry);
  syncLayoutUI(); buildGrid();
}
$('outputRouting').addEventListener('change',e=>{
  S.separateOutputs=e.target.value==='separate';
  syncRoutingUI(); syncOutputSizeFields(); send();
});
$('deckLiveMode').addEventListener('change',e=>{S.deckLiveMode=e.target.value;saveSettings();});
function selectedLayout(){
  const role=TimerTools.separateOutputs(S)?selectedWindow():S.dualTimer?$('layoutTarget').value:'primary';
  return role==='secondary'?S.secondary.layout:S.outputLayout;
}
function syncLayoutUI(){
  const layout=selectedLayout();
  for(const [id,key] of [['timerScale','scale'],['timerX','x'],['timerY','y']]){
    $(id).value=layout[key]; $(id+'Value').value=layout[key];
  }
}
for(const [id,key] of [['timerScale','scale'],['timerX','x'],['timerY','y']]){
  for(const suffix of ['','Value']) $(id+suffix).addEventListener('input',e=>{
    if(e.target.value===''||!e.target.validity.valid) return;
    Object.assign(selectedLayout(),TimerTools.layout({...selectedLayout(),[key]:Number(e.target.value)}));
    $(id+(suffix?'':'Value')).value=selectedLayout()[key]; send();
  });
}
$('layoutTarget').addEventListener('change',()=>{
  if(TimerTools.separateOutputs(S)) selectPlacement($('layoutTarget').value);
  else syncLayoutUI();
});
$('btnLayoutReset').addEventListener('click',()=>{ Object.assign(selectedLayout(),TimerTools.layout()); syncLayoutUI(); send(); });
$('chkDual').addEventListener('change',e=>{
  S.dualTimer=e.target.checked;
  if(!S.dualTimer) TimerTools.setRunning(S.secondary,false,Date.now());
  if(!S.dualTimer)S.liveTimerView='t1';
  if(S.dualTimer){ S.fitWindow=false; $('chkFit').checked=false; }
  syncDualUI(); send();
});
$('dualSplit').addEventListener('change',e=>{ S.dualSplit=e.target.value==='rows'?'rows':'columns'; send(); });
$('btnSecondaryStart').addEventListener('click',()=>secondaryRunning(!S.secondary.running));
$('btnSecondaryReset').addEventListener('click',()=>{ TimerTools.reset(S.secondary); send(); });
$('btnBothStart').addEventListener('click',()=>bothRunning(true));
$('btnBothPause').addEventListener('click',()=>bothRunning(false));
$('btnBothReset').addEventListener('click',()=>{ TimerTools.reset(S.secondary); reset(); });
let lastOutputGeometry=null, lastSecondaryGeometry=null;
let outputQualityVersion=0;
let outputQuality={role:'primary',key:null,status:'idle',result:null,checkedAt:null};
function selectedWindow(){ return TimerTools.separateOutputs(S)&&$('outputWindowTarget').value==='secondary'?'secondary':'primary'; }
function selectedGrid(){ return selectedWindow()==='secondary'?S.secondary:S; }
function selectPlacement(role){
  $('outputWindowTarget').value=TimerTools.separateOutputs(S)&&role==='secondary'?'secondary':'primary';
  $('gridTarget').value=$('outputWindowTarget').value;
  if(TimerTools.separateOutputs(S)) $('layoutTarget').value=$('outputWindowTarget').value;
  syncOutputSizeFields(); syncLayoutUI(); buildGrid();
}
function renderPlacementContext(){
  const second=selectedWindow()==='secondary', name=t(second?'timerTwo':'timerOne');
  const info=second?lastSecondaryGeometry:lastOutputGeometry;
  const display=lastDisplays.find(d=>d.id===info?.displayId);
  const target=name+(display?' · '+display.label:'');
  $('placementContext').textContent=t('placementOnly')+': '+target;
  $('gridContext').textContent=t('gridOnly')+': '+target;
}
function renderOutputSizeStatus(){
  const info=selectedWindow()==='secondary'?lastSecondaryGeometry:lastOutputGeometry;
  $('outputSizeStatus').textContent=info?`${t('actualSize')}: ${info.width} × ${info.height} ${t('logicalUnits')}${info.fullscreen?' · '+t('outputFullscreen'):''}`:t('outClosed');
  renderPlacementContext();
  renderOutputQuality();
}
function showOutputGeometry(info){
  lastOutputGeometry=info;
  renderOutputSizeStatus();
}
function showSecondaryOutputGeometry(info){
  lastSecondaryGeometry=info;
  $('btnSecondaryFs').disabled=!info; $('btnCloseSecondaryOut').disabled=!info;
  $('secondaryOutputStatus').textContent=info?`${t('secondaryOutputLive')} · ${info.width} × ${info.height} ${t('logicalUnits')}`:t('secondaryOutputClosed');
  renderOutputSizeStatus();
}
function outputQualityKey(){
  const role=selectedWindow(), info=role==='secondary'?lastSecondaryGeometry:lastOutputGeometry;
  const geometry=info&&['width','height','fullscreen','displayId','scaleFactor','displayLabel','displayWidth','displayHeight','refreshRate','pixelWidth','pixelHeight','zoomFactor'].map(key=>info[key]??null);
  const timer=role==='secondary'?S.secondary:S;
  // Clock ticks are deliberately excluded: this is a snapshot of the selected
  // output. Placement and presentation edits invalidate its clipping result.
  return JSON.stringify([role,geometry,S.dualTimer,S.separateOutputs,S.dualSplit,$('layoutTarget').value,
    role==='secondary'?timer.layout:S.outputLayout,
    S.dualTimer&&!TimerTools.separateOutputs(S)?S.secondary.layout:null,
    timer.gridOn,timer.gridSize,timer.gridCell,timer.outputSize,S.fitWindow,
    timer.mode,S.text,S.textOnly,S.showNowNext,S.blackout,S.transparent,S.message?.text]);
}
function syncOutputQualityContext(){
  const role=selectedWindow(), key=outputQualityKey();
  if(outputQuality.role===role&&outputQuality.key===key) return false;
  outputQualityVersion++;
  outputQuality={role,key,status:'idle',result:null,checkedAt:null};
  return true;
}
function refreshOutputQualityContext(){ if(syncOutputQualityContext()) renderOutputQuality(); }
function invalidateOutputQuality(role=selectedWindow()){
  if(role!==selectedWindow()) return;
  outputQualityVersion++;
  outputQuality={role,key:outputQualityKey(),status:'idle',result:null,checkedAt:null};
  renderOutputQuality();
}
function qualityNumber(value){ return Number.isFinite(value)&&value>0?String(Math.round(value*100)/100):null; }
function qualityDimensions(width,height){ return qualityNumber(width)&&qualityNumber(height)?`${qualityNumber(width)} × ${qualityNumber(height)}`:null; }
function renderOutputQuality(){
  syncOutputQualityContext();
  const info=selectedWindow()==='secondary'?lastSecondaryGeometry:lastOutputGeometry;
  const result=outputQuality.result, renderer=result?.renderer;
  const name=t(selectedWindow()==='secondary'?'timerTwo':'timerOne');
  let status=t(info?'outputUnchecked':'outputQualityClosed');
  if(outputQuality.status==='checking') status=t('outputChecking');
  else if(outputQuality.status==='checked') status=`${t('outputChecked')} · ${outputQuality.checkedAt.toLocaleTimeString(langLocale())}`;
  else if(outputQuality.status==='changed') status=t('outputQualityChanged');
  else if(outputQuality.status==='unavailable') status=t('outputQualityUnavailable');
  else if(outputQuality.status==='closed') status=t('outputQualityClosed');
  $('outputQualityStatus').textContent=`${name} · ${status}`;
  $('btnCheckOutput').disabled=outputQuality.status==='checking';
  const lines=[];
  if(info){
    const display=[`${t('outputDisplay')}: ${info.displayLabel||info.displayId||'—'}`];
    const size=qualityDimensions(info.displayWidth,info.displayHeight);
    if(size) display.push(`${size} ${t('logicalUnits')}`);
    if(qualityNumber(info.refreshRate)) display.push(`${qualityNumber(info.refreshRate)} Hz`);
    if(qualityNumber(info.scaleFactor)) display.push(`${t('outputDisplayScale')} ${qualityNumber(info.scaleFactor)}×`);
    const zoom=renderer?.zoomFactor??info.zoomFactor;
    if(qualityNumber(zoom)) display.push(`${t('outputZoom')} ${qualityNumber(zoom*100)}%`);
    lines.push(display.join(' · '));
    const estimated=qualityDimensions(info.pixelWidth,info.pixelHeight);
    if(estimated) lines.push(`${t('outputEstimatedRaster')}: ${estimated} px`);
  }
  if(result){
    const capture=qualityDimensions(result.capture?.width,result.capture?.height);
    if(result.captureStatus==='verified'&&capture) lines.push(`${t('outputCapture')}: ${capture} px`);
    const viewport=qualityDimensions(renderer?.width,renderer?.height);
    if(viewport) lines.push(`${t('outputRenderer')}: ${viewport} CSS px${qualityNumber(renderer.devicePixelRatio)?' · DPR '+qualityNumber(renderer.devicePixelRatio):''}`);
    if(result.captureStatus!=='verified'||!capture) lines.push(t(result.captureStatus==='too-large'?'outputCaptureTooLarge':'outputCaptureUnavailable'));
  }
  $('outputQualityReadout').textContent=lines.join('\n');
  $('outputQualityReadout').hidden=!lines.length;
  $('outputQualityClipping').hidden=!result?.clipped;
}
async function checkOutputQuality(){
  syncOutputQualityContext();
  const role=selectedWindow(), key=outputQualityKey(), version=++outputQualityVersion;
  outputQuality={role,key,status:'checking',result:null,checkedAt:null};
  renderOutputQuality();
  const current=()=>version===outputQualityVersion&&role===selectedWindow()&&key===outputQualityKey();
  try{
    const result=await api.getOutputQuality?.(role);
    if(!current()){ refreshOutputQualityContext(); return; }
    if(result?.ok&&result.role===role&&result.geometry){
      if(role==='secondary') showSecondaryOutputGeometry(result.geometry); else showOutputGeometry(result.geometry);
      outputQuality={role,key:outputQualityKey(),status:'checked',result,checkedAt:new Date()};
    }else{
      const code=result?.ok?'OUTPUT_CHANGED':result?.code;
      if(code==='OUTPUT_CLOSED'){
        if(role==='secondary') showSecondaryOutputGeometry(null); else showOutputGeometry(null);
      }
      outputQuality={role,key:outputQualityKey(),status:code==='OUTPUT_CLOSED'?'closed':code==='OUTPUT_CHANGED'?'changed':'unavailable',result:null,checkedAt:null};
    }
  }catch(_){
    if(!current()){ refreshOutputQualityContext(); return; }
    outputQuality={role,key,status:'unavailable',result:null,checkedAt:null};
  }
  renderOutputQuality();
}
$('btnCheckOutput').addEventListener('click',checkOutputQuality);
function syncOutputSizeFields(){
  const size=(selectedWindow()==='secondary'?S.secondary.outputSize:S.outputSize)||{width:1920,height:1080};
  $('outputWidth').value=size.width; $('outputHeight').value=size.height; renderOutputSizeStatus();
}
$('outputWindowTarget').addEventListener('change',()=>selectPlacement($('outputWindowTarget').value));
$('gridTarget').addEventListener('change',()=>selectPlacement($('gridTarget').value));
api.onSecondaryOutputGeometry(showSecondaryOutputGeometry);
api.getSecondaryOutputGeometry().then(showSecondaryOutputGeometry).catch(()=>{});
api.onOutputGeometry(showOutputGeometry);
api.getOutputGeometry().then(showOutputGeometry).catch(()=>{});
async function applyOutputSize(){
  const size=TimerTools.size({width:Number($('outputWidth').value),height:Number($('outputHeight').value)});
  if(!size){ $('outputSizeStatus').textContent=t('sizeInvalid'); return; }
  $('btnOutputSize').disabled=true;
  const role=selectedWindow();
  if(role==='secondary') S.secondary.outputSize=size; else S.outputSize=size;
  selectedGrid().gridOn=false;
  if(role==='primary'){ S.fitWindow=false; $('chkFit').checked=false; }
  buildGrid(); send();
  try{
    const result=await api.resizeOutput({...size,role,displayId:+$(role==='secondary'?'secondaryDisplaySel':'displaySel').value||null});
    if(result?.ok){ if(role==='secondary') showSecondaryOutputGeometry(result); else showOutputGeometry(result); }
    else $('outputSizeStatus').textContent=t('sizeFailed');
  }catch(_){ $('outputSizeStatus').textContent=t('sizeFailed'); }
  finally{ $('btnOutputSize').disabled=false; }
}
$('btnOutputSize').addEventListener('click',applyOutputSize);
for(const id of ['outputWidth','outputHeight']) $(id).addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); applyOutputSize(); } });
document.querySelectorAll('[data-output-size]').forEach(b=>b.addEventListener('click',()=>{
  const [w,h]=b.dataset.outputSize.split(','); $('outputWidth').value=w; $('outputHeight').value=h; applyOutputSize();
}));

// ---------- ZVUK ----------
function showZeroAudioError(){
  $('zeroSoundStatus').textContent=t('zeroSoundError');$('zeroSoundStatus').hidden=false;
}
async function beep(){
  try{
    // Reuse the manual bell and its configured route; Stream Deck hardware and
    // connection are not required. Never silently substitute an unavailable sink.
    const result=deckControl?await deckControl.playBell():await bellAudio.play((await api.deckInvoke('status')).audio);
    if(result.ok) $('zeroSoundStatus').hidden=true;
    else if(result.code!=='BELL_BUSY') showZeroAudioError();
    return result;
  }catch(_){showZeroAudioError();return {ok:false,code:'AUDIO_UNAVAILABLE'};}
}
$('btnTestZeroBell').addEventListener('click',()=>{void beep();});

// ---------- RENDER (ogledalo izlaza) ----------
function calc(now){
  if(S.mode==='clock'){ const d=new Date(); return {text:`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,fg:S.fgColor,neg:false,prog:null,rem:null}; }
  if(S.mode==='countup'){ const el=S.running?S.elapsedMs+(now-S.startAt):S.elapsedMs; return {text:fmtSecs(Math.floor(el/1000),false),fg:S.fgColor,neg:false,prog:null,rem:null}; }
  let rem=S.running?S.endAt-now:S.remMs;
  if(!S.overtime&&rem<0) rem=0;
  let fg=S.fgColor, neg=false;
  if(S.useWarnColors){ if(rem<=S.redSec*1000) fg=S.warnRed; else if(rem<=S.yellowSec*1000) fg=S.warnYellow; }
  if(rem<=0) fg=S.warnRed;
  if(rem<0) neg=true;
  const prog=S.durationMs>0?Math.max(0,Math.min(1,rem/S.durationMs)):0;
  return {text:fmtMs(rem),fg,neg,prog,rem};
}
let lastKey='';
function render(){
  refreshOutputQualityContext();
  const now=engineClock.sample(), r=calc(now);
  if(S.dualTimer){
    let rem=TimerTools.remaining(S.secondary,now); if(!(S.secondary.overtime??S.overtime)) rem=Math.max(0,rem);
    const mode=S.secondary.mode||'countdown';
    $('secondaryReadout').textContent=mode==='clock'?new Date(now).toLocaleTimeString('en-GB',{hour12:false}):mode==='countup'?fmtSecs(Math.floor(TimerTools.elapsed(S.secondary,now)/1000),false):fmtMs(rem);
    $('secondaryReadout').style.color=mode==='countdown'&&rem<=0?S.warnRed:mode==='countdown'&&S.useWarnColors?(rem<=S.redSec*1000?S.warnRed:rem<=S.yellowSec*1000?S.warnYellow:S.fgColor):S.fgColor;
    $('secondaryReadout').classList.toggle('blink',mode==='countdown'&&rem<=0&&S.secondary.flashZero!==false);
    $('btnSecondaryStart').textContent=(mode==='clock'?t('clockBtn'):S.secondary.running?t('pause'):t('start'))+' 2';
    $('btnSecondaryStart').disabled=mode==='clock';
  }
  const pv=$('preview');

  // pozadina
  if(S.transparent){ $('pvChecker').style.display='block'; pv.style.background='transparent'; }
  else { $('pvChecker').style.display='none'; pv.style.background=S.bgColor; }

  const textOnly = S.textOnly && S.text;
  const txtEl=$('pvText'), tEl=$('pvTime'), ps=$('pvStage');
  // GRID pomera i menja veličinu samo pravog izlaznog prozora. Operaterski
  // pregled ostaje preko cele površine da bi vreme uvek bilo čitljivo.
  const sw=ps.clientWidth||pv.clientWidth, sh=ps.clientHeight||pv.clientHeight;

  if(S.text){
    txtEl.style.display='block'; txtEl.textContent=S.text; txtEl.style.color=r.fg;
    txtEl.style.fontSize = textOnly
      ? Math.min(sw*0.85/Math.max(6,S.text.length*0.55), sh*0.42)+'px'
      : Math.min(sh*0.13, sw*0.06)+'px';
    txtEl.style.marginBottom = textOnly?'0':(sh*0.025)+'px';
  } else txtEl.style.display='none';

  if(textOnly){ tEl.style.display='none'; }
  else {
    tEl.style.display='block'; tEl.textContent=r.text; tEl.style.color=r.fg;
    tEl.className='pv-time'+(r.neg?' neg':'')+(r.rem!==null&&r.rem<=0&&S.flashZero!==false?' blink':'');
    const key=r.text.length+'|'+Math.round(sw)+'x'+Math.round(sh)+'|'+(S.text?1:0);
    if(key!==lastKey){ lastKey=key;
      const avail=S.text?sh*0.42:sh*0.55;
      tEl.style.fontSize=Math.min(sw*0.9/(r.text.length*0.6),avail)+'px'; }
  }

  const m=$('pvMsg');
  if(S.message.text){ m.style.display='block'; m.textContent=S.message.text; m.style.color=r.fg; m.className='pv-msg'+(S.message.flash?' flash':''); }
  else m.style.display='none';

  const p=$('pvProg');
  if(S.showProgress&&r.prog!==null){ p.style.display='block'; p.style.width=(r.prog*100)+'%'; p.style.background=r.fg; }
  else p.style.display='none';

  $('bdgBk').classList.toggle('bk',S.blackout);
  $('bdgOut').classList.toggle('on',outputOpen);
  $('bdgOut').textContent=outputOpen?t('outLive'):t('outClosed');

  // over / under raspored
  const sch=schedule(now); const ou=$('ouStatus');
  if(sch.delta==null||!rundownHasRun){ ou.textContent=t(S.showStart?'cueWaiting':'cueNoPlan'); ou.className='ou'; ou.title=''; }
  else { const sec=Math.round(sch.delta/1000);
    if(Math.abs(sec)<=5){ ou.textContent=t('onTime'); ou.className='ou ontime'; }
    else if(sec>0){ ou.textContent=t('late')+' '+fmtSecs(sec,false); ou.className='ou late'; ou.title=t('late'); }
    else { ou.textContent=t('early')+' '+fmtSecs(-sec,false); ou.className='ou early'; ou.title=t('early'); }
  }
  updateRundownTransport();

  requestAnimationFrame(render);
}
function updateButtons(){
  updateRundownTransport();
  const b=$('btnStart');
  if(S.mode==='clock'){ b.textContent=t('clockBtn'); b.classList.remove('running'); return; }
  if(S.running){ b.textContent=t('pause'); b.classList.add('running'); }
  else { b.textContent=t('start'); b.classList.remove('running'); }
}
