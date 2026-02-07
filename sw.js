/* =========================
   VERSION
========================= */
const APP_VERSION = "EntrenoApp 1.4 AUTO-SERIE";

/* =========================
   STORAGE KEYS
========================= */
const LS_LOG = "bilbo_log_v3";
const LS_PHASES = "bilbo_phases_v1";
const LS_ACTIVE_PHASE = "bilbo_active_phase_v1";

/* =========================
   UTILS
========================= */
function uid(){
  return Date.now().toString(36)+Math.random().toString(36).slice(2);
}
function todayISO(){ return new Date().toISOString().slice(0,10); }

/* =========================
   FASES
========================= */
function readPhases(){
  try{
    const p = JSON.parse(localStorage.getItem(LS_PHASES));
    if(p && p.length) return p;
  }catch(e){}
  return [{id:"phase_default",name:"Fase principal"}];
}
function writePhases(p){ localStorage.setItem(LS_PHASES,JSON.stringify(p)); }
function getActivePhaseId(){
  const id = localStorage.getItem(LS_ACTIVE_PHASE);
  const p = readPhases();
  if(id && p.find(x=>x.id===id)) return id;
  localStorage.setItem(LS_ACTIVE_PHASE,p[0].id);
  return p[0].id;
}

/* =========================
   LOG
========================= */
function readLogAll(){
  try{
    return JSON.parse(localStorage.getItem(LS_LOG))||[];
  }catch(e){return[]}
}
function writeLogAll(arr){
  localStorage.setItem(LS_LOG,JSON.stringify(arr));
}
function readLog(){
  const pid = getActivePhaseId();
  return readLogAll().filter(x=>x.phaseId===pid);
}
function writeLogForActivePhase(arr){
  const pid = getActivePhaseId();
  const all = readLogAll().filter(x=>x.phaseId!==pid);
  arr.forEach(x=>x.phaseId=pid);
  writeLogAll([...arr,...all]);
}

/* =========================
   AUTO SERIE
========================= */
function getLastSerie(){
  const log = readLog();
  if(!log.length) return null;
  return log.sort((a,b)=>b.ts-a.ts)[0];
}
function nextSerie(n){
  const v=parseInt(n);
  if(!isNaN(v)) return v+1;
  return 1;
}

/* =========================
   MODAL
========================= */
let EDITING=null;

function abrirModalSerie(ejercicio="",prefill=null,forceNew=false){
  const modal=document.getElementById("modal");
  modal.classList.add("show");

  const ex=document.getElementById("mEjercicio");
  const peso=document.getElementById("mPeso");
  const reps=document.getElementById("mReps");
  const serie=document.getElementById("mSerie");
  const rpe=document.getElementById("mRpe");

  if(prefill && !forceNew){
    EDITING=prefill.id;
    ex.value=prefill.ejercicio;
    peso.value=prefill.peso;
    reps.value=prefill.reps;
    serie.value=prefill.serie;
    rpe.value=prefill.rpe;
    return;
  }

  EDITING=null;

  // ===== AUTO-SERIE =====
  if(prefill && forceNew){
    ex.value=prefill.ejercicio||"";
    peso.value=prefill.peso||"";
    reps.value=prefill.reps||"";
    serie.value=prefill.serie||1;
    rpe.value=prefill.rpe||"";
    return;
  }

  ex.value=ejercicio||"";
  peso.value="";
  reps.value="";
  serie.value=1;
  rpe.value="";
}

function cerrarModalSerie(){
  document.getElementById("modal").classList.remove("show");
}

/* =========================
   GUARDAR
========================= */
function guardarSerie(){
  const ejercicio=document.getElementById("mEjercicio").value.trim();
  const peso=document.getElementById("mPeso").value;
  const reps=document.getElementById("mReps").value;
  const serie=document.getElementById("mSerie").value;
  const rpe=document.getElementById("mRpe").value;

  if(!ejercicio||!reps||!serie){
    alert("Faltan datos");
    return;
  }

  const log=readLog();

  // EDITAR
  if(EDITING){
    const idx=log.findIndex(x=>x.id===EDITING);
    if(idx>=0){
      log[idx]={...log[idx],ejercicio,peso,reps,serie,rpe};
      writeLogForActivePhase(log);
      cerrarModalSerie();
      renderLog();
      return;
    }
  }

  // ===== AUTO-SERIE INTELIGENTE =====
  const last=getLastSerie();
  let serieFinal=serie;

  if(last && last.ejercicio.toLowerCase()===ejercicio.toLowerCase()){
    serieFinal=nextSerie(last.serie);
  }

  const item={
    id:uid(),
    ts:Date.now(),
    date:todayISO(),
    ejercicio,
    peso,
    reps,
    serie:serieFinal,
    rpe,
    phaseId:getActivePhaseId()
  };

  log.unshift(item);
  writeLogForActivePhase(log);

  cerrarModalSerie();
  renderLog();
}

/* =========================
   BOTONES
========================= */
function registrarSerie(){
  abrirModalSerie("");
}

function repetirUltimaSerieMasUno(){
  const last=getLastSerie();
  if(!last){ alert("No hay series"); return; }

  abrirModalSerie(last.ejercicio,{
    ejercicio:last.ejercicio,
    peso:last.peso,
    reps:last.reps,
    serie:nextSerie(last.serie),
    rpe:last.rpe
  },true);
}

/* =========================
   LOG UI
========================= */
function renderLog(){
  const box=document.getElementById("logList");
  if(!box) return;

  const log=readLog();
  box.innerHTML="";

  log.forEach(it=>{
    const d=document.createElement("div");
    d.className="log-card";
    d.textContent=`${it.ejercicio}
Serie ${it.serie} · ${it.peso}kg · ${it.reps} reps`;
    box.appendChild(d);
  });
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded",()=>{
  renderLog();

  document.getElementById("modalSave").onclick=guardarSerie;
  document.getElementById("modalCancel").onclick=cerrarModalSerie;
  document.getElementById("modalClose").onclick=cerrarModalSerie;
});
