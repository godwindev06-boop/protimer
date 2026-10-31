// ProTimer Control — monitori, mreža, QR, javni link, daljinske komande
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

// ---------- MONITORI ----------
function fillDisplays(list){
  lastDisplays = list || [];
  for(const id of ['displaySel','secondaryDisplaySel']){
    const sel=$(id),previous=sel.value,secondary=id==='secondaryDisplaySel';
    const active=lastDisplays.find(d=>secondary?d.hasSecondaryOutput:d.hasOutput);
    const fallback=lastDisplays.find(d=>!d.hasControl&&(!secondary||String(d.id)!==$('displaySel').value))||lastDisplays.find(d=>!secondary||String(d.id)!==$('displaySel').value)||lastDisplays[0];
    sel.replaceChildren();
    for(const d of lastDisplays){
      const o=document.createElement('option'); o.value=d.id;
      const roles=[];
      if(d.hasOutput) roles.push(t(TimerTools.separateOutputs(S)?'timerOne':'screenTag'));
      if(d.hasSecondaryOutput) roles.push(t('timerTwo'));
      if(d.hasControl) roles.push(t('controlTag'));
      o.textContent=`${d.label} (${d.width}×${d.height})${roles.length?' — '+roles.join(' · '):''}`;
      sel.appendChild(o);
    }
    sel.value=lastDisplays.some(d=>String(d.id)===previous)?previous:String((active||fallback)?.id??'');
  }
  $('btnOpenSecondaryOut').disabled=!lastDisplays.length;
  renderPlacementContext();
}
async function refreshDisplays(){ fillDisplays(await api.getDisplays()); }
api.onDisplays(fillDisplays);

// ---------- MREŽA ----------
let netUrl='', remoteUrl='', backstageUrl='', apiUrl='';
let selectedNetworkIp=localStorage.getItem('pt_network_ip')||'', lastAddressKey='';
let lastNetworkKey='', localCheckGeneration=0, localCheckPending=false;
const copyLinkIds={btnCopyUrl:'netUrl',btnCopyRemote:'netRemote',btnCopyBackstage:'netBackstage',btnCopyApi:'netApi',btnCopyPublic:'netPublic',btnCopyPublicRemote:'netPublicRemote'};
function networkLink(id){
  const online=lastNetInfo?.running?publicUrl:'';
  return {netUrl,netRemote:remoteUrl,netBackstage:backstageUrl,netApi:apiUrl,
    netPublic:online,netPublicRemote:online&&lastNetInfo?.token?`${online}/remote?t=${lastNetInfo.token}`:''}[id]||'';
}
function syncNetworkLinks(){
  for(const [id,linkId] of Object.entries(copyLinkIds)){
    const url=networkLink(linkId),btn=$(id),role=t(btn.closest('[data-link-role]').dataset.linkRole);
    $(linkId).textContent=url||'—';
    btn.disabled=!url||btn.getAttribute('aria-busy')==='true';
    btn.setAttribute('aria-label',`${t(linkId==='netApi'?'copyCommand':'copyLink')} · ${role}`);
  }
  document.querySelectorAll('.qrbtn').forEach(btn=>{
    btn.disabled=!networkLink(btn.dataset.qr);
    btn.setAttribute('aria-label',`${t('scanQr')} · ${t(btn.closest('[data-link-role]').dataset.linkRole)}`);
    btn.setAttribute('aria-controls','qrBox');
    btn.setAttribute('aria-expanded',String(!!qrShownFor&&qrShownFor===networkLink(btn.dataset.qr)));
  });
}
function showNet(info){
  lastNetInfo = info;
  const addresses=info?.addresses||(info?.ip?[{ip:info.ip,name:''}]:[]);
  if(!addresses.some(a=>a.ip===selectedNetworkIp)) selectedNetworkIp=addresses.find(a=>a.ip===info?.ip)?.ip||addresses[0]?.ip||'';
  const addressKey=JSON.stringify(addresses)+'|'+selectedNetworkIp+'|'+lang;
  if(addressKey!==lastAddressKey){
    lastAddressKey=addressKey; $('networkSel').replaceChildren();
    for(const a of addresses){ const option=document.createElement('option'); option.value=a.ip; option.textContent=`${a.ip} · ${a.name}`; $('networkSel').appendChild(option); }
    if(!addresses.length){ const option=document.createElement('option'); option.textContent=t('noNetwork'); $('networkSel').appendChild(option); }
    $('networkSel').value=selectedNetworkIp;
  }
  const ready=!!(info?.running&&info.port&&selectedNetworkIp);
  const key=JSON.stringify([ready,selectedNetworkIp,info?.port,info?.token]);
  if(key!==lastNetworkKey){
    lastNetworkKey=key; localCheckGeneration++; localCheckPending=false;
    closeQr(); $('localCheckStatus').textContent=''; $('networkFeedback').textContent='';
  }
  const nextUrl=ready?`http://${selectedNetworkIp}:${info.port}`:'';
  if(netUrl!==nextUrl) hideAudienceQrFor(netUrl);
  netUrl=nextUrl;
  remoteUrl=netUrl&&info.token?`${netUrl}/remote?t=${info.token}`:'';
  backstageUrl=netUrl?`${netUrl}/backstage`:'';
  apiUrl=netUrl&&info.token?`${netUrl}/cmd?type=start&t=${info.token}`:'';
  $('networkSel').disabled=!addresses.length;
  $('btnCheckLocal').disabled=!ready||localCheckPending;
  $('netDot').classList.toggle('on',ready);
  $('netStatus').textContent=t(!info?.running?'netOff':!addresses.length?'noNetwork':'serverReady');
  $('netConnections').textContent=info?.running?`${t('connectionCount')}: ${Math.max(0,Number(info.clients)||0)}. ${t('connectionHint')}`:'';
  $('apiHost').textContent=ready?selectedNetworkIp:'—'; $('apiPort').textContent=ready?info.port:'—'; $('oscPortLabel').textContent=ready&&info.oscPort?info.oscPort:'—';
  $('btnShare').disabled=!info?.running&&!publicUrl&&!shareStarting;
  updatePublicRemote();
}
$('networkSel').addEventListener('change',e=>{ selectedNetworkIp=e.target.value; localStorage.setItem('pt_network_ip',selectedNetworkIp); showNet(lastNetInfo); });
$('btnCheckLocal').addEventListener('click',async()=>{
  const ip=selectedNetworkIp,generation=++localCheckGeneration; localCheckPending=true; $('btnCheckLocal').disabled=true; $('localCheckStatus').textContent=t('checkingLocal');
  try{ const result=await api.checkLocalNetwork(ip); if(generation===localCheckGeneration) $('localCheckStatus').textContent=t(result?.ok?'localCheckOK':'localCheckFailed'); }
  catch(_){ if(generation===localCheckGeneration) $('localCheckStatus').textContent=t('localCheckFailed'); }
  finally{ if(generation===localCheckGeneration){ localCheckPending=false; $('btnCheckLocal').disabled=!netUrl; } }
});
api.onNetworkInfo(showNet);
api.getNetworkInfo().then(showNet).catch(()=>{});
function copyBtn(btn, getUrl){ btn.addEventListener('click',async()=>{
  const url=getUrl(); if(!url) return;
  btn.disabled=true; btn.setAttribute('aria-busy','true');
  try{
    await navigator.clipboard.writeText(url);
    $('networkFeedback').textContent=`${t('copySuccess')} · ${t(btn.closest('[data-link-role]').dataset.linkRole)}`;
  } catch(_){ $('networkFeedback').textContent=t('copyFailed'); }
  finally{ btn.removeAttribute('aria-busy'); syncNetworkLinks(); }
}); }
for(const [id,linkId] of Object.entries(copyLinkIds)) copyBtn($(id),()=>networkLink(linkId));

// ---------- QR KOD ----------
let qrShownFor='', audienceQrShownFor='', qrGeneration=0, qrTrigger=null;
function closeQr(returnFocus=false){
  qrGeneration++; $('qrBox').style.display='none'; $('qrBox').replaceChildren(); qrShownFor='';
  document.querySelectorAll('.qrbtn').forEach(b=>b.setAttribute('aria-expanded','false'));
  if(returnFocus&&qrTrigger?.isConnected) qrTrigger.focus(); qrTrigger=null;
}
function applyOutputQrState(info){
  audienceQrShownFor=(info&&info.url)||'';
  $('btnHideOutputQr').style.display=audienceQrShownFor?'block':'none';
}
function hideAudienceQrFor(base){
  if(base&&(audienceQrShownFor===base||audienceQrShownFor.startsWith(base+'/'))){ api.hideOutputQr(); applyOutputQrState(null); }
}
api.onOutputQr(applyOutputQrState);
document.querySelectorAll('details.network-role').forEach(detail=>detail.addEventListener('toggle',()=>{
  if(!detail.open&&qrTrigger?.closest('.network-role')===detail) closeQr();
}));
$('onlineSharing').addEventListener('toggle',()=>{ if(!$('onlineSharing').open&&qrTrigger?.dataset.qr.startsWith('netPublic')) closeQr(); });
document.querySelectorAll('.qrbtn').forEach(b=>b.addEventListener('click',async ()=>{
  const url=networkLink(b.dataset.qr);
  const box=$('qrBox');
  if(!url) return;
  if(qrShownFor===url){ closeQr(true); return; }
  closeQr(); const generation=qrGeneration; qrTrigger=b;
  try{
    const svg=await api.qr(url);
    if(generation!==qrGeneration||url!==networkLink(b.dataset.qr)) return;
    if(!svg) throw new Error('QR unavailable');
    box.innerHTML=svg;
    const heading=document.createElement('div'); heading.className='qr-heading';
    const title=document.createElement('strong'); title.textContent=t(b.closest('[data-link-role]').dataset.linkRole); heading.appendChild(title);
    const close=document.createElement('button'); close.type='button'; close.className='qr-close'; close.textContent='×'; close.setAttribute('aria-label',t('qrClose')); close.addEventListener('click',()=>closeQr(true)); heading.appendChild(close); box.prepend(heading);
    const help=document.createElement('p'); help.textContent=t(url.startsWith('https:')?'qrOnlineHint':'qrLocalHint'); box.appendChild(help);
    const lbl=document.createElement('div'); lbl.className='qrlbl'; lbl.textContent=url; box.appendChild(lbl);
    const privacy=document.createElement('p'); privacy.textContent=t(b.dataset.audienceQr?'qrOutputHint':'qrPrivateHint'); box.appendChild(privacy);
    if(b.dataset.audienceQr){
      const action=document.createElement('button'); action.type='button'; action.className='primary audience-qr-action'; action.textContent=t('showQrOnScreen');
      action.addEventListener('click',async ()=>{
        if(generation!==qrGeneration||url!==networkLink(b.dataset.qr)) return;
        const backstage=b.dataset.audienceQr==='backstage';
        action.disabled=true;
        try{
          const ok=await api.showOutputQr({url,label:t(backstage?'audienceQrBackstage':'audienceQrTitle'),hint:t('audienceQrHint'),displayId:+$('displaySel').value||null});
          if(ok===false) throw new Error('Output rejected');
          applyOutputQrState({url});
        } catch(_){ privacy.textContent=t('qrOutputFailed'); }
        finally{ action.disabled=false; }
      });
      box.appendChild(action);
    }
    b.closest('.network-role').after(box); box.style.display='block'; qrShownFor=url; syncNetworkLinks(); box.scrollIntoView({block:'nearest'}); close.focus({preventScroll:true});
  } catch(_){ if(generation===qrGeneration) $('networkFeedback').textContent=t('qrFailed'); }
}));
$('qrBox').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); closeQr(true); } });
$('btnHideOutputQr').addEventListener('click',()=>{ api.hideOutputQr(); applyOutputQrState(null); });

// ---------- JAVNI LINK (tunel) ----------
let publicUrl='', shareStarting=false, shareProvider=null, shareRequest=0;
function updatePublicRemote(){
  $('publicRow').hidden=!networkLink('netPublic');
  $('publicRemoteSection').hidden=!networkLink('netPublicRemote');
  syncNetworkLinks();
}
function applyShare(info){
  const previous=publicUrl;
  publicUrl = (info&&info.url)||'';
  shareStarting = !!(info&&info.starting);
  shareProvider = (info&&info.provider)||null;
  if(previous!==publicUrl) hideAudienceQrFor(previous);
  if(publicUrl||shareStarting) $('shareError').hidden=true;
  if(previous!==publicUrl&&qrTrigger?.dataset.qr.startsWith('netPublic')) closeQr();
  updatePublicRemote();
  $('shareStatus').textContent=t(publicUrl?'onlineReady':shareStarting?'connecting':'onlineOff')+(publicUrl&&shareProvider?` · ${shareProvider==='cloudflare'?'Cloudflare':'Localtunnel'}`:'');
  $('btnShare').textContent=t(publicUrl?'stopSharing':shareStarting?'cancelSharing':'shareOnline');
  $('btnShare').classList.toggle('on',!!publicUrl);
  $('btnShare').disabled=!lastNetInfo?.running&&!publicUrl&&!shareStarting;
}
api.onShareInfo(applyShare);
api.shareInfo().then(applyShare).catch(()=>{});
$('btnShare').addEventListener('click',async ()=>{
  const request=++shareRequest;
  try{
    if(publicUrl||shareStarting){ await api.shareStop(); if(request===shareRequest) applyShare(await api.shareInfo()); return; }
    $('shareError').hidden=true; applyShare({starting:true});
    const result=await api.shareStart();
    if(request!==shareRequest) return;
    applyShare(await api.shareInfo());
    if(!result||(result.error&&result.error!=='cancelled')) $('shareError').hidden=false;
  } catch(_){
    if(request!==shareRequest) return;
    // Re-read instead of assuming a failed IPC call stopped an existing tunnel.
    try{ applyShare(await api.shareInfo()); } catch(_){ applyShare({url:publicUrl,starting:false,provider:shareProvider}); }
    $('shareError').hidden=false;
  }
});

// ---------- DALJINSKI: primena komandi sa telefona ----------
api.onRemoteCmd(c=>{
  if(!c||!c.type) return;
  switch(c.type){
    case 'start': startPause(); break;
    case 'reset': reset(); break;
    case 'primaryRunning': primaryRunning(c.value===true); break;
    case 'secondaryRunning': secondaryRunning(c.value===true); break;
    case 'secondaryReset': TimerTools.reset(S.secondary); send(); break;
    case 'secondaryDuration': secondaryDuration(Number(c.value)); break;
    case 'bothRunning': bothRunning(c.value===true); break;
    case 'bothReset': TimerTools.reset(S.secondary); reset(); break;
    case 'adjust': adjust(+c.value||0); break;
    case 'go': go(); break;
    case 'blackout': $('btnBlackout').click(); break;
    case 'setDuration': if(+c.value>0){ currentCue=-1; renderCues(); setDuration(+c.value); } break;
    case 'mode': if(['countdown','countup','clock'].includes(c.value)) setMode(c.value); break;
    case 'message': S.message={text:String(c.value||''),flash:false}; $('msgInput').value=S.message.text; send(); break;
    case 'clearMessage': S.message={text:'',flash:false}; $('msgInput').value=''; send(); break;
    case 'text': S.text=String(c.value||''); $('textInput').value=S.text; send(); break;
    case 'clearText': S.text=''; $('textInput').value=''; send(); break;
    case 'textOnly': S.textOnly=!!c.value; $('chkTextOnly').checked=S.textOnly; lastKey=''; send(); break;
  }
});
