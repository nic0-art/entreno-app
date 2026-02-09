/* =========================
   Entreno App — Bilbo Pro PWA
========================= */

const APP_VERSION = "EntrenoApp-PWA 2.2 SESSIONS+TRAFFIC";
const CACHE_VERSION = "entreno-cache-v3";

/* =========================
   Keys
========================= */
const LS_DAY_OVERRIDE = "entreno_day_override_v1";
const LS_PHASES = "entreno_phases_v1";
const LS_ACTIVE_PHASE = "entreno_active_phase_v1";
const LS_LOG_ALL = "entreno_log_v4";
const LS_MISSION = "entreno_mission_v1";
const LS_MIGRATED = "entreno_migrated_to_v4";
const LS_FAVS = "entreno_favs_v1";
const LS_REST = "entreno_rest_settings_v1";
const LS_TARGETS = "entreno_targets_v1";

/* LOG */
let LOG_QUERY = "";
let LOG_VIEW = "sessions"; // "list" | "sessions"
let SESSION_EXPANDED = {}; // date -> boolean

/* =========================
   Helpers
========================= */
function showToast(msg){
  const t = document.getElementById("toast");
  if(!t) return;
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(()=> t.style.display="none", 1400);
}
function uid(){
  try { return crypto.randomUUID(); }
  catch(e){ return String(Date.now()) + "_" + Math.random().toString(16).slice(2); }
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function toNum(v){
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function startOfWeekISO(date = new Date()){
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0=lunes
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - day);
  return d;
}
function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function iso(d){ return d.toISOString().slice(0,10); }
function fmtShort(isoDate){
  const [y,m,d] = isoDate.split("-");
  return `${d}/${m}`;
}
function norm(s){ return String(s||"").toLowerCase().trim(); }
function withinLastDays(ts, days){
  const ms = days * 24 * 60 * 60 * 1000;
  return (Date.now() - ts) <= ms;
}
function fmtKg(n){
  if(!Number.isFinite(n)) return "-";
  const v = Math.round(n * 10) / 10;
  return `${v}`;
}

/* =========================
   NAV / Screens
========================= */
const screens = {};
function initScreens(){
  screens.mision  = document.getElementById("screen-mision");
  screens.entreno = document.getElementById("screen-entreno");
  screens.log     = document.getElementById("screen-log");
  screens.nivel   = document.getElementById("screen-nivel");
  screens.stats   = document.getElementById("screen-stats");
  screens.cal     = document.getElementById("screen-cal");
  screens.graf    = document.getElementById("screen-graf");
  screens.ajustes = document.getElementById("screen-ajustes");
}
function showScreen(key){
  Object.values(screens).forEach(s=>s?.classList.remove("active"));
  if(screens[key]) screens[key].classList.add("active");
}
function setActiveNav(key){
  document.querySelectorAll(".nav button").forEach(b=>{
    b.classList.toggle("active", b.getAttribute("data-screen") === key);
  });
}
function bindNav(){
  document.querySelectorAll(".nav button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.getAttribute("data-screen");
      setActiveNav(key);
      showScreen(key);

      if(key==="log") renderLog();
      if(key==="nivel") renderNivel();
      if(key==="stats") renderStats();
      if(key==="cal") renderCalendar();
      if(key==="graf") renderCharts();
      if(key==="entreno") renderWorkoutToday();
      if(key==="ajustes"){
        refreshPwaStatus();
        renderPhasesUI();
        renderFavsUI();
        loadRestSettingsUI();
        loadTargetsUI();
      }
    });
  });
}

/* =========================
   Bilbo Pro 4D
========================= */
const splitDays = [
  { key:"D1", name:"D1 · Empuje + Gemelo", focus:"Pecho/Hombro/Tríceps + Gemelo (prioridad)" },
  { key:"D2", name:"D2 · Tirón + Antebrazo", focus:"Espalda sin lumbar + Antebrazo (prioridad)" },
  { key:"D3", name:"D3 · Pierna sin carga axial", focus:"Prensa + Femoral + Hip Thrust + Gemelo (prioridad)" },
  { key:"D4", name:"D4 · Full suave + Cuello", focus:"Full suave + Core + Cuello (prioridad)" }
];

const blocks = {
  D1: [
    "EJ PRINCIPAL: Press pecho máquina/mancuernas · 4×6–8",
    "Accesorio: Elevaciones laterales · 3×10–12",
    "Accesorio: Fondos/Tríceps polea · 3×8–12",
    "PRIORIDAD: Gemelo sentado · 5×12–20"
  ],
  D2: [
    "EJ PRINCIPAL: Remo con pecho apoyado · 4×6–8 (sin lumbar)",
    "Accesorio: Jalón al pecho · 3×8–10",
    "Accesorio: Curl bíceps · 3×10–12",
    "PRIORIDAD: Antebrazo (curl muñeca + reverse curl) · 5×12–20"
  ],
  D3: [
    "EJ PRINCIPAL: Prensa inclinada · 5×8–12",
    "Accesorio: Curl femoral · 4×10–12",
    "Sustituto PM: Hip Thrust · 4×8–12",
    "PRIORIDAD: Gemelo de pie · 5×12–20",
    "Opcional: Step-ups / Hack squat máquina · 2–3×8–12"
  ],
  D4: [
    "Bilbo suave: Press inclinado ligero · 3×8–10",
    "Accesorio: Remo ligero · 3×8–10",
    "Core: plancha/antirotación · 4×30–45s",
    "PRIORIDAD: Cuello (flex/ext/lat) · 5×15–20"
  ]
};

const PRINCIPAL_POR_DIA = {
  D1: "Press pecho máquina/mancuernas",
  D2: "Remo con pecho apoyado",
  D3: "Prensa inclinada",
  D4: "Plancha"
};

function dayIndexFromWeek(){
  const dow = new Date().getDay(); // 0 dom..6 sáb
  const map = {1:0,2:1,3:2,4:3,5:4,6:5,0:6};
  return map[dow];
}

/* Override manual hoy */
function getDayOverrideForToday(){
  try{
    const obj = JSON.parse(localStorage.getItem(LS_DAY_OVERRIDE) || "null");
    if(obj && obj.date === todayISO() && obj.key) return obj.key;
  }catch(e){}
  return "";
}
function setDayOverrideForToday(key){
  localStorage.setItem(LS_DAY_OVERRIDE, JSON.stringify({ date: todayISO(), key }));
}
function clearDayOverride(){ localStorage.removeItem(LS_DAY_OVERRIDE); }

function workoutToday(){
  const overrideKey = getDayOverrideForToday();
  if(overrideKey){
    const day = splitDays.find(d=>d.key===overrideKey) || splitDays[0];
    return { ...day, date: todayISO(), override:true };
  }
  const idx = dayIndexFromWeek();
  const plan = ["D1","D2","D3","D4","D4","D4","D4"];
  const key = plan[idx];
  const day = splitDays.find(d=>d.key===key) || splitDays[0];
  return { ...day, date: todayISO(), override:false };
}

function syncOverrideUI(){
  const sel = document.getElementById("dayOverrideSelect");
  const hint = document.getElementById("overrideHint");
  if(!sel || !hint) return;

  const ov = getDayOverrideForToday();
  sel.value = ov || "";
  hint.textContent = ov ? `Override activo hoy: ${ov}. (Solo hoy)` : `Modo automático activo (por día de semana).`;
}
window.guardarOverrideHoy = function(){
  const sel = document.getElementById("dayOverrideSelect");
  const val = sel ? sel.value : "";
  if(!val){ showToast("⚠️ Selecciona D1–D4 o usa Quitar"); return; }
  setDayOverrideForToday(val);
  syncOverrideUI();
  renderWorkoutToday();
  showToast("✅ Día guardado para hoy");
};
window.borrarOverrideHoy = function(){
  clearDayOverride();
  syncOverrideUI();
  renderWorkoutToday();
  showToast("✅ Override quitado");
};

function renderWorkoutToday(){
  const w = workoutToday();
  const box = document.getElementById("workoutBox");
  if(box){
    const text = (blocks[w.key] || []).map(x=>`• ${x}`).join("\n");
    const flag = w.override ? " (MANUAL)" : " (AUTO)";
    box.textContent = `${w.name}${flag}\n${w.focus}\n\n📅 ${w.date}\n\n${text}`;
  }
  syncOverrideUI();
  renderReminder();
  renderPhaseHint();
  renderFavChips();
}

/* principal + plantillas */
window.ponerPrincipalDelDia = function(){
  const qe = document.getElementById("quickExercise");
  const w = workoutToday();
  const ex = PRINCIPAL_POR_DIA[w.key] || "";
  if(qe) qe.value = ex;
  showToast("✅ Principal del día aplicado");
};
window.abrirPlantillas = function(){
  const box = document.getElementById("tplBox");
  if(!box) return;
  box.style.display = (box.style.display === "none" || !box.style.display) ? "block" : "none";
};
window.setTemplate = function(key){
  const qe = document.getElementById("quickExercise");
  const ex = PRINCIPAL_POR_DIA[key] || "";
  if(qe) qe.value = ex;
  showToast(`✅ Plantilla ${key} aplicada`);
};

/* Entreno */
window.abrirEntreno = function(){
  setActiveNav("entreno");
  showScreen("entreno");
  renderWorkoutToday();
};

/* =========================
   Fases
========================= */
function defaultPhases(){ return [{ id:"phase_default", name:"Fase principal", createdAt: Date.now() }]; }
function readPhases(){
  try{
    const arr = JSON.parse(localStorage.getItem(LS_PHASES) || "null");
    if(Array.isArray(arr) && arr.length) return arr;
  }catch(e){}
  return defaultPhases();
}
function writePhases(arr){ localStorage.setItem(LS_PHASES, JSON.stringify(arr)); }
function getActivePhaseId(){
  const id = localStorage.getItem(LS_ACTIVE_PHASE);
  const phases = readPhases();
  if(id && phases.some(p=>p.id===id)) return id;
  const fallback = phases[0].id;
  localStorage.setItem(LS_ACTIVE_PHASE, fallback);
  return fallback;
}
function setActivePhase(id){ localStorage.setItem(LS_ACTIVE_PHASE, id); }
function getActivePhase(){
  const phases = readPhases();
  const id = getActivePhaseId();
  return phases.find(p=>p.id===id) || phases[0];
}
function renderPhasesUI(){
  const sel = document.getElementById("phaseSelect");
  if(!sel) return;

  const phases = readPhases();
  const activeId = getActivePhaseId();
  sel.innerHTML = phases.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  sel.value = activeId;

  renderPhaseHint();
}
window.setActivePhaseFromUI = function(){
  const sel = document.getElementById("phaseSelect");
  if(!sel) return;
  setActivePhase(sel.value);
  showToast("✅ Fase activa cambiada");
  renderPhaseHint();
  renderReminder();
  renderWorkoutToday();
  renderAllAfterChange();
};
window.crearFase = function(){
  const name = prompt("Nombre de la nueva fase:", "Fase nueva");
  if(!name) return;
  const phases = readPhases();
  const id = "phase_" + uid();
  phases.push({ id, name: name.trim(), createdAt: Date.now() });
  writePhases(phases);
  setActivePhase(id);
  renderPhasesUI();
  showToast("✅ Fase creada y activada");
};
window.borrarFaseActiva = function(){
  const active = getActivePhase();
  if(active.id === "phase_default"){ showToast("⚠️ No puedes borrar la fase principal"); return; }
  if(!confirm(`¿Borrar fase "${active.name}"?`)) return;
  const phases = readPhases().filter(p=>p.id !== active.id);
  writePhases(phases);
  setActivePhase(phases[0].id);
  renderPhasesUI();
  renderAllAfterChange();
  showToast("🗑️ Fase borrada");
};
function renderPhaseHint(){
  const el = document.getElementById("phaseHint");
  if(!el) return;
  const p = getActivePhase();
  el.textContent = `Fase activa: ${p.name}`;
}

/* =========================
   Favoritos
========================= */
function readFavs(){
  try{
    const arr = JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
}
function writeFavs(arr){ localStorage.setItem(LS_FAVS, JSON.stringify(arr)); }
function renderFavChips(){
  const row = document.getElementById("favRow");
  if(!row) return;
  const favs = readFavs();
  row.innerHTML = favs.map(f=>`<button class="fav" onclick="setQuickExercise(${JSON.stringify(f)})">${f}</button>`).join("");
}
window.setQuickExercise = function(name){
  const qe = document.getElementById("quickExercise");
  if(qe) qe.value = name;
  showToast("✅ Favorito aplicado");
};
function renderFavsUI(){
  const row = document.getElementById("favManageRow");
  if(!row) return;
  const favs = readFavs();
  if(!favs.length){ row.innerHTML = `<div class="log-meta">Sin favoritos.</div>`; return; }
  row.innerHTML = favs.map(f=>`
    <button class="fav" onclick="removeFav(${JSON.stringify(f)})">🗑️ ${f}</button>
  `).join("");
}
window.addFavoriteFromUI = function(){
  const inp = document.getElementById("favInput");
  const v = (inp?.value || "").trim();
  if(!v) return;
  const favs = readFavs();
  if(!favs.includes(v)) favs.unshift(v);
  writeFavs(favs.slice(0,30));
  if(inp) inp.value = "";
  renderFavChips();
  renderFavsUI();
  showToast("⭐ Favorito añadido");
};
window.removeFav = function(name){
  const favs = readFavs().filter(x=>x !== name);
  writeFavs(favs);
  renderFavChips();
  renderFavsUI();
  showToast("🗑️ Favorito borrado");
};
window.clearFavorites = function(){
  if(!confirm("¿Borrar TODOS los favoritos?")) return;
  writeFavs([]);
  renderFavChips();
  renderFavsUI();
  showToast("🗑️ Favoritos borrados");
};

/* =========================
   LOG (global) + migración
========================= */
function safeParse(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch(e){ return fallback; }
}
function readLogAll(){
  const arr = safeParse(LS_LOG_ALL, []);
  return Array.isArray(arr) ? arr : [];
}
function writeLogAll(arr){
  localStorage.setItem(LS_LOG_ALL, JSON.stringify(arr));
}
function readLog(){
  const pid = getActivePhaseId();
  return readLogAll().filter(x => (x.phaseId || "phase_default") === pid);
}
function migrateIfNeeded(){
  if(localStorage.getItem(LS_MIGRATED) === "1") return;
  const current = readLogAll();
  if(current.length){
    localStorage.setItem(LS_MIGRATED, "1");
    return;
  }
  const candidates = ["bilbo_log_v3","bilbo_log_v2","bilbo_log_v1","entreno_log_v3"];
  let source = [];
  for(const k of candidates){
    const arr = safeParse(k, []);
    if(Array.isArray(arr) && arr.length){ source = arr; break; }
  }
  if(!source.length){
    localStorage.setItem(LS_MIGRATED, "1");
    return;
  }
  const converted = source.map(it => ({
    id: it.id || uid(),
    ts: it.ts ? Number(it.ts) : Date.now(),
    date: it.date || "",
    day: it.day || "",
    dayName: it.dayName || "",
    ejercicio: it.ejercicio || "",
    tipo: it.tipo || "reps",
    peso: it.peso || "",
    reps: it.reps || "",
    timeSec: it.timeSec || "",
    serie: it.serie || "",
    rpe: it.rpe || "",
    phaseId: it.phaseId || "phase_default"
  }));
  writeLogAll(converted);
  localStorage.setItem(LS_MIGRATED, "1");
  showToast(`✅ Migrado historial: ${converted.length} series`);
}

/* =========================
   Modal + alertas
========================= */
let EDITING_ID = null;

function setTipoUI(tipo){
  const repsField = document.getElementById("repsField");
  const timeRow = document.getElementById("timeRow");
  if(tipo === "time"){
    if(repsField) repsField.style.display = "none";
    if(timeRow) timeRow.style.display = "flex";
  }else{
    if(repsField) repsField.style.display = "block";
    if(timeRow) timeRow.style.display = "none";
  }
}
function parseMMSS(v){
  const s = String(v||"").trim();
  if(!s) return NaN;
  if(/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if(!m) return NaN;
  const mm = Number(m[1]), ss = Number(m[2]);
  if(!Number.isFinite(mm) || !Number.isFinite(ss)) return NaN;
  return mm*60 + ss;
}
function formatMMSS(sec){
  if(!Number.isFinite(sec) || sec < 0) return "";
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function nextSerie(n){
  const v = parseInt(n,10);
  return Number.isFinite(v) ? (v+1) : 1;
}
function getLastSetSameExercise(exName, tipo){
  const log = readLog();
  const ex = norm(exName);
  const t = tipo || "reps";
  for(const it of log){
    if(norm(it.ejercicio) === ex && (it.tipo||"reps") === t) return it;
  }
  return null;
}
function isLumbarRiskExercise(name){
  const e = norm(name);
  const hits = [
    "peso muerto","deadlift","sentadilla","squat",
    "good morning","buenos dias",
    "remo pendlay","pendlay",
    "remo con barra","barbell row",
    "hip hinge","bent over row",
    "rack pull"
  ];
  return hits.some(k => e.includes(k));
}

function abrirModalSerie(ejercicio = "", prefill = null, forceNew = false){
  const modal = document.getElementById("modal");
  const title = document.getElementById("modalTitle");

  const mEj = document.getElementById("mEjercicio");
  const mTipo = document.getElementById("mTipo");
  const mPeso = document.getElementById("mPeso");
  const mReps = document.getElementById("mReps");
  const mTime = document.getElementById("mTime");
  const mTimeSec = document.getElementById("mTimeSec");
  const mSerie = document.getElementById("mSerie");
  const mRpe = document.getElementById("mRpe");

  if(prefill && !forceNew){
    EDITING_ID = prefill.id || null;
    title.textContent = "EDITAR SERIE";
    mEj.value = prefill.ejercicio || "";
    mTipo.value = prefill.tipo || "reps";
    setTipoUI(mTipo.value);
    mPeso.value = prefill.peso || "";
    mReps.value = prefill.reps || "";
    mTimeSec.value = prefill.timeSec || "";
    mTime.value = prefill.timeSec ? formatMMSS(Number(prefill.timeSec)) : "";
    mSerie.value = prefill.serie || "1";
    mRpe.value = prefill.rpe || "";
  }else{
    EDITING_ID = null;
    title.textContent = "REGISTRAR SERIE";
    mEj.value = ejercicio || "";
    mTipo.value = "reps";
    setTipoUI("reps");
    mPeso.value = "";
    mReps.value = "";
    mTime.value = "";
    mTimeSec.value = "";
    mSerie.value = "1";
    mRpe.value = "";
  }

  modal.classList.add("show");
  modal.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  setTimeout(()=> mEj.focus(), 50);
}
function cerrarModalSerie(){
  const modal = document.getElementById("modal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
}

window.registrarSerie = function(){ abrirModalSerie(""); };
window.registrarSerieDesdeEntreno = function(){
  const ex = (document.getElementById("quickExercise")?.value || "").trim();
  abrirModalSerie(ex);
};
window.repetirUltimaSerieMasUno = function(){
  const log = readLog();
  if(!log.length){ showToast("ℹ️ No hay series aún"); return; }
  const last = log[0];
  const prefill = { ...last, id:null, serie: nextSerie(last.serie) };
  abrirModalSerie(last.ejercicio, prefill, true);
  EDITING_ID = null;
  document.getElementById("modalTitle").textContent = "REGISTRAR SERIE (+1)";
};

function saveFromModal(){
  const mEj = document.getElementById("mEjercicio");
  const mTipo = document.getElementById("mTipo");
  const mPeso = document.getElementById("mPeso");
  const mReps = document.getElementById("mReps");
  const mTime = document.getElementById("mTime");
  const mTimeSec = document.getElementById("mTimeSec");
  const mSerie = document.getElementById("mSerie");
  const mRpe = document.getElementById("mRpe");

  const ejercicio = (mEj.value || "").trim();
  const tipo = (mTipo.value || "reps");
  const peso = (mPeso.value || "").trim();
  const reps = (mReps.value || "").trim();
  const serieInput = (mSerie.value || "").trim();
  const rpe = (mRpe.value || "").trim();

  let timeSec = (mTimeSec.value || "").trim();
  if(tipo === "time"){
    if(!timeSec){
      const sec = parseMMSS(mTime.value);
      if(Number.isFinite(sec)) timeSec = String(sec);
    }else{
      const sec = Number(timeSec);
      if(Number.isFinite(sec) && !mTime.value) mTime.value = formatMMSS(sec);
    }
  }else{
    timeSec = "";
    mTime.value = "";
    mTimeSec.value = "";
  }

  if(!ejercicio){ showToast("⚠️ Escribe el ejercicio"); return; }
  if(!serieInput){ showToast("⚠️ Indica serie nº"); return; }
  if(tipo === "reps"){
    if(!reps){ showToast("⚠️ Indica reps"); return; }
  }else{
    const sec = toNum(timeSec);
    if(!Number.isFinite(sec) || sec <= 0){ showToast("⚠️ Indica tiempo (mm:ss o seg)"); return; }
  }

  if(isLumbarRiskExercise(ejercicio)){
    const ok = confirm(
      "⚠️ Aviso lumbar: este ejercicio suele cargar la zona lumbar.\n\n" +
      "Si tienes molestia, mejor evita o reduce carga / técnica estricta.\n\n" +
      "¿Guardar de todas formas?"
    );
    if(!ok) return;
  }

  const w = workoutToday();
  const pid = getActivePhaseId();
  const all = readLogAll();

  if(EDITING_ID){
    const idx = all.findIndex(x => x.id === EDITING_ID);
    if(idx >= 0){
      all[idx] = {
        ...all[idx],
        ejercicio, tipo, peso,
        reps: tipo==="reps" ? reps : "",
        timeSec: tipo==="time" ? timeSec : "",
        serie: serieInput,
        rpe
      };
      writeLogAll(all.sort((a,b)=> (b.ts||0)-(a.ts||0)));
      cerrarModalSerie();
      renderAllAfterChange();
      showToast("✅ Serie editada");
      return;
    }
  }

  let serieFinal = serieInput;
  const lastSame = getLastSetSameExercise(ejercicio, tipo);
  if(lastSame) serieFinal = String(nextSerie(lastSame.serie));

  const item = {
    id: uid(),
    ts: Date.now(),
    date: w.date,
    day: w.key,
    dayName: w.name,
    ejercicio,
    tipo,
    peso,
    reps: tipo==="reps" ? reps : "",
    timeSec: tipo==="time" ? timeSec : "",
    serie: serieFinal,
    rpe,
    phaseId: pid
  };

  all.unshift(item);
  writeLogAll(all.sort((a,b)=> (b.ts||0)-(a.ts||0)));

  cerrarModalSerie();
  renderAllAfterChange();
  showToast(`✅ Guardado (S${serieFinal})`);
  restAutoKick();
}

function renderAllAfterChange(){
  renderLog();
  renderNivel();
  renderStats();
  renderCalendar();
  renderCharts();
}

/* bind modal */
function bindModal(){
  const close = document.getElementById("modalClose");
  const cancel = document.getElementById("modalCancel");
  const save = document.getElementById("modalSave");
  const backdrop = document.getElementById("modal");
  const mTipo = document.getElementById("mTipo");
  const mTime = document.getElementById("mTime");
  const mTimeSec = document.getElementById("mTimeSec");

  close.onclick = cerrarModalSerie;
  cancel.onclick = cerrarModalSerie;

  backdrop.addEventListener("click", (e)=>{ if(e.target === backdrop) cerrarModalSerie(); });
  document.addEventListener("keydown", (e)=>{ if(e.key === "Escape" && backdrop.classList.contains("show")) cerrarModalSerie(); });

  save.onclick = saveFromModal;
  mTipo.addEventListener("change", ()=> setTipoUI(mTipo.value));

  mTime.addEventListener("blur", ()=>{
    const sec = parseMMSS(mTime.value);
    if(Number.isFinite(sec)) mTimeSec.value = String(sec);
  });
  mTimeSec.addEventListener("blur", ()=>{
    const sec = toNum(mTimeSec.value);
    if(Number.isFinite(sec)) mTime.value = formatMMSS(sec);
  });
}

/* =========================
   LOG UI (Lista vs Sesiones)
========================= */
window.aplicarBusquedaLog = function(){
  const inp = document.getElementById("logSearch");
  LOG_QUERY = (inp?.value || "").trim();
  renderLog();
  showToast(LOG_QUERY ? "🔎 Filtro aplicado" : "ℹ️ Sin filtro");
};
window.limpiarBusquedaLog = function(){
  LOG_QUERY = "";
  const inp = document.getElementById("logSearch");
  if(inp) inp.value = "";
  renderLog();
  showToast("✅ Filtro borrado");
};

window.toggleLogView = function(){
  LOG_VIEW = (LOG_VIEW === "sessions") ? "list" : "sessions";
  showToast(`📌 Vista: ${LOG_VIEW === "sessions" ? "Sesiones" : "Lista"}`);
  renderLog();
};
window.expandCollapseSesiones = function(){
  const current = readLogFiltered();
  const byDate = groupByDate(current);
  const anyCollapsed = Object.keys(byDate).some(d => !SESSION_EXPANDED[d]);
  // si hay alguna colapsada -> expandir todo, si todas expandidas -> colapsar todo
  Object.keys(byDate).forEach(d => SESSION_EXPANDED[d] = anyCollapsed ? true : false);
  renderLog();
};

window.borrarHistorial = function(){
  if(!confirm("¿Borrar TODO el historial de la fase activa?")) return;
  const pid = getActivePhaseId();
  const all = readLogAll().filter(x => (x.phaseId||"phase_default") !== pid);
  writeLogAll(all);
  renderAllAfterChange();
  showToast("🗑️ Historial borrado (fase)");
};

function borrarSerie(id){
  const all = readLogAll().filter(x => x.id !== id);
  writeLogAll(all);
  renderAllAfterChange();
  showToast("🗑️ Serie borrada");
}

function readLogFiltered(){
  let log = readLog();
  const q = norm(LOG_QUERY);
  if(q){
    log = log.filter(it=>{
      const hay = [
        it.ejercicio, it.day, it.dayName, it.date,
        it.tipo, it.peso, it.reps, it.timeSec, it.serie, it.rpe
      ].map(x=>norm(String(x||""))).join(" ");
      return hay.includes(q);
    });
  }
  return log;
}

function groupByDate(log){
  const map = {};
  for(const it of log){
    const d = it.date || "Sin fecha";
    if(!map[d]) map[d] = [];
    map[d].push(it);
  }
  // ordenar cada día por ts desc
  Object.keys(map).forEach(d => map[d].sort((a,b)=> (b.ts||0)-(a.ts||0)));
  return map;
}

function sumSession(items){
  let sets = items.length;
  let ton = 0;
  let time = 0;
  let coreSets = 0;
  for(const s of items){
    if((s.tipo||"reps")==="reps"){
      const w = toNum(s.peso), r = toNum(s.reps);
      if(Number.isFinite(w) && Number.isFinite(r) && w>0 && r>0) ton += w*r;
    }else{
      const sec = toNum(s.timeSec);
      if(Number.isFinite(sec) && sec>0){ time += sec; coreSets += 1; }
    }
  }
  return { sets, ton, time, coreSets };
}

function renderLogList(log){
  const list = document.getElementById("logList");
  const hint = document.getElementById("logEmptyHint");
  if(!list) return;

  list.innerHTML = "";
  if(hint) hint.style.display = log.length ? "none" : "block";

  log.slice(0,250).forEach(it=>{
    const div = document.createElement("div");
    div.className = "log-card";
    const time = new Date(it.ts).toLocaleString();

    let line4 = "";
    if((it.tipo||"reps") === "time"){
      const sec = toNum(it.timeSec);
      line4 = `Serie ${it.serie || "-"} · ${formatMMSS(sec)} (tiempo)` + (it.peso ? ` · ${it.peso} kg` : "") + (it.rpe ? ` · RPE ${it.rpe}` : "");
    }else{
      line4 = `Serie ${it.serie || "-"} · ${it.peso || "-"} kg · ${it.reps || "-"} reps` + (it.rpe ? ` · RPE ${it.rpe}` : "");
    }

    div.textContent =
      `${it.dayName || it.day || ""}\n` +
      `📅 ${it.date || ""} · ${time}\n` +
      `${it.ejercicio || ""}\n` +
      `${line4}`;

    const actions = document.createElement("div");
    actions.className = "mini-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "mini ok";
    editBtn.textContent = "Editar ✏️";
    editBtn.onclick = ()=> abrirModalSerie("", it);

    const delBtn = document.createElement("button");
    delBtn.className = "mini danger";
    delBtn.textContent = "Borrar 🗑️";
    delBtn.onclick = ()=>{ if(confirm("¿Borrar esta serie?")) borrarSerie(it.id); };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    div.appendChild(actions);

    list.appendChild(div);
  });
}

function renderLogSessions(log){
  const list = document.getElementById("logList");
  const hint = document.getElementById("logEmptyHint");
  if(!list) return;

  const byDate = groupByDate(log);
  const dates = Object.keys(byDate).sort().reverse(); // yyyy-mm-dd desc

  list.innerHTML = "";
  if(hint) hint.style.display = dates.length ? "none" : "block";

  dates.slice(0,60).forEach(d=>{
    const items = byDate[d];
    const sum = sumSession(items);

    if(SESSION_EXPANDED[d] === undefined) SESSION_EXPANDED[d] = true;

    const header = document.createElement("div");
    header.className = "log-card";
    header.style.cursor = "pointer";

    const tone = fmtKg(sum.ton);
    const ttime = sum.time ? formatMMSS(sum.time) : "—";

    header.textContent =
      `📅 ${d}\n` +
      `Series: ${sum.sets} · Tonelaje: ${tone} kg · Core tiempo: ${ttime}`;

    header.addEventListener("click", ()=>{
      SESSION_EXPANDED[d] = !SESSION_EXPANDED[d];
      renderLog();
    });

    const mini = document.createElement("div");
    mini.className = "mini-actions";

    const addBtn = document.createElement("button");
    addBtn.className = "mini ok";
    addBtn.textContent = "Añadir serie";
    addBtn.onclick = (e)=>{ e.stopPropagation(); registrarSerie(); };

    const csvBtn = document.createElement("button");
    csvBtn.className = "mini";
    csvBtn.textContent = "Ver (lista)";
    csvBtn.onclick = (e)=>{ e.stopPropagation(); LOG_VIEW="list"; renderLog(); showToast("📌 Vista: Lista"); };

    mini.appendChild(addBtn);
    mini.appendChild(csvBtn);
    header.appendChild(mini);

    list.appendChild(header);

    if(!SESSION_EXPANDED[d]) return;

    // mostrar detalle del día (máx 30)
    items.slice(0,30).forEach(it=>{
      const div = document.createElement("div");
      div.className = "log-card";

      let line = "";
      if((it.tipo||"reps")==="time"){
        line = `${it.ejercicio}\n• S${it.serie} · ${formatMMSS(toNum(it.timeSec))} · ${it.peso? it.peso+" kg · ":""}${it.rpe? "RPE "+it.rpe:""}`;
      }else{
        line = `${it.ejercicio}\n• S${it.serie} · ${it.peso||"-"} kg · ${it.reps||"-"} reps${it.rpe? " · RPE "+it.rpe:""}`;
      }
      div.textContent = line;

      const actions = document.createElement("div");
      actions.className = "mini-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "mini ok";
      editBtn.textContent = "Editar";
      editBtn.onclick = ()=> abrirModalSerie("", it);

      const delBtn = document.createElement("button");
      delBtn.className = "mini danger";
      delBtn.textContent = "Borrar";
      delBtn.onclick = ()=>{ if(confirm("¿Borrar esta serie?")) borrarSerie(it.id); };

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      div.appendChild(actions);

      list.appendChild(div);
    });
  });
}

function renderLog(){
  const log = readLogFiltered();
  if(LOG_VIEW === "list") renderLogList(log);
  else renderLogSessions(log);
}

/* =========================
   CSV
========================= */
function csvEscape(v){
  const s = String(v ?? "");
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
window.exportarCSV = function(){
  const log = readLog();
  const header = ["fecha","dia_key","dia_nombre","ejercicio","tipo","serie","peso_kg","reps","time_sec","rpe","timestamp","id","fase"];
  const phaseName = getActivePhase().name;

  const rows = log.map(it => ([
    it.date || "",
    it.day || "",
    it.dayName || "",
    it.ejercicio || "",
    it.tipo || "reps",
    it.serie || "",
    it.peso || "",
    it.reps || "",
    it.timeSec || "",
    it.rpe || "",
    it.ts ? new Date(it.ts).toISOString() : "",
    it.id || "",
    phaseName
  ]));

  const csv = header.join(",") + "\n" + rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entreno_log_${phaseName.replace(/\s+/g,"_")}_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast("✅ CSV descargado");
};

/* =========================
   Nivel / Stats
========================= */
function e1RM_Epley(weight, reps){
  const w = toNum(weight);
  const r = Math.floor(toNum(reps));
  if(!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return NaN;
  const rr = clamp(r, 1, 30);
  return w * (1 + (rr / 30));
}
function summarize(log){
  const sessions = new Set(log.map(x => x.date).filter(Boolean));
  let tonnage7 = 0, tonnage28 = 0;
  let series7 = 0, series28 = 0;

  const byExercise28 = new Map();
  const prByExercise = new Map();

  for(const s of log){
    const ts = Number(s.ts) || 0;
    const is28 = ts && withinLastDays(ts, 28);
    const is7  = ts && withinLastDays(ts, 7);

    if(is28) series28++;
    if(is7) series7++;

    if((s.tipo||"reps")!=="reps") {
      if(is28){
        const ex = (s.ejercicio || "Sin nombre").trim();
        const cur = byExercise28.get(ex) || { sets:0, tonnage:0 };
        cur.sets += 1;
        byExercise28.set(ex, cur);
      }
      continue;
    }

    const w = toNum(s.peso);
    const r = toNum(s.reps);

    if(Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0){
      const t = w * r;
      if(is28) tonnage28 += t;
      if(is7)  tonnage7 += t;

      if(is28){
        const ex = (s.ejercicio || "Sin nombre").trim();
        const cur = byExercise28.get(ex) || { sets:0, tonnage:0 };
        cur.sets += 1;
        cur.tonnage += t;
        byExercise28.set(ex, cur);
      }

      const exKey = (s.ejercicio || "Sin nombre").trim();
      const e1 = e1RM_Epley(w, r);
      if(Number.isFinite(e1)){
        const prev = prByExercise.get(exKey);
        if(!prev || e1 > prev.e1rm){
          prByExercise.set(exKey, { e1rm: e1, w, r, date: s.date || "", ts });
        }
      }
    }else if(is28){
      const ex = (s.ejercicio || "Sin nombre").trim();
      const cur = byExercise28.get(ex) || { sets:0, tonnage:0 };
      cur.sets += 1;
      byExercise28.set(ex, cur);
    }
  }

  const top28 = [...byExercise28.entries()]
    .map(([ex, v]) => ({ ex, sets: v.sets, tonnage: v.tonnage }))
    .sort((a,b) => (b.tonnage - a.tonnage) || (b.sets - a.sets))
    .slice(0, 10);

  const prs = [...prByExercise.entries()]
    .map(([ex, v]) => ({ ex, ...v }))
    .sort((a,b) => b.e1rm - a.e1rm)
    .slice(0, 12);

  return { sessionsCount: sessions.size, series7, series28, tonnage7, tonnage28, top28, prs };
}

function renderNivel(){
  const box = document.getElementById("nivelBox");
  const kpiGrid = document.getElementById("kpiGrid");
  const prBox = document.getElementById("prBox");
  const topBox = document.getElementById("topBox");
  if(!box || !kpiGrid || !prBox || !topBox) return;

  const log = readLog();
  const sesiones = new Set(log.map(x=>x.date)).size;
  const series = log.length;
  const lvl = Math.min(99, Math.floor(series / 25) + 1);

  box.textContent =
    `Nivel: ${lvl}\n` +
    `Sesiones (fase): ${sesiones}\n` +
    `Series totales (fase): ${series}\n\n` +
    `Fase: ${getActivePhase().name}\n` +
    `Objetivo: constancia + progresión sin dolor lumbar.`;

  const s = summarize(log);

  kpiGrid.innerHTML = `
    <div class="kpi"><div class="k">Series (7 días)</div><div class="v">${s.series7}</div></div>
    <div class="kpi"><div class="k">Series (28 días)</div><div class="v">${s.series28}</div></div>
    <div class="kpi"><div class="k">Tonelaje (7 días)</div><div class="v">${fmtKg(s.tonnage7)}<span class="muted"> kg</span></div></div>
    <div class="kpi"><div class="k">Tonelaje (28 días)</div><div class="v">${fmtKg(s.tonnage28)}<span class="muted"> kg</span></div></div>
  `;

  if(s.prs.length === 0){
    prBox.innerHTML = `<div class="log-meta">Aún no hay PRs. Registra series con peso y reps.</div>`;
  }else{
    prBox.innerHTML = `
      <table class="table">
        <thead><tr><th>Ejercicio</th><th>e1RM</th><th>Mejor serie</th></tr></thead>
        <tbody>
          ${s.prs.map(p => `
            <tr>
              <td>${p.ex}</td>
              <td><span class="pill">${fmtKg(p.e1rm)} kg</span></td>
              <td class="muted">${p.w}×${p.r} (${p.date || ""})</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  if(s.top28.length === 0){
    topBox.innerHTML = `<div class="log-meta">Sin datos en últimos 28 días.</div>`;
  }else{
    topBox.innerHTML = `
      <table class="table">
        <thead><tr><th>Ejercicio</th><th>Series</th><th>Tonelaje</th></tr></thead>
        <tbody>
          ${s.top28.map(x => `
            <tr>
              <td>${x.ex}</td>
              <td><span class="pill">${x.sets}</span></td>
              <td class="muted">${fmtKg(x.tonnage)} kg</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
}

/* =========================
   Objetivos + Semáforo semanal
========================= */
function defaultTargets(){
  return { gemelos: 10, antebrazos: 10, cuello: 8 };
}
function readTargets(){
  try{
    const t = JSON.parse(localStorage.getItem(LS_TARGETS) || "null");
    if(t && Number.isFinite(t.gemelos) && Number.isFinite(t.antebrazos) && Number.isFinite(t.cuello)) return t;
  }catch(e){}
  return defaultTargets();
}
function writeTargets(t){
  localStorage.setItem(LS_TARGETS, JSON.stringify(t));
}
function loadTargetsUI(){
  const t = readTargets();
  const a = document.getElementById("tAntebrazos");
  const g = document.getElementById("tGemelos");
  const c = document.getElementById("tCuello");
  if(g) g.value = String(t.gemelos);
  if(a) a.value = String(t.antebrazos);
  if(c) c.value = String(t.cuello);
}
window.saveTargets = function(){
  const g = Math.max(0, Math.min(50, parseInt(document.getElementById("tGemelos")?.value || "0",10)));
  const a = Math.max(0, Math.min(50, parseInt(document.getElementById("tAntebrazos")?.value || "0",10)));
  const c = Math.max(0, Math.min(50, parseInt(document.getElementById("tCuello")?.value || "0",10)));
  writeTargets({ gemelos:g, antebrazos:a, cuello:c });
  showToast("✅ Objetivos guardados");
  renderStats();
};
function classifyPriority(ex){
  const e = norm(ex);
  if(e.includes("gemelo") || e.includes("calf")) return "gemelos";
  if(e.includes("antebra") || e.includes("muñeca") || e.includes("muneca") || e.includes("forearm") || e.includes("reverse curl")) return "antebrazos";
  if(e.includes("cuello") || e.includes("neck")) return "cuello";
  return null;
}
function getWeekRange(){
  const mon = startOfWeekISO(new Date());
  const sun = addDays(mon, 6);
  return { mon, sun };
}
function weekContains(ts){
  const { mon, sun } = getWeekRange();
  const a = mon.getTime();
  const b = (new Date(sun)).setHours(23,59,59,999);
  return ts >= a && ts <= b;
}
function buildTraffic(){
  const t = readTargets();
  const log = readLog();

  const counts = { gemelos:0, antebrazos:0, cuello:0 };

  for(const s of log){
    const ts = Number(s.ts) || 0;
    if(!ts || !weekContains(ts)) continue;
    const k = classifyPriority(s.ejercicio);
    if(!k) continue;
    counts[k] += 1;
  }

  const traffic = [
    { key:"gemelos", label:"Gemelos", done: counts.gemelos, target: t.gemelos },
    { key:"antebrazos", label:"Antebrazos", done: counts.antebrazos, target: t.antebrazos },
    { key:"cuello", label:"Cuello", done: counts.cuello, target: t.cuello }
  ];

  traffic.forEach(x=>{
    const target = Math.max(0, x.target);
    const done = x.done;
    const ratio = target === 0 ? 1 : done / target;

    if(target === 0){
      x.status = "g";
      x.msg = `Objetivo 0 → sin seguimiento.`;
    }else if(ratio >= 1){
      x.status = "g";
      x.msg = `✅ Cumplido: ${done}/${target} series.`;
    }else if(ratio >= 0.5){
      x.status = "y";
      x.msg = `⚠️ En marcha: ${done}/${target} series.`;
    }else{
      x.status = "r";
      x.msg = `⛔ Bajo: ${done}/${target} series.`;
    }
  });

  return traffic;
}

/* Stats PRO */
function weekKeyFromISODate(isoDate){
  const d = new Date(isoDate + "T00:00:00");
  const monday = startOfWeekISO(d);
  const y = monday.getFullYear();
  const jan4 = new Date(y,0,4);
  const jan4Mon = startOfWeekISO(jan4);
  const diff = (monday - jan4Mon) / (7*24*60*60*1000);
  const wk = Math.floor(diff) + 1;
  return `${y}-W${String(wk).padStart(2,"0")}`;
}
function renderTrafficBox(){
  const box = document.getElementById("trafficBox");
  if(!box) return;
  const { mon, sun } = getWeekRange();
  const traffic = buildTraffic();
  box.innerHTML = traffic.map(x=>`
    <div class="traffic-item">
      <div class="h">
        <div style="font-weight:900; color:#00ff9c;">${x.label}</div>
        <div><span class="dot ${x.status}"></span> <span class="pill">${x.done}/${x.target}</span></div>
      </div>
      <div class="m">${x.msg}<br><span class="muted">Semana: ${iso(mon)} → ${iso(sun)}</span></div>
    </div>
  `).join("");
}

function renderStats(){
  const log = readLog();
  const meta = document.getElementById("statsMeta");
  const kpis = document.getElementById("statsKpis");
  const prioBox = document.getElementById("prioBox");
  const weeklyBox = document.getElementById("weeklyBox");
  if(!meta || !kpis || !prioBox || !weeklyBox) return;

  meta.textContent = `Fase: ${getActivePhase().name} · Registros: ${log.length}`;
  renderTrafficBox();

  const dates = log.map(x=>x.date).filter(Boolean);
  const uniqueDates = [...new Set(dates)];
  const lastDate = uniqueDates.sort().slice(-1)[0] || null;

  let daysSince = "-";
  if(lastDate){
    const a = new Date(lastDate + "T00:00:00");
    const b = new Date(todayISO() + "T00:00:00");
    daysSince = Math.round((b-a)/(24*60*60*1000));
  }

  const series7 = log.filter(x=> withinLastDays(x.ts||0,7)).length;
  const series28 = log.filter(x=> withinLastDays(x.ts||0,28)).length;

  const ses7 = new Set(log.filter(x=> withinLastDays(x.ts||0,7)).map(x=>x.date)).size;
  const ses28 = new Set(log.filter(x=> withinLastDays(x.ts||0,28)).map(x=>x.date)).size;

  kpis.innerHTML = `
    <div class="kpi"><div class="k">Días desde último</div><div class="v">${daysSince}</div></div>
    <div class="kpi"><div class="k">Sesiones (7 días)</div><div class="v">${ses7}</div></div>
    <div class="kpi"><div class="k">Sesiones (28 días)</div><div class="v">${ses28}</div></div>
    <div class="kpi"><div class="k">Series (28 días)</div><div class="v">${series28}</div></div>
  `;

  const pr = { gemelos:{ sets:0, ton:0 }, antebrazos:{ sets:0, ton:0 }, cuello:{ sets:0, ton:0 } };
  log.forEach(s=>{
    if(!withinLastDays(s.ts||0,28)) return;
    const k = classifyPriority(s.ejercicio);
    if(!k) return;
    pr[k].sets += 1;
    const w = toNum(s.peso), r = toNum(s.reps);
    if((s.tipo||"reps")==="reps" && Number.isFinite(w) && Number.isFinite(r) && w>0 && r>0) pr[k].ton += (w*r);
  });

  prioBox.innerHTML = `
    <table class="table">
      <thead><tr><th>Grupo</th><th>Series</th><th>Tonelaje</th></tr></thead>
      <tbody>
        <tr><td>Gemelos</td><td><span class="pill">${pr.gemelos.sets}</span></td><td class="muted">${fmtKg(pr.gemelos.ton)} kg</td></tr>
        <tr><td>Antebrazos</td><td><span class="pill">${pr.antebrazos.sets}</span></td><td class="muted">${fmtKg(pr.antebrazos.ton)} kg</td></tr>
        <tr><td>Cuello</td><td><span class="pill">${pr.cuello.sets}</span></td><td class="muted">${fmtKg(pr.cuello.ton)} kg</td></tr>
      </tbody>
    </table>
  `;

  const map = new Map();
  log.forEach(s=>{
    if(!s.date) return;
    const wk = weekKeyFromISODate(s.date);
    const cur = map.get(wk) || { sets:0, ton:0 };
    cur.sets += 1;
    const w = toNum(s.peso), r = toNum(s.reps);
    if((s.tipo||"reps")==="reps" && Number.isFinite(w) && Number.isFinite(r) && w>0 && r>0) cur.ton += w*r;
    map.set(wk, cur);
  });

  const keys = [...map.keys()].sort().slice(-8);
  if(!keys.length){
    weeklyBox.innerHTML = `<div class="log-meta">Sin datos suficientes aún.</div>`;
  }else{
    weeklyBox.innerHTML = `
      <table class="table">
        <thead><tr><th>Semana</th><th>Series</th><th>Tonelaje</th></tr></thead>
        <tbody>
          ${keys.map(k=>{
            const v = map.get(k);
            return `<tr><td>${k}</td><td><span class="pill">${v.sets}</span></td><td class="muted">${fmtKg(v.ton)} kg</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  }
}

/* =========================
   Calendario
========================= */
let CAL_ANCHOR = startOfWeekISO(new Date());
function buildSessionsByDate(){
  const log = readLog();
  const map = new Map();
  for(const s of log){
    if(!s.date) continue;
    const cur = map.get(s.date) || { count:0, dayKey: s.day || "" };
    cur.count += 1;
    if(!cur.dayKey && s.day) cur.dayKey = s.day;
    map.set(s.date, cur);
  }
  return map;
}
function renderCalendar(){
  const meta = document.getElementById("calMeta");
  const grid = document.getElementById("weekGrid");
  const last4 = document.getElementById("last4Box");
  if(!meta || !grid || !last4) return;

  const map = buildSessionsByDate();
  meta.textContent = `Fase: ${getActivePhase().name} · Semana desde ${fmtShort(iso(CAL_ANCHOR))}`;

  const today = todayISO();
  const days = Array.from({length:7}, (_,i)=> iso(addDays(CAL_ANCHOR, i)));
  const labels = ["L","M","X","J","V","S","D"];

  grid.innerHTML = days.map((d,i)=>{
    const has = map.get(d);
    const cls = ["day", has ? "done" : "", d === today ? "today" : ""].join(" ");
    const info = has ? `${has.count} series` : "—";
    const dk = has?.dayKey ? `<div class="chip">${has.dayKey}</div>` : "";
    return `
      <div class="${cls}">
        <div class="d">${labels[i]}</div>
        <div class="n">${fmtShort(d)}</div>
        <div class="m">${info}</div>
        ${dk}
      </div>
    `;
  }).join("");

  const start = addDays(CAL_ANCHOR, -7*3);
  const weeks = Array.from({length:4}, (_,w)=> addDays(start, w*7));
  last4.innerHTML = weeks.map(wStart=>{
    const wDays = Array.from({length:7}, (_,i)=> iso(addDays(wStart, i)));
    const line = wDays.map(d=>{
      const has = map.get(d);
      const mark = has ? "●" : "·";
      return `<span title="${d}">${mark}</span>`;
    }).join(" ");
    return `
      <div class="log-card">
        <div style="font-weight:800;">Semana ${fmtShort(iso(wStart))}</div>
        <div class="log-meta" style="margin-top:6px;">${line}</div>
      </div>
    `;
  }).join("");
}
window.calPrevWeek = function(){ CAL_ANCHOR = addDays(CAL_ANCHOR, -7); renderCalendar(); };
window.calNextWeek = function(){ CAL_ANCHOR = addDays(CAL_ANCHOR, +7); renderCalendar(); };
window.calThisWeek = function(){ CAL_ANCHOR = startOfWeekISO(new Date()); renderCalendar(); };

/* =========================
   Recordatorio
========================= */
function renderReminder(){
  const banner = document.getElementById("reminderBanner");
  const text = document.getElementById("reminderText");
  if(!banner || !text) return;

  const log = readLog();
  const w = workoutToday();

  if(log.length === 0){
    banner.style.display = "block";
    text.textContent = `Aún no hay registros en la fase "${getActivePhase().name}". Hoy toca: ${w.key} (${w.name}).`;
    return;
  }

  const dates = [...new Set(log.map(x=>x.date).filter(Boolean))].sort();
  const last = dates[dates.length-1];
  let daysSince = 0;
  if(last){
    const a = new Date(last + "T00:00:00");
    const b = new Date(todayISO() + "T00:00:00");
    daysSince = Math.round((b-a)/(24*60*60*1000));
  }

  banner.style.display = "block";
  text.textContent =
    `Fase: "${getActivePhase().name}". Último entreno: ${last} (hace ${daysSince} día(s)). ` +
    `Hoy toca: ${w.key} · ${w.name}.`;
}

/* =========================
   Misión
========================= */
window.iniciarMision = function(){
  const w = workoutToday();
  localStorage.setItem(LS_MISSION, JSON.stringify({
    date:w.date, day:w.key, dayName:w.name, objetivo:"Fuerza magra", phaseId:getActivePhaseId()
  }));
  showToast("🎯 Misión iniciada");
  renderReminder();
};
window.resetearMision = function(){
  localStorage.removeItem(LS_MISSION);
  showToast("✅ Misión reseteada");
};

/* =========================
   Backup / Restore
========================= */
window.exportarBackup = function(){
  const payload = {
    schema: "entreno-backup-v2",
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    cacheVersion: CACHE_VERSION,
    data: {
      phases: readPhases(),
      activePhaseId: getActivePhaseId(),
      logAll: readLogAll(),
      dayOverride: localStorage.getItem(LS_DAY_OVERRIDE) || null,
      mission: localStorage.getItem(LS_MISSION) || null,
      favs: localStorage.getItem(LS_FAVS) || null,
      rest: localStorage.getItem(LS_REST) || null,
      targets: localStorage.getItem(LS_TARGETS) || null
    }
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type:"application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entreno_backup_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("✅ Backup descargado");
};
window.clickImport = function(){
  const inp = document.getElementById("importFile");
  if(!inp) return;
  inp.value = "";
  inp.click();
};
async function importBackupFile(file){
  const txt = await file.text();
  let obj = null;
  try{ obj = JSON.parse(txt); }catch(e){ showToast("⚠️ JSON inválido"); return; }
  if(!obj || !obj.data){ showToast("⚠️ Backup no reconocido"); return; }
  if(!confirm("¿Importar backup y SOBRESCRIBIR tus datos actuales?")) return;

  const d = obj.data;
  if(Array.isArray(d.phases) && d.phases.length) writePhases(d.phases);
  if(d.activePhaseId) setActivePhase(d.activePhaseId);
  if(Array.isArray(d.logAll)) writeLogAll(d.logAll);

  if(typeof d.dayOverride === "string") localStorage.setItem(LS_DAY_OVERRIDE, d.dayOverride);
  else localStorage.removeItem(LS_DAY_OVERRIDE);

  if(typeof d.mission === "string") localStorage.setItem(LS_MISSION, d.mission);
  else localStorage.removeItem(LS_MISSION);

  if(typeof d.favs === "string") localStorage.setItem(LS_FAVS, d.favs);
  else localStorage.removeItem(LS_FAVS);

  if(typeof d.rest === "string") localStorage.setItem(LS_REST, d.rest);
  else localStorage.removeItem(LS_REST);

  if(typeof d.targets === "string") localStorage.setItem(LS_TARGETS, d.targets);
  else localStorage.removeItem(LS_TARGETS);

  showToast("✅ Backup importado");
  renderPhasesUI();
  renderFavChips();
  renderFavsUI();
  loadRestSettingsUI();
  loadTargetsUI();
  renderWorkoutToday();
  renderAllAfterChange();
  refreshPwaStatus();
  renderReminder();
}

/* =========================
   PWA install prompt
========================= */
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  const b1 = document.getElementById("installBtnMission");
  const b2 = document.getElementById("installBtnSettings");
  if(b1) b1.style.display = "block";
  if(b2) b2.style.display = "block";

  showToast("📲 App lista para instalar");
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const b1 = document.getElementById("installBtnMission");
  const b2 = document.getElementById("installBtnSettings");
  if(b1) b1.style.display = "none";
  if(b2) b2.style.display = "none";
  showToast("✅ App instalada");
});
window.instalarApp = async function(){
  if(!deferredInstallPrompt){
    showToast("ℹ️ Menú ⋮ → Instalar / Añadir a pantalla.");
    return;
  }
  deferredInstallPrompt.prompt();
  const res = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;

  if(res && res.outcome === "accepted") showToast("✅ Instalación aceptada");
  else showToast("❌ Instalación cancelada");
};

/* =========================
   Service Worker
========================= */
async function refreshPwaStatus(){
  const el = document.getElementById("pwaStatus");
  if(!el) return;

  if(!("serviceWorker" in navigator)){
    el.textContent = "Estado: Service Worker NO disponible.";
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if(!reg){
    el.textContent = "Estado: SW no registrado aún (HTTPS requerido).";
    return;
  }
  const state = reg.active ? "ACTIVO" : (reg.installing ? "INSTALANDO" : "REGISTRADO");
  el.textContent = `Estado: SW ${state} · Cache: ${CACHE_VERSION} · App: ${APP_VERSION}`;
}
window.verVersion = async function(){
  await refreshPwaStatus();
  showToast(`ℹ️ ${APP_VERSION}`);
};
window.actualizarApp = async function(){
  if(!("serviceWorker" in navigator)){
    showToast("⚠️ No hay Service Worker");
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if(!reg){
    showToast("⚠️ SW no registrado");
    return;
  }
  try{
    await reg.update();
    if(reg.waiting){
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      showToast("🔄 Actualizando…");
    }else{
      showToast("🔄 Buscando actualización…");
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    }, { once:true });
    setTimeout(()=> window.location.reload(), 1200);
  }catch(e){
    console.log(e);
    showToast("⚠️ No se pudo actualizar");
  }
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try{
      await navigator.serviceWorker.register("./sw.js");
      refreshPwaStatus();
    }catch(e){
      console.log("SW error:", e);
    }
  });
}

/* =========================
   Timer descanso
========================= */
let TIMER = { sec:90, running:false, t:null };

function readRestSettings(){
  const def = { defaultSec: 90, auto: 1 };
  try{
    const obj = JSON.parse(localStorage.getItem(LS_REST) || "null");
    if(obj && Number.isFinite(obj.defaultSec)) return obj;
  }catch(e){}
  return def;
}
function writeRestSettings(obj){
  localStorage.setItem(LS_REST, JSON.stringify(obj));
}
function loadRestSettingsUI(){
  const s = readRestSettings();
  const inp = document.getElementById("restDefault");
  const sel = document.getElementById("restAuto");
  if(inp) inp.value = String(s.defaultSec ?? 90);
  if(sel) sel.value = String(s.auto ?? 1);
  TIMER.sec = Number(s.defaultSec ?? 90);
  updateTimerUI();
}
window.saveRestSettings = function(){
  const inp = document.getElementById("restDefault");
  const sel = document.getElementById("restAuto");
  const defSec = Math.max(10, Math.min(600, parseInt(inp?.value || "90",10)));
  const auto = parseInt(sel?.value || "1",10);
  writeRestSettings({ defaultSec: defSec, auto: auto ? 1 : 0 });
  TIMER.sec = defSec;
  updateTimerUI();
  showToast("✅ Descanso guardado");
};
function updateTimerUI(){
  const box = document.getElementById("restTimer");
  const t = document.getElementById("restTime");
  if(!box || !t) return;
  const mm = String(Math.floor(TIMER.sec/60)).padStart(2,"0");
  const ss = String(Math.floor(TIMER.sec%60)).padStart(2,"0");
  t.textContent = `${mm}:${ss}`;
}
function showTimer(show){
  const box = document.getElementById("restTimer");
  if(!box) return;
  box.style.display = show ? "block" : "none";
}
function tick(){
  if(!TIMER.running) return;
  TIMER.sec = Math.max(0, TIMER.sec - 1);
  updateTimerUI();
  if(TIMER.sec <= 0){
    TIMER.running = false;
    clearInterval(TIMER.t);
    TIMER.t = null;
    showToast("⏱️ Descanso terminado");
  }
}
window.timerStart = function(){
  if(TIMER.running) return;
  TIMER.running = true;
  if(!TIMER.t) TIMER.t = setInterval(tick, 1000);
  showTimer(true);
};
window.timerStop = function(){
  TIMER.running = false;
  if(TIMER.t){ clearInterval(TIMER.t); TIMER.t=null; }
};
window.timerPlus = function(s){
  TIMER.sec = Math.min(999, TIMER.sec + Number(s||0));
  updateTimerUI();
  showTimer(true);
};
window.timerMinus = function(s){
  TIMER.sec = Math.max(0, TIMER.sec - Number(s||0));
  updateTimerUI();
  showTimer(true);
};
function restAutoKick(){
  const s = readRestSettings();
  if((s.auto ?? 1) !== 1) return;
  TIMER.sec = Number(s.defaultSec ?? 90);
  updateTimerUI();
  showTimer(true);
  window.timerStart();
}

/* =========================
   Gráficos (canvas)
========================= */
function getExerciseList(){
  const log = readLog();
  const set = new Set(log.map(x=> (x.ejercicio||"").trim()).filter(Boolean));
  return [...set].sort((a,b)=>a.localeCompare(b));
}
function renderExerciseSelect(){
  const sel = document.getElementById("chartExercise");
  if(!sel) return;
  const list = getExerciseList();
  const prev = sel.value;
  sel.innerHTML = list.map(x=>`<option value="${x}">${x}</option>`).join("");
  if(list.includes(prev)) sel.value = prev;
  else if(list.length) sel.value = list[0];
}
function clearCanvas(ctx){ ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height); }
function drawAxes(ctx){
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.strokeStyle = "rgba(0,255,160,.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30,10); ctx.lineTo(30,h-25);
  ctx.lineTo(w-10,h-25);
  ctx.stroke();
}
function drawLine(ctx, pts){
  if(pts.length < 2) return;
  ctx.strokeStyle = "rgba(0,255,160,.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}
function drawBars(ctx, bars){
  const h = ctx.canvas.height;
  const baseY = h-25;
  ctx.fillStyle = "rgba(0,255,160,.35)";
  bars.forEach(b=> ctx.fillRect(b.x, b.y, b.w, baseY-b.y));
}
function renderCharts(){
  renderExerciseSelect();
  const sel = document.getElementById("chartExercise");
  if(!sel) return;

  const ex = sel.value;
  if(!ex) return;

  const log = readLog()
    .filter(x => norm(x.ejercicio) === norm(ex))
    .filter(x => (x.tipo||"reps")==="reps")
    .filter(x => withinLastDays(x.ts||0, 90))
    .filter(x => Number.isFinite(toNum(x.peso)) && Number.isFinite(toNum(x.reps)) && toNum(x.peso)>0 && toNum(x.reps)>0)
    .map(x => ({ ts: x.ts, e1: e1RM_Epley(toNum(x.peso), toNum(x.reps)) }))
    .filter(x => Number.isFinite(x.e1))
    .sort((a,b)=>a.ts-b.ts);

  const c1 = document.getElementById("chartE1RM");
  if(c1){
    const ctx = c1.getContext("2d");
    clearCanvas(ctx);
    drawAxes(ctx);

    if(log.length < 2){
      ctx.fillStyle = "rgba(215,255,233,.7)";
      ctx.font = "12px Segoe UI";
      ctx.fillText("No hay suficientes datos (mínimo 2 series con peso+reps).", 40, 90);
    }else{
      const w = ctx.canvas.width, h = ctx.canvas.height;
      const ys = log.map(p=>p.e1);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const pad = Math.max(1, (maxY-minY)*0.15);

      const pts = log.map((p,i)=>({
        x: 30 + (i*(w-45)/(log.length-1)),
        y: (h-25) - ((p.e1-(minY-pad))/((maxY+pad)-(minY-pad)))*(h-45)
      }));

      drawLine(ctx, pts);

      ctx.fillStyle = "rgba(215,255,233,.7)";
      ctx.font = "11px Segoe UI";
      ctx.fillText(`min ${fmtKg(minY)}kg`, 35, 18);
      ctx.fillText(`max ${fmtKg(maxY)}kg`, 120, 18);
      ctx.fillText(`último ${fmtKg(log[log.length-1].e1)}kg`, 220, 18);
    }
  }

  const c2 = document.getElementById("chartVOL");
  if(c2){
    const ctx = c2.getContext("2d");
    clearCanvas(ctx);
    drawAxes(ctx);

    const map = new Map();
    readLog().forEach(s=>{
      if(norm(s.ejercicio) !== norm(ex)) return;
      if((s.tipo||"reps")!=="reps") return;
      if(!s.date) return;
      const wk = weekKeyFromISODate(s.date);
      const cur = map.get(wk) || { ton:0 };
      const w = toNum(s.peso), r = toNum(s.reps);
      if(Number.isFinite(w) && Number.isFinite(r) && w>0 && r>0) cur.ton += w*r;
      map.set(wk, cur);
    });

    const keys = [...map.keys()].sort().slice(-8);
    const vals = keys.map(k=> map.get(k).ton);
    const maxV = Math.max(1, ...vals);

    const W = ctx.canvas.width, H = ctx.canvas.height;
    const baseY = H-25;
    const barW = (W-45) / Math.max(8, keys.length);

    const bars = keys.map((k,i)=>{
      const v = map.get(k).ton;
      const x = 30 + i*barW + 6;
      const hh = (v/maxV) * (H-45);
      return { x, y: baseY - hh, w: Math.max(8, barW-12) };
    });

    drawBars(ctx, bars);

    ctx.fillStyle = "rgba(215,255,233,.7)";
    ctx.font = "10px Segoe UI";
    keys.forEach((k,i)=>{
      const x = 30 + i*barW + 6;
      ctx.fillText(k.slice(5), x, H-10);
    });
  }
}
document.addEventListener("change", (e)=>{
  if(e.target && e.target.id === "chartExercise") renderCharts();
});

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", ()=>{
  initScreens();
  bindNav();

  const phases = readPhases();
  writePhases(phases);
  setActivePhase(getActivePhaseId());

  migrateIfNeeded();

  const inp = document.getElementById("importFile");
  if(inp){
    inp.addEventListener("change", async (e)=>{
      const f = e.target.files && e.target.files[0];
      if(f) await importBackupFile(f);
    });
  }

  bindModal();

  // defaults UI
  const logSearch = document.getElementById("logSearch");
  if(logSearch) logSearch.value = LOG_QUERY || "";

  renderPhasesUI();
  renderWorkoutToday();
  renderLog();
  renderNivel();
  renderStats();
  renderCalendar();
  renderCharts();
  refreshPwaStatus();
  renderReminder();

  renderFavChips();
  renderFavsUI();
  loadRestSettingsUI();
  loadTargetsUI();
});
