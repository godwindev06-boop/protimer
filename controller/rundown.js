// ProTimer Control — rundown lista i čuvanje podešavanja
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

// ---------- RUNDOWN ----------
function clock(ms){ const d=new Date(ms); return pad(d.getHours())+':'+pad(d.getMinutes()); }
function renderCues(){
  const el=$('cueList'), scroll=el.scrollTop;
  const focused=document.activeElement?.closest('.cue');
  const focusCue=focused?._cue;
  const focusClass=document.activeElement?.classList.contains('up')?'up':document.activeElement?.classList.contains('dn')?'dn':'cue-select';
  el.innerHTML='';
  if(!cues.includes(selectedCue)) selectedCue=null;
  if(currentCue<0 || !cues[currentCue]) rundownHasRun=false;
  $('cueCount').textContent=cues.length+' '+t('cueItems');
  $('cueTotal').textContent=fmtMs(cues.reduce((sum,c)=>sum+c.durationMs,0));
  $('cueScheduleSummary').textContent=t('rundownSchedule')+' · '+$('cueTotal').textContent+(S.showStart?' · '+S.showStart:'');
  const sch=schedule(Date.now());
  $('cuePlannedEnd').textContent=sch.plannedEnd==null?'—':clock(sch.plannedEnd);
  if(!cues.length){ const d=document.createElement('div'); d.className='empty'; d.textContent=t('cueEmpty'); el.appendChild(d); }
  cues.forEach((c,i)=>{
    const pr=sch.rows[i];
    const row=document.createElement('div');
    row._cue=c;
    row.dataset.index=i;
    row.className='cue'+(i===currentCue?' current':'')+(c===selectedCue?' selected':'');
    row.innerHTML='<span class="stripe"></span><span class="n"></span>'+
      '<button class="cue-select"><span class="nm"></span><span class="times"><span class="du"></span><span class="planned"></span><span class="cue-state"></span></span><span class="note"></span></button>'+
      '<div class="cue-order"><button class="up">↑</button><button class="dn">↓</button></div>';
    row.querySelector('.stripe').style.background=/^#[0-9a-f]{6}$/i.test(c.color||'')?c.color:'transparent';
    row.querySelector('.n').textContent=i+1;
    row.querySelector('.nm').textContent=c.name||t('noName');
    row.querySelector('.du').textContent=fmtMs(c.durationMs);
    row.querySelector('.planned').textContent=pr.plannedStart==null?'':clock(pr.plannedStart)+'–'+clock(pr.plannedEnd);
    row.querySelector('.cue-state').textContent=i===currentCue?t('nowLabel'):i===currentCue+1?t('nextLabel'):'';
    row.querySelector('.note').textContent=c.note||'';
    const pick=row.querySelector('.cue-select');
    pick.title=(c.name||t('noName'))+(c.note?' — '+c.note:'');
    pick.setAttribute('aria-pressed',String(c===selectedCue));
    if(i===currentCue) pick.setAttribute('aria-current','step');
    pick.addEventListener('click',()=>{ selectedCue=c; renderCues(); });
    row.querySelector('.up').title=t('cueUp'); row.querySelector('.up').setAttribute('aria-label',t('cueUp')+' '+(i+1));
    row.querySelector('.dn').title=t('cueDown'); row.querySelector('.dn').setAttribute('aria-label',t('cueDown')+' '+(i+1));
    row.querySelector('.up').disabled=i===0; row.querySelector('.dn').disabled=i===cues.length-1;
    row.querySelector('.up').addEventListener('click',()=>moveCue(i,-1));
    row.querySelector('.dn').addEventListener('click',()=>moveCue(i,1));
    el.appendChild(row);
  });
  el.scrollTop=scroll;
  if(focusCue){ const i=cues.indexOf(focusCue); if(i>=0) el.querySelector(`[data-index="${i}"] .${focusClass}`)?.focus({preventScroll:true}); }
  $('cueSelection').hidden=!selectedCue;
  $('cueSelectedName').textContent=selectedCue?t('cueSelected')+': '+(cues.indexOf(selectedCue)+1)+'. '+selectedCue.name:'';
  $('cueEditorTitle').textContent=t(editingCue?'cueEdit':'cueNew');
  $('btnCueAdd').textContent=t(editingCue?'cueSave':'cueAdd');
  $('btnCueCancelEdit').hidden=!editingCue;
  $('cueEditHelp').textContent=t(editingCue&&editingCue===cues[currentCue]?'cueEditLiveHelp':'cueSelectHelp');
  $('cueColors').setAttribute('aria-label',t('cueColor'));
  rundownRenderKey=''; updateRundownTransport();
}
function loadCue(i,autostart){ if(i<0||i>=cues.length) return; cancelAutoAdvance(); currentCue=i; setDuration(cues[i].durationMs); if(autostart) startPause(); renderCues(); revealCue(i); }
function moveCue(i,dir){ const j=i+dir; if(j<0||j>=cues.length) return; [cues[i],cues[j]]=[cues[j],cues[i]];
  cancelAutoAdvance(); if(currentCue===i) currentCue=j; else if(currentCue===j) currentCue=i; saveCues(); send(); renderCues(); revealCue(j); }
function startRundown(){ cancelAutoAdvance(); rundownHasRun=false; if(cues.length) loadCue(0,true); }
function go(){ cancelAutoAdvance(); if(currentCue+1<cues.length) loadCue(currentCue+1,true); }

function updateRundownTransport(){
  const active=cues[currentCue], valid=!!active&&S.mode==='countdown';
  const finished=valid&&!S.running&&S.remMs<=0;
  const key=JSON.stringify([lang,currentCue,valid,S.running,finished,rundownHasRun,cues.length,active?.name,cues[currentCue+1]?.name,selectedCue===active]);
  if(key===rundownRenderKey) return; rundownRenderKey=key;
  $('btnRundownStart').disabled=!cues.length;
  $('btnRundownStart').textContent=t(!valid?'startRundown':S.running?'rundownPause':finished?'rundownAgain':rundownHasRun?'rundownResume':'cueRun');
  $('btnRundownStart').classList.toggle('running',valid&&S.running);
  $('btnCuePrevious').disabled=!valid||currentCue===0;
  $('btnCueReset').disabled=!valid;
  $('btnGo').disabled=!cues.length||currentCue>=cues.length-1;
  $('btnRundownRestart').disabled=!cues.length;
  $('btnCueReveal').disabled=!active;
  $('btnCueDelete').disabled=!!active&&selectedCue===active&&S.running;
  $('btnCueDelete').title=$('btnCueDelete').disabled?t('cueDeleteLive'):t('cueDelete');
  $('cueLiveState').textContent=t(!valid?'cueReady':S.running?'cuePlaying':finished?'cueFinished':rundownHasRun?'cuePaused':'cuePrepared');
  $('cueLiveName').textContent=valid?(currentCue+1)+'. '+active.name:t('cueNotStarted');
  const next=cues[valid?currentCue+1:0];
  $('cueNextName').textContent=next?t('nextLabel')+': '+next.name+' · '+fmtMs(next.durationMs):t('cueNoNext');
}
function rundownPlay(){
  if(currentCue>=0&&cues[currentCue]&&S.mode==='countdown'){
    if(!S.running&&S.remMs<=0) setDuration(cues[currentCue].durationMs);
    startPause();
  } else requestCueLoad(cues[0],true);
}
function revealCue(i=currentCue){
  const row=$('cueList').querySelector(`[data-index="${i}"]`); if(!row) return;
  const list=$('cueList'),r=row.getBoundingClientRect(),b=list.getBoundingClientRect();
  if(r.top<b.top) list.scrollTop-=b.top-r.top;
  else if(r.bottom>b.bottom) list.scrollTop+=r.bottom-b.bottom;
}
function cueFeedback(key){ $('cueFeedback').hidden=false; $('cueFeedbackText').textContent=t(key); $('btnCueUndo').hidden=!removedCue; }
function cancelCueAction(){ pendingCueAction=null; $('cueConfirm').hidden=true; }
function requestCueAction(text,action){
  cancelCueAction();
  if(!S.running){ action(); return; }
  const active=cues[currentCue];
  pendingCueAction=()=>{ if(cues[currentCue]!==active){ cueFeedback('cueActionChanged'); return; } action(); };
  $('cueConfirmText').textContent=text; $('cueConfirm').hidden=false; $('btnCueCancelAction').focus();
}
function requestCueLoad(cue,run){
  if(!cue) return;
  requestCueAction(t('cueReplaceConfirm')+' “'+cue.name+'”?',()=>{
    const i=cues.indexOf(cue); if(i<0){ cueFeedback('cueMissing'); return; }
    loadCue(i,run);
  });
}
function deleteSelectedCue(){
  const i=cues.indexOf(selectedCue); if(i<0) return;
  if(i===currentCue&&S.running){ cueFeedback('cueDeleteLive'); return; }
  cancelAutoAdvance();
  removedCue={cue:selectedCue,index:i,before:cues[i+1]||null};
  if(editingCue===selectedCue) cancelCueEdit();
  cues.splice(i,1);
  if(i<currentCue) currentCue--; else if(i===currentCue) currentCue=-1;
  selectedCue=cues[Math.min(i,cues.length-1)]||null;
  saveCues(); send(); renderCues(); cueFeedback('cueDeleted');
}
function undoCueDelete(){
  if(!removedCue) return;
  cancelAutoAdvance();
  const active=cues[currentCue],entry=removedCue;
  let i=cues.indexOf(entry.before); if(i<0) i=Math.min(entry.index,cues.length);
  cues.splice(i,0,entry.cue); currentCue=active?cues.indexOf(active):-1;
  selectedCue=entry.cue; removedCue=null;
  saveCues(); send(); renderCues(); revealCue(i); cueFeedback('cueRestored');
}
function duplicateSelectedCue(){
  const i=cues.indexOf(selectedCue); if(i<0) return;
  const copy={...selectedCue,name:selectedCue.name+' ('+t('cueCopySuffix')+')'};
  cues.splice(i+1,0,copy); if(currentCue>i) currentCue++;
  cancelAutoAdvance(); selectedCue=copy;
  saveCues(); send(); renderCues(); revealCue(i+1); cueFeedback('cueCopied');
}
function editSelectedCue(){
  if(!cues.includes(selectedCue)) return;
  editingCue=selectedCue; $('cueName').value=editingCue.name; $('cueNote').value=editingCue.note||'';
  cueDraftMs=editingCue.durationMs; cueColorSel=editingCue.color||'';
  syncCueColors(); syncDurationDisplays(); $('cueEditor').open=true; renderCues(); $('cueName').focus();
}
function cancelCueEdit(){
  editingCue=null; $('cueName').value=''; $('cueNote').value=''; cueColorSel=''; syncCueColors(); renderCues();
}

// ---------- ČUVANJE ----------
function saveCues(){ localStorage.setItem('pt_cues',JSON.stringify(cues)); }
function saveSettings(){
  localStorage.setItem('pt_settings',JSON.stringify({
    yellowSec:S.yellowSec,redSec:S.redSec,flashZero:S.flashZero,soundZero:S.soundZero,
    overtime:S.overtime,showProgress:S.showProgress,durationMs:S.durationMs,autoNext,
    bgColor:S.bgColor,fgColor:S.fgColor,useWarnColors:S.useWarnColors,
    warnYellow:S.warnYellow,warnRed:S.warnRed,textOnly:S.textOnly,transparent:S.transparent,
    showStart:S.showStart,showNowNext:S.showNowNext,
    gridOn:S.gridOn,gridSize:S.gridSize,gridCell:S.gridCell,fitWindow:S.fitWindow,
    outputSize:S.outputSize,outputLayout:S.outputLayout,dualTimer:S.dualTimer,dualSplit:S.dualSplit,
    separateOutputs:S.separateOutputs,liveTimerView:TimerTools.liveView(S.liveTimerView),deckLiveMode:S.deckLiveMode,
    secondary:{mode:S.secondary.mode,durationMs:S.secondary.durationMs,overtime:S.secondary.overtime,flashZero:S.secondary.flashZero,soundZero:S.secondary.soundZero,layout:S.secondary.layout,outputSize:S.secondary.outputSize,...TimerTools.grid(S.secondary)}
  }));
}
function load(){
  try{
    const st=JSON.parse(localStorage.getItem('pt_settings')||'{}');
    Object.assign(S,{
      yellowSec:st.yellowSec??S.yellowSec, redSec:st.redSec??S.redSec,
      flashZero:st.flashZero??S.flashZero, soundZero:st.soundZero??S.soundZero,
      overtime:st.overtime??S.overtime, showProgress:st.showProgress??S.showProgress,
      durationMs:st.durationMs??S.durationMs,
      bgColor:st.bgColor??S.bgColor, fgColor:st.fgColor??S.fgColor,
      useWarnColors:st.useWarnColors??S.useWarnColors,
      warnYellow:st.warnYellow??S.warnYellow, warnRed:st.warnRed??S.warnRed,
      textOnly:st.textOnly??S.textOnly, transparent:st.transparent??S.transparent,
      showStart:st.showStart??S.showStart, showNowNext:st.showNowNext??S.showNowNext,
      ...TimerTools.grid(st),
      fitWindow:st.fitWindow??S.fitWindow,
      outputSize:TimerTools.size(st.outputSize),outputLayout:TimerTools.layout(st.outputLayout),
      dualTimer:!!st.dualTimer,dualSplit:st.dualSplit==='rows'?'rows':'columns',separateOutputs:!!st.separateOutputs,liveTimerView:TimerTools.liveView(st.liveTimerView),deckLiveMode:['auto','fullscreen','window'].includes(st.deckLiveMode)?st.deckLiveMode:'auto',secondary:TimerTools.secondary(st.secondary,st)
    });
    S.remMs=S.durationMs; autoNext=!!st.autoNext;
    cues=JSON.parse(localStorage.getItem('pt_cues')||'[]');
  }catch(e){}
  $('showStartInput').value=S.showStart||''; $('chkNowNext').checked=S.showNowNext;
  $('yellowInput').value=fmtSecs(S.yellowSec,false);
  $('redInput').value=fmtSecs(S.redSec,false);
  $('chkFlash').checked=S.flashZero; $('chkSound').checked=S.soundZero;
  $('chkFlash2').checked=S.secondary.flashZero; $('chkSound2').checked=S.secondary.soundZero;
  $('chkOver').checked=S.overtime; $('chkOver2').checked=S.secondary.overtime; $('chkProg').checked=S.showProgress;
  $('chkAuto').checked=autoNext; cueDraftMs=S.durationMs;
  $('bgColor').value=S.bgColor; $('fgColor').value=S.fgColor;
  $('chkWarn').checked=S.useWarnColors; $('warnYellow').value=S.warnYellow; $('warnRed').value=S.warnRed;
  $('chkTextOnly').checked=S.textOnly; $('chkTransparent').checked=S.transparent;
  $('chkFit').checked=S.fitWindow;
  $('deckLiveMode').value=S.deckLiveMode;
  if(S.outputSize){ $('outputWidth').value=S.outputSize.width; $('outputHeight').value=S.outputSize.height; }
  syncDualUI();
  syncDurationDisplays();
  buildGrid();
  renderCues();
}
