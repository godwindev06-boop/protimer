// ProTimer Control — birač trajanja, događaji kontrola, grid
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

// ---------- ZAJEDNIČKI BIRAČ TRAJANJA ----------
const DURATION_MAX_SEC=99*3600+59*60+59;
function durationPickerMs(){
  const read=(id,max)=>Math.max(0,Math.min(max,parseInt($(id).value,10)||0));
  return (read('durationHours',99)*3600+read('durationMinutes',59)*60+read('durationSeconds',59))*1000;
}
function updateDurationPresetState(){
  const ms=durationPickerMs();
  document.querySelectorAll('[data-duration-preset]').forEach(b=>b.classList.toggle('active',ms===+b.dataset.durationPreset*60000));
  $('durationPickerConfirm').disabled=ms<=0;
}
function writeDurationPicker(ms){
  let total=Math.max(0,Math.min(DURATION_MAX_SEC,Math.round((Number(ms)||0)/1000)));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  $('durationHours').value=pad(h); $('durationMinutes').value=pad(m); $('durationSeconds').value=pad(s);
  updateDurationPresetState();
}
function positionDurationPopover(){
  const pop=$('durationPopover'); if(pop.hidden||!durationPickerAnchor) return;
  const a=durationPickerAnchor.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight,margin=12;
  let left=a.left+a.width/2-w/2; left=Math.max(margin,Math.min(left,innerWidth-w-margin));
  let top=a.bottom+9; if(top+h>innerHeight-margin) top=Math.max(margin,a.top-h-9);
  pop.style.left=Math.round(left)+'px'; pop.style.top=Math.round(top)+'px';
}
function closeDurationPicker(returnFocus){
  const pop=$('durationPopover'); if(pop.hidden) return;
  pop.hidden=true;
  if(durationPickerAnchor) durationPickerAnchor.setAttribute('aria-expanded','false');
  const focusTarget=durationPickerAnchor; durationPickerTarget=null; durationPickerAnchor=null;
  if(returnFocus&&focusTarget) focusTarget.focus();
}
function openDurationPicker(target,anchor){
  closeDurationPicker(false);
  durationPickerTarget=target; durationPickerAnchor=anchor;
  $('durationPickerTitle').textContent=t(target==='cue'?'durationPickerCue':target==='secondary'?'timerTwo':'durationPickerTimer');
  writeDurationPicker(target==='cue'?cueDraftMs:target==='secondary'?S.secondary.durationMs:S.durationMs);
  $('durationPopover').hidden=false; anchor.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>{ positionDurationPopover(); $('durationMinutes').focus(); $('durationMinutes').select(); });
}
function applyDurationPicker(){
  const ms=durationPickerMs(); if(ms<=0){ $('durationSeconds').focus(); return; }
  const target=durationPickerTarget;
  if(target==='timer'){ currentCue=-1; renderCues(); setDuration(ms); }
  else if(target==='cue'){ cueDraftMs=ms; syncDurationDisplays(); }
  else if(target==='secondary') secondaryDuration(ms);
  closeDurationPicker(true);
}

$('durTrigger').addEventListener('click',()=>openDurationPicker('timer',$('durTrigger')));
$('btnSetDur').addEventListener('click',()=>openDurationPicker('timer',$('durTrigger')));
$('cueDurationTrigger').addEventListener('click',()=>openDurationPicker('cue',$('cueDurationTrigger')));
$('secondaryDurationTrigger').addEventListener('click',()=>openDurationPicker('secondary',$('secondaryDurationTrigger')));
$('durationPickerClose').addEventListener('click',()=>closeDurationPicker(true));
$('durationPickerConfirm').addEventListener('click',applyDurationPicker);
document.querySelectorAll('[data-duration-step]').forEach(b=>b.addEventListener('click',()=>{
  const unit={hours:3600,minutes:60,seconds:1}[b.dataset.durationStep]||1;
  const next=Math.max(0,Math.min(DURATION_MAX_SEC,durationPickerMs()/1000+(+b.dataset.delta||0)*unit));
  writeDurationPicker(next*1000);
}));
document.querySelectorAll('[data-duration-preset]').forEach(b=>b.addEventListener('click',()=>writeDurationPicker(+b.dataset.durationPreset*60000)));
document.querySelectorAll('[data-duration-part]').forEach(el=>{
  el.addEventListener('focus',()=>el.select());
  el.addEventListener('input',()=>{ el.value=el.value.replace(/\D/g,'').slice(0,2); updateDurationPresetState(); });
  el.addEventListener('blur',()=>writeDurationPicker(durationPickerMs()));
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); applyDurationPicker(); }
    else if(e.key==='Escape'){ e.preventDefault(); closeDurationPicker(true); }
    else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      e.preventDefault(); const unit={hours:3600,minutes:60,seconds:1}[el.dataset.durationPart]||1;
      writeDurationPicker(Math.max(0,Math.min(DURATION_MAX_SEC,durationPickerMs()/1000+(e.key==='ArrowUp'?unit:-unit)))*1000);
      el.focus(); el.select();
    }
  });
});
$('durationPopover').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); closeDurationPicker(true); } e.stopPropagation(); });
document.addEventListener('pointerdown',e=>{
  const pop=$('durationPopover');
  if(!pop.hidden&&!pop.contains(e.target)&&!(durationPickerAnchor&&durationPickerAnchor.contains(e.target))) closeDurationPicker(false);
});
window.addEventListener('resize',positionDurationPopover);
document.querySelector('.main').addEventListener('scroll',()=>closeDurationPicker(false));

// ---------- DOGAĐAJI ----------
$('btnStart').addEventListener('click',startPause);
$('btnReset').addEventListener('click',reset);
document.querySelectorAll('[data-adj]').forEach(b=>b.addEventListener('click',()=>adjust(+b.dataset.adj)));
document.querySelectorAll('.tabs button[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));

[1,2,3,5,10,15,20,30,45,60].forEach(min=>{
  const b=document.createElement('button'); b.textContent=min+'m';
  b.addEventListener('click',()=>{ currentCue=-1; renderCues(); setDuration(min*60000); });
  $('chips').appendChild(b);
});

function armEndTarget(){
  const ms=durationUntilTarget($('targetInput').value,Date.now());
  if(ms===null){ clearTargetArm(false); return; }
  currentCue=-1; renderCues(); targetArmed=true; $('targetInput').classList.add('armed'); setDuration(ms,true);
}
$('targetInput').addEventListener('change',armEndTarget);
$('targetInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); armEndTarget(); $('btnStart').focus(); } });

$('yellowInput').addEventListener('change',()=>{ const ms=parseTime($('yellowInput').value); if(ms!==null){ S.yellowSec=ms/1000; send(); } });
$('redInput').addEventListener('change',()=>{ const ms=parseTime($('redInput').value); if(ms!==null){ S.redSec=ms/1000; send(); } });
$('chkFlash').addEventListener('change',e=>{ S.flashZero=e.target.checked; send(); });
function setZeroSound(timerId,enabled){
  const timer=timerId==='t2'?S.secondary:S;
  // Consume an already expired countdown under its old opt-in value before
  // enabling sound, even if the normal 50 ms tick has not observed zero yet.
  if(enabled&&!timer.soundZero) processZeroAlerts(engineClock.sample());
  timer.soundZero=!!enabled;send();
}
$('chkSound').addEventListener('change',e=>setZeroSound('t1',e.target.checked));
$('chkFlash2').addEventListener('change',e=>{ S.secondary.flashZero=e.target.checked; send(); });
$('chkSound2').addEventListener('change',e=>setZeroSound('t2',e.target.checked));
$('chkOver').addEventListener('change',e=>{ S.overtime=e.target.checked; send(); });
$('chkOver2').addEventListener('change',e=>{ S.secondary.overtime=e.target.checked; send(); });
$('chkProg').addEventListener('change',e=>{ S.showProgress=e.target.checked; send(); });
$('chkAuto').addEventListener('change',e=>{ autoNext=e.target.checked; if(!autoNext) cancelAutoAdvance(); saveSettings(); });

// izgled
$('bgColor').addEventListener('input',e=>{ S.bgColor=e.target.value; send(); });
$('fgColor').addEventListener('input',e=>{ S.fgColor=e.target.value; send(); });
$('chkWarn').addEventListener('change',e=>{ S.useWarnColors=e.target.checked; send(); });
$('warnYellow').addEventListener('input',e=>{ S.warnYellow=e.target.value; send(); });
$('warnRed').addEventListener('input',e=>{ S.warnRed=e.target.value; send(); });
$('chkTransparent').addEventListener('change',e=>{ S.transparent=e.target.checked; send(); });
$('textInput').addEventListener('input',e=>{ S.text=e.target.value; send(); });
$('chkTextOnly').addEventListener('change',e=>{ S.textOnly=e.target.checked; lastKey=''; send(); });
$('btnTextClear').addEventListener('click',()=>{ S.text=''; $('textInput').value=''; send(); });

// ---------- GRID (pozicija tajmera na izlaznom ekranu) ----------
function buildGrid(){
  const grid=selectedGrid(), n=grid.gridSize, sel=$('gridSel');
  sel.style.gridTemplateColumns='repeat('+n+',1fr)';
  sel.style.gridTemplateRows='repeat('+n+',1fr)';
  sel.classList.toggle('off', !grid.gridOn);
  sel.innerHTML='';
  for(let i=0;i<n*n;i++){
    const d=document.createElement('button'); d.type='button'; d.className='gc'+(i===grid.gridCell?' sel':'');
    d.disabled=!grid.gridOn;
    d.tabIndex=i===grid.gridCell?0:-1;
    d.setAttribute('aria-label',t('gridCellLabel').replace('{row}',Math.floor(i/n)+1).replace('{col}',i%n+1));
    d.setAttribute('aria-pressed',String(i===grid.gridCell));
    d.addEventListener('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey) return;
      const delta={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[e.key];
      if(!delta) return;
      e.preventDefault();
      const row=Math.max(0,Math.min(n-1,Math.floor(i/n)+delta[0])), col=Math.max(0,Math.min(n-1,i%n+delta[1]));
      const next=sel.children[row*n+col]; d.tabIndex=-1; next.tabIndex=0; next.focus({preventScroll:true});
    });
    d.addEventListener('click',()=>{ grid.gridCell=i; lastKey=''; buildGrid(); send(); $('gridSel').children[i].focus({preventScroll:true}); });
    sel.appendChild(d);
  }
  document.querySelectorAll('#gridSizes button').forEach(b=>b.classList.toggle('active', +b.dataset.gs===grid.gridSize));
  $('chkGrid').checked=grid.gridOn;
}
$('chkGrid').addEventListener('change',e=>{ selectedGrid().gridOn=e.target.checked; lastKey=''; buildGrid(); send(); });
document.querySelectorAll('#gridSizes button').forEach(b=>b.addEventListener('click',()=>{
  const grid=selectedGrid(), oN=grid.gridSize, nN=+b.dataset.gs;
  const oR=Math.floor(grid.gridCell/oN), oC=grid.gridCell%oN;
  const nR=Math.min(nN-1, Math.round(oR*(nN-1)/(oN-1||1)));
  const nC=Math.min(nN-1, Math.round(oC*(nN-1)/(oN-1||1)));
  grid.gridSize=nN; grid.gridCell=nR*nN+nC;
  if(!grid.gridOn){ grid.gridOn=true; }   // izbor veličine podrazumeva da hoćeš grid
  lastKey=''; buildGrid(); send();
}));

$('btnBlackout').addEventListener('click',()=>{ S.blackout=!S.blackout; $('btnBlackout').classList.toggle('on',S.blackout); send(); });

$('btnMsgSend').addEventListener('click',()=>{ S.message={text:$('msgInput').value.trim(),flash:$('chkMsgFlash').checked}; send(); });
$('msgInput').addEventListener('keydown',e=>{ if(e.key==='Enter') $('btnMsgSend').click(); });
$('btnMsgClear').addEventListener('click',()=>{ S.message={text:'',flash:false}; $('msgInput').value=''; send(); });

// boja cue-a — palete tačkica
let cueColorSel='';
const CUE_COLORS=['','#f0564d','#d9a441','#3fb950','#4493f8','#a371f7','#ec6cb9','#e6edf3'];
CUE_COLORS.forEach(col=>{
  const d=document.createElement('button'); d.type='button';
  d.dataset.color=col;
  d.className='cdot'+(col===''?' none':'')+(col===cueColorSel?' sel':'');
  if(col) d.style.background=col;
  d.title=col||t('cueNoColor'); d.setAttribute('aria-label',t('cueColor')+': '+(col||t('cueNoColor')));
  d.setAttribute('aria-pressed',String(col===cueColorSel));
  d.addEventListener('click',()=>{ cueColorSel=col; syncCueColors(); });
  $('cueColors').appendChild(d);
});
function syncCueColors(){ document.querySelectorAll('#cueColors .cdot').forEach(d=>{
  const on=d.dataset.color===cueColorSel; d.classList.toggle('sel',on); d.setAttribute('aria-pressed',String(on));
  d.title=d.dataset.color||t('cueNoColor'); d.setAttribute('aria-label',t('cueColor')+': '+(d.dataset.color||t('cueNoColor')));
}); }

function addCue(){
  const ms=cueDraftMs;
  if(!Number.isFinite(ms)||ms<1000||ms>TimerTools.MAX_DURATION){ cueFeedback('cueInvalid'); return; }
  if(editingCue&&!cues.includes(editingCue)){ cancelCueEdit(); cueFeedback('cueMissing'); return; }
  const entry={name:$('cueName').value.trim()||`Cue ${cues.length+1}`, durationMs:ms,
    note:$('cueNote').value.trim(), color:cueColorSel};
  const editing=!!editingCue;
  if(editing){ Object.assign(editingCue,entry); selectedCue=editingCue; editingCue=null; }
  else { cues.push(entry); selectedCue=entry; }
  $('cueName').value=''; $('cueNote').value='';
  saveCues(); send(); renderCues(); revealCue(cues.indexOf(selectedCue)); cueFeedback(editing?'cueSaved':'cueAdded');
  $('cueEditor').open=!editing; if(!editing) $('cueName').focus();
}
$('btnCueAdd').addEventListener('click',addCue);
