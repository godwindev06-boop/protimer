// ProTimer Control — pokretanje
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

// ---------- START ----------
load(); $('cueEditor').open=!cues.length; refreshDisplays(); send(); updateButtons(); applyLang(); syncCueColors(); setInterval(tickCountdown,50); requestAnimationFrame(render);
// New explicit commands share the existing authoritative timer objects. In
// particular START SET is one synchronous mutation followed by one state send.
async function applyDeckOperation(op){
  const now=engineClock.sample(),primary=op.timerId==='t1', timer=primary?S:S.secondary;
  if(['startSet','loadSet','start','pause','resume','reset','adjust'].includes(op.type)){
    if(!primary&&!S.dualTimer) return {ok:false,code:'TIMER_DISABLED',message:'Enable Timer 2 in Control first.'};
    if(op.type==='loadSet'&&timer.running)return {ok:false,code:'ACTIVE_RUNNING',message:'Pause ACTIVE before loading READY.'};
    if(primary){cancelAutoAdvance();clearTargetArm(true);}
    if(op.type==='startSet'||op.type==='loadSet'){
      const start=op.type==='startSet';
      Object.assign(timer,{mode:op.mode,durationMs:op.durationMs,remMs:op.durationMs,elapsedMs:0,startAt:start?now:0,endAt:start?now+op.durationMs:0,running:start&&op.mode!=='clock'});
      if(primary){currentCue=-1;zeroFired=false;setModeTabs();renderCues();}
    }else if(op.type==='reset'){
      timer.durationMs=op.durationMs;TimerTools.reset(timer);if(primary)zeroFired=false;
    }else if(op.type==='adjust'){
      if(timer.running)timer.endAt+=op.deltaMs;
      else timer.remMs=(timer.overtime??S.overtime)?timer.remMs+op.deltaMs:Math.max(0,timer.remMs+op.deltaMs);
      timer.durationMs=Math.max(1000,Math.min(TimerTools.MAX_DURATION,timer.durationMs+op.deltaMs));
      if(primary&&(timer.running?timer.endAt-now:timer.remMs)>0)zeroFired=false;
    }else TimerTools.setRunning(timer,op.type!=='pause',now);
    send();updateButtons();return {ok:true};
  }
  if(['blackout','blackoutOn','blackoutOff'].includes(op.type)){S.blackout=op.type==='blackout'?!S.blackout:op.type==='blackoutOn';$('btnBlackout').classList.toggle('on',S.blackout);send();return {ok:true};}
  if(['liveT1','liveT2','liveBoth'].includes(op.type)){
    if(op.type!=='liveT1'&&!S.dualTimer)return {ok:false,code:'TIMER_DISABLED',message:'Enable Timer 2 in Control first.'};
    const output={view:{liveT1:'t1',liveT2:'t2',liveBoth:'both'}[op.type],mode:S.deckLiveMode,
      displayId:Number($('displaySel').value),secondaryDisplayId:Number($('secondaryDisplaySel').value)};
    const checked=await api.deckInvoke('output',{...output,action:'liveCheck'});
    if(!checked.ok)return checked;
    const previous={liveTimerView:S.liveTimerView,blackout:S.blackout};
    S.liveTimerView=output.view;S.blackout=false;$('btnBlackout').classList.remove('on');send();
    const applied=await api.deckInvoke('output',{...output,action:'live'});
    if(!applied.ok){Object.assign(S,previous);$('btnBlackout').classList.toggle('on',S.blackout);send();}
    return applied;
  }
  if(op.type==='prev'||op.type==='next'){
    if(!cues.length)return {ok:false,code:'NO_CUE',message:'The rundown is empty.'};
    const i=cues.indexOf(selectedCue);selectedCue=cues[Math.max(0,Math.min(cues.length-1,i<0?0:i+(op.type==='next'?1:-1)))];renderCues();revealCue(cues.indexOf(selectedCue));return {ok:true};
  }
  if(op.type==='loadSelected')return selectedCue?{ok:true,cue:{durationMs:selectedCue.durationMs}}:{ok:false,code:'NO_CUE',message:'Select a rundown item first.'};
  if(op.type==='message'){
    if(op.text===undefined){const focused=await api.deckInvoke('focusControl');if(!focused.ok)return focused;$('msgInput').scrollIntoView({block:'center'});$('msgInput').focus();return {ok:true};}
    S.message={text:op.text,flash:!!op.flash};$('msgInput').value=op.text;send();return {ok:true};
  }
  if(['outputA','outputB','fullscreen'].includes(op.type)){
    const role=(op.type==='outputB'||op.type==='fullscreen'&&op.output==='b')?'secondary':'primary';
    return api.deckInvoke('output',{role,action:op.type==='fullscreen'?'fullscreen':op.action,displayId:+$(role==='secondary'?'secondaryDisplaySel':'displaySel').value});
  }
  return {ok:false,code:'UNSUPPORTED_OPERATION'};
}
if(window.ProTimerDeckController&&api.deckInvoke)ProTimerDeckController({
  element:$('streamDeckHost'),language:()=>lang,blackout:()=>S.blackout,audio:bellAudio,
  liveView:()=>TimerTools.liveView(S.liveTimerView),separateOutputs:()=>TimerTools.separateOutputs(S),outputOpen:role=>role==='b'?!!lastSecondaryGeometry:outputOpen,
  readActive:id=>{engineClock.sample();const timer=id==='t1'?S:S.secondary;return {...timer,enabled:id==='t1'||S.dualTimer,overtime:timer.overtime??S.overtime};},
  readRundown:()=>({selected:selectedCue}),applyOperation:applyDeckOperation,
  color:id=>id==='t1'?calc(Date.now()).fg:(S.secondary.mode&&S.secondary.mode!=='countdown')?S.fgColor:(TimerTools.remaining(S.secondary,Date.now())<=0?S.warnRed:S.fgColor),
  notice:message=>{const el=document.getElementById('deckCommandNotice')||document.createElement('p');el.id='deckCommandNotice';el.setAttribute('role','status');el.textContent=message;$('streamDeckHost').appendChild(el);}
},api).then(value=>{deckControl=value;}).catch(()=>{$('streamDeckHost').textContent=lang==='sr'?'Stream Deck nije dostupan. Tajmer radi normalno.':'Stream Deck is unavailable. The timer is unaffected.';});
