// ProTimer Control — uvoz/izvoz rundown-a (CSV/TSV)
// Klasičan skript (ne ES modul): deli globalni opseg sa ostalim controller/*.js; redosled učitavanja je u controller.html.

// ---------- LEPLJENJE RUNDOWN-a IZ EXCEL / SHEETS ----------
// Prihvata TSV i CSV tekst: naziv, trajanje[, beleška[, boja]]
// Trajanje: "10" (min), "10:00" (MM:SS), "1:00:00" (HH:MM:SS). Red bez validnog trajanja se preskače.
function parseRundownCSV(txt){
  const out=[];
  for(let line of (txt||'').split(/\r?\n/)){
    line=line.trim(); if(!line) continue;
    // Izaberi delimiter samo među znacima van navodnika (beleška može sadržati zarez).
    let inQuote=false, tabs=0, semis=0, commas=0;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){
        if(inQuote&&line[i+1]==='"') i++; else inQuote=!inQuote;
      } else if(!inQuote){ if(ch==='\t') tabs++; else if(ch===';') semis++; else if(ch===',') commas++; }
    }
    const delim=tabs?'\t':(semis>commas?';':',');
    // podeli poštujući navodnike
    const cells=[]; let cur='', inQ=false;
    for(let i=0;i<line.length;i++){ const ch=line[i];
      if(ch==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; }
      else if(ch===delim&&!inQ){ cells.push(cur); cur=''; }
      else cur+=ch; }
    cells.push(cur);
    const c=cells.map(x=>x.trim());
    const ms=parseTime(c[1]);
    if(ms===null||ms<=0) continue;   // zaglavlje ili neispravan red
    out.push({name:(c[0]||`Cue ${out.length+1}`).slice(0,160), durationMs:ms, note:(c[2]||'').slice(0,240),
      color:/^#[0-9a-fA-F]{6}$/.test(c[3]||'')?c[3]:''});
  }
  return out;
}
// ---------- IZVOZ / UVOZ CSV FAJLA ----------
// Izvoz: "Naziv;Trajanje;Beleška;Boja", trajanje HH:MM:SS, UTF-8 sa BOM (Excel prepoznaje akcente).
// Separator ";" otvara kolone direktno u Excelu sa evropskim podešavanjima; parseRundownCSV ga čita nazad.
const RUNDOWN_CSV_HEADER=['Name','Duration','Note','Color'];
function csvCell(value){
  const text=String(value??'').replace(/[\r\n]+/g,' ').trim();
  return /[;",\t]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}
function rundownToCSV(list){
  const rows=[RUNDOWN_CSV_HEADER.join(';')];
  for(const cue of list||[])
    rows.push([cue.name,formatDurationHMS(cue.durationMs),cue.note||'',cue.color||''].map(csvCell).join(';'));
  return rows.join('\r\n')+'\r\n';
}
function rundownFileName(now=new Date()){
  const d=n=>String(n).padStart(2,'0');
  return `protimer-rundown-${now.getFullYear()}-${d(now.getMonth()+1)}-${d(now.getDate())}.csv`;
}
function cueMessage(key,values){
  let text=t(key); for(const [k,v] of Object.entries(values||{})) text=text.split('{'+k+'}').join(String(v));
  $('cueFeedback').hidden=false; $('cueFeedbackText').textContent=text; $('btnCueUndo').hidden=!removedCue;
}
function exportRundownCSV(){
  if(!cues.length){ cueMessage('cueExportEmpty'); return; }
  const blob=new Blob(['\ufeff'+rundownToCSV(cues)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url; link.download=rundownFileName(); document.body.appendChild(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  cueMessage('cueExportDone',{n:cues.length});
}
let pendingImport=null;
function rundownIsLive(){ return S.running&&currentCue>=0&&currentCue<cues.length; }
function closeImportChoice(){ pendingImport=null; $('cueImportChoice').hidden=true; }
function applyImport(items,replace){
  closeImportChoice(); cancelAutoAdvance();
  if(replace){
    if(rundownIsLive()) { cueMessage('cueImportLiveHint'); return; }
    if(editingCue) cancelCueEdit();
    cues=items.slice(); currentCue=-1; selectedCue=null; removedCue=null; rundownHasRun=false;
  } else cues=cues.concat(items);
  saveCues(); send(); renderCues();
  requestAnimationFrame(()=>{ const list=$('cueList'); list.scrollTop=replace?0:list.scrollHeight; });
  cueMessage('cueImportDone',{n:items.length});
}
function importRundownFile(text){
  const items=parseRundownCSV(String(text||'').replace(/^\ufeff/,''));
  if(!items.length){ cueMessage('cueImportNone'); return 0; }
  if(!cues.length){ applyImport(items,true); return items.length; }
  cancelCueAction(); pendingImport=items;
  const live=rundownIsLive();
  $('cueImportChoiceText').textContent=t('cueImportChoice').replace('{new}',items.length).replace('{old}',cues.length)+(live?' '+t('cueImportLiveHint'):'');
  $('btnCueImportReplace').disabled=live;
  $('cueImportChoice').hidden=false; $((live?'btnCueImportAppend':'btnCueImportCancel')).focus();
  return items.length;
}
$('btnCueExport').addEventListener('click',exportRundownCSV);
$('btnCueImport').addEventListener('click',()=>{ const input=$('cueImportFile'); input.value=''; input.click(); });
$('cueImportFile').addEventListener('change',e=>{
  const file=e.target.files&&e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>importRundownFile(reader.result);
  reader.onerror=()=>cueMessage('cueImportReadError');
  reader.readAsText(file,'utf-8');
});
$('btnCueImportReplace').addEventListener('click',()=>{ if(pendingImport) applyImport(pendingImport,true); });
$('btnCueImportAppend').addEventListener('click',()=>{ if(pendingImport) applyImport(pendingImport,false); });
$('btnCueImportCancel').addEventListener('click',closeImportChoice);
$('cueImportChoice').addEventListener('keydown',e=>{ if(e.key==='Escape') closeImportChoice(); e.stopPropagation(); });

function importRundownText(txt){
  const items=parseRundownCSV(txt);
  if(!items.length){ alert(t('cueImportNone')); return 0; }
  cues=cues.concat(items); saveCues(); send(); renderCues();
  requestAnimationFrame(()=>{ const list=$('cueList'); list.scrollTop=list.scrollHeight; });
  return items.length;
}
// nalepi direktno iz Excel/Sheets bilo gde u rundown karticu (TSV)
document.querySelector('.cuewrap').addEventListener('paste',e=>{
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea') return;   // ne otimaj paste iz polja
  const txt=(e.clipboardData||{}).getData?e.clipboardData.getData('text'):'';
  if(txt&&txt.includes('\t')){ e.preventDefault(); importRundownText(txt); }
});
