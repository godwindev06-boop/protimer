// ProTimer Control — dugmad rundown-a/izlaza, prečice, jezik
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

$('cueName').addEventListener('keydown',e=>{ if(e.key==='Enter') addCue(); });
$('cueNote').addEventListener('keydown',e=>{ if(e.key==='Enter') addCue(); });
$('btnRundownStart').addEventListener('click',rundownPlay);
$('btnGo').addEventListener('click',go);
$('btnCuePrevious').addEventListener('click',()=>requestCueLoad(cues[currentCue-1],true));
$('btnCueReset').addEventListener('click',()=>requestCueAction(t('cueResetConfirm'),()=>{ if(cues[currentCue]) setDuration(cues[currentCue].durationMs); }));
$('btnRundownRestart').addEventListener('click',()=>requestCueLoad(cues[0],true));
$('btnCueLoad').addEventListener('click',()=>requestCueLoad(selectedCue,false));
$('btnCueRun').addEventListener('click',()=>requestCueLoad(selectedCue,true));
$('btnCueEdit').addEventListener('click',editSelectedCue);
$('btnCueDuplicate').addEventListener('click',duplicateSelectedCue);
$('btnCueDelete').addEventListener('click',deleteSelectedCue);
$('btnCueDeselect').addEventListener('click',()=>{ selectedCue=null; renderCues(); });
$('btnCueUndo').addEventListener('click',undoCueDelete);
$('btnCueCancelEdit').addEventListener('click',cancelCueEdit);
$('btnCueNew').addEventListener('click',()=>{ cancelCueEdit(); $('cueEditor').open=true; $('cueName').focus(); });
$('btnCueReveal').addEventListener('click',()=>revealCue());
$('btnCueConfirm').addEventListener('click',()=>{ const action=pendingCueAction; cancelCueAction(); if(action) action(); });
$('btnCueCancelAction').addEventListener('click',cancelCueAction);
$('btnPlanNow').addEventListener('click',()=>{ S.showStart=clock(Date.now()); $('showStartInput').value=S.showStart; send(); renderCues(); });
$('btnPlanClear').addEventListener('click',()=>{ S.showStart=''; $('showStartInput').value=''; send(); renderCues(); });
$('cueConfirm').addEventListener('keydown',e=>{ if(e.key==='Escape'){ cancelCueAction(); $('btnRundownStart').focus(); } e.stopPropagation(); });
$('showStartInput').addEventListener('change',e=>{ S.showStart=e.target.value; send(); renderCues(); });
$('chkNowNext').addEventListener('change',e=>{ S.showNowNext=e.target.checked; send(); });
// veličina naslova aktivne stavke na ekranu (40–250 %, 100 = automatski)
for(const id of ['cueTitleScale','cueTitleScaleValue']) $(id).addEventListener('input',e=>{
  const value=clampCueTitleScale(e.target.value); if(value===null) return;
  S.cueTitleScale=value; syncCueTitleScale(e.target.id); send();
});
$('cueTitleScaleValue').addEventListener('change',()=>syncCueTitleScale());

$('btnOpenOut').addEventListener('click',()=>api.sendToDisplay(+$('displaySel').value||null));
$('btnCloseOut').addEventListener('click',()=>api.closeOutput());
$('btnFs').addEventListener('click',()=>api.toggleFullscreen());
$('btnOpenSecondaryOut').addEventListener('click',async()=>{
  $('btnOpenSecondaryOut').disabled=true;
  try {
    const result=await api.openSecondaryOutput(Number($('secondaryDisplaySel').value));
    if(!result?.ok) $('secondaryOutputStatus').textContent=t('secondaryOutputFailed');
  } catch(_){ $('secondaryOutputStatus').textContent=t('secondaryOutputFailed'); }
  finally { $('btnOpenSecondaryOut').disabled=!lastDisplays.length; }
});
$('btnCloseSecondaryOut').addEventListener('click',()=>api.closeSecondaryOutput());
$('btnSecondaryFs').addEventListener('click',()=>api.toggleSecondaryFullscreen());
$('chkOnTop').addEventListener('change',e=>api.setOnTop(e.target.checked));
$('chkFit').addEventListener('change',e=>{ S.fitWindow=e.target.checked; lastKey=''; send(); });
api.onOutputState(open=>{ outputOpen=open; if(!open) applyOutputQrState(null); });
api.isOutputOpen().then(open=>{ outputOpen=open; }).catch(()=>{});

// Prečice
document.addEventListener('keydown',e=>{
  if(document.querySelector('.pt-deck-dialog[open]'))return;
  if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey) return;
  const tag=e.target.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||tag==='BUTTON'||tag==='SUMMARY'||e.target.isContentEditable){ if(e.key==='Escape') e.target.blur(); return; }
  switch(e.key){
    case ' ': e.preventDefault(); startPause(); break;
    case 'r': case 'R': reset(); break;
    case 'b': case 'B': $('btnBlackout').click(); break;
    case 'f': case 'F': api.toggleFullscreen(); break;
    case 'm': case 'M': e.preventDefault(); $('msgInput').focus(); break;
    case 'c': case 'C': $('btnMsgClear').click(); break;
    case 'n': case 'N': go(); break;
    case 'ArrowUp': e.preventDefault(); adjust(60); break;
    case 'ArrowDown': e.preventDefault(); adjust(-60); break;
    case 'ArrowRight': e.preventDefault(); adjust(10); break;
    case 'ArrowLeft': e.preventDefault(); adjust(-10); break;
  }
});
window.addEventListener('resize',()=>{ lastKey=''; });

// jezik / language
document.querySelectorAll('.lang button').forEach(b=>b.addEventListener('click',()=>{
  lang=b.dataset.lang; localStorage.setItem('pt_lang',lang); S.lang=lang; applyLang(); send();
}));
