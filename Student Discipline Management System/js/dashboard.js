document.addEventListener("DOMContentLoaded", () => {
const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '';

async function apiJSON(path){
  const res = await fetch(API_BASE+path,{headers:{'Content-Type':'application/json'}});
  if(!res.ok) throw new Error(path+': '+res.status);
  return res.json();
}

let students = []; // will be populated from API
let violations = []; // populated from API
let violationStats = null; // stats from /api/violations/stats

async function loadData(){
  const [stu, vio, stats] = await Promise.all([
    apiJSON('/api/students').catch(()=>[]),
    apiJSON('/api/violations').catch(()=>[]),
    apiJSON('/api/violations/stats').catch(()=>null)
  ]);
  students = Array.isArray(stu)? stu : [];
  // Normalize violations: align field names used in charts (type, date, grade, section)
  violations = (Array.isArray(vio)? vio: []).map(v=>({
    id: v.id,
    studentId: v.student_id,
    studentName: v.student_name,
    type: v.offense_type || v.violation_type || '',
    status: v.status || 'Pending',
    date: v.incident_date || v.date || v.created_at,
    grade: (v.grade_section && v.grade_section.split('-')[0]) || v.grade || null,
    section: (v.grade_section && v.grade_section.split('-')[1]) || v.section || null
  }));
  violationStats = stats;
}

function showLoading(on){
  const el = document.getElementById('loadingOverlay');
  if(on){
    if(!el){
      const d=document.createElement('div');
      d.id='loadingOverlay';
      d.textContent='Loading data...';
      d.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.8);font:600 1.1rem system-ui;z-index:999';
      document.body.appendChild(d);
    }
  } else {
    el && el.remove();
  }
}

/* ===== Helpers (unchanged) ===== */
const toDate = (s) => (s instanceof Date ? s : new Date(s + "T00:00:00"));
const fmt = (d) => DATE_FMT.format(d);
const addDays = (d,n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n);
const startOfDay = (d)=>new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d)=>new Date(d.getFullYear(), d.getMonth(), d.getDate(),23,59,59);
function animateCount(el, value) {
  if(!el) return;
  const start = Number(el.dataset.count || 0);
  const end = Number(value || 0);
  const duration = 600;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / duration);
    const now = Math.round(start + (end - start) * p);
    el.textContent = now.toLocaleString();
    if (p < 1) requestAnimationFrame(step);
    else el.dataset.count = String(end);
  }
  requestAnimationFrame(step);
}
function violationsInRange(list, from, to) {
  const f = startOfDay(from), t = endOfDay(to);
  return list.filter(v => {
    const d = toDate(v.date);
    return d >= f && d <= t;
  });
}
function unique(arr) { return [...new Set(arr)]; }
function weeksBetween(from, to) {
  const out = []; let cur = startOfDay(from);
  while (cur <= to) { out.push(new Date(cur)); cur = addDays(cur, 7); }
  return out;
}
function countByType(list) {
  const map = new Map();
  for (const v of list) map.set(v.type, (map.get(v.type)||0)+1);
  return [...map].map(([type,count])=>({type,count})).sort((a,b)=>b.count-a.count);
}
function countByGrade(list) {
  const map = new Map();
  for (const v of list) map.set(v.grade, (map.get(v.grade)||0)+1);
  return [...map].map(([grade,count])=>({grade,count})).sort((a,b)=>a.grade-b.grade);
}

/* ===== Elements ===== */
const els = {
  kpiStudents: document.querySelector("#kpiTotalStudents .kpi-value"),
  kpiViolations30: document.querySelector("#kpiViolations30 .kpi-value"),
  kpiOpenCases: document.querySelector("#kpiOpenCases .kpi-value"),
  kpiRepeat: document.querySelector("#kpiRepeatOffenders .kpi-value"),
  dateFrom: document.getElementById("dateFrom"),
  dateTo: document.getElementById("dateTo"),
  filterGrade: document.getElementById("filterGrade"),
  filterSection: document.getElementById("filterSection"),
  filterType: document.getElementById("filterType"),
  btnQuick7: document.getElementById("btnQuick7"),
  btnQuick30: document.getElementById("btnQuick30"),
  btnReset: document.getElementById("btnReset"),
  btnApply: document.getElementById("btnApply"),
  rangeHint: document.getElementById("rangeHint"),
  typesHint: document.getElementById("typesHint"),
  emptyTrend: document.getElementById("emptyTrend"),
  emptyTypes: document.getElementById("emptyTypes"),
  emptyByGrade: document.getElementById("emptyByGrade"),
};

/* ===== Filters init ===== */
function initFilters(){
  const grades = unique(students.map(s=>s.grade).filter(Boolean)).sort((a,b)=>a-b);
  grades.forEach(g => { const o=document.createElement("option"); o.value=g; o.textContent=g; els.filterGrade.appendChild(o); });
  const sections = unique(students.map(s=>s.section).filter(Boolean)).sort();
  sections.forEach(s => { const o=document.createElement("option"); o.value=s; o.textContent=s; els.filterSection.appendChild(o); });
  const types = unique(violations.map(v=>v.type).filter(Boolean)).sort();
  types.forEach(t => { const o=document.createElement("option"); o.value=t; o.textContent=t; els.filterType.appendChild(o); });
  const to = new Date(); const from = addDays(to, -89);
  els.dateFrom.value = from.toISOString().slice(0,10);
  els.dateTo.value = to.toISOString().slice(0,10);
  els.btnQuick7.addEventListener("click", () => { const to=new Date(); const from=addDays(to,-6); els.dateFrom.value=from.toISOString().slice(0,10); els.dateTo.value=to.toISOString().slice(0,10); applyFilters(); });
  els.btnQuick30.addEventListener("click", () => { const to=new Date(); const from=addDays(to,-29); els.dateFrom.value=from.toISOString().slice(0,10); els.dateTo.value=to.toISOString().slice(0,10); applyFilters(); });
  els.btnReset.addEventListener("click", () => { els.filterGrade.value=""; els.filterSection.value=""; els.filterType.value=""; const to=new Date(); const from=addDays(to,-89); els.dateFrom.value=from.toISOString().slice(0,10); els.dateTo.value=to.toISOString().slice(0,10); applyFilters(); });
  els.btnApply.addEventListener("click", applyFilters);
}

/* ===== Charts ===== */
let chartTrend, chartTopTypes, chartByGrade;
function ensureChart(ctx, cfg, existing) { if (existing) existing.destroy(); return new Chart(ctx, cfg); }

/* ===== Render ===== */
function applyFilters() {
  const from = toDate(els.dateFrom.value);
  const to = toDate(els.dateTo.value);
  const g = els.filterGrade.value; const s = els.filterSection.value; const t = els.filterType.value;
  let filtered = violationsInRange(violations, from, to);
  if (g) filtered = filtered.filter(v => String(v.grade) === String(g));
  if (s) filtered = filtered.filter(v => v.section === s);
  if (t) filtered = filtered.filter(v => v.type === t);
  els.rangeHint.textContent = `${fmt(from)} – ${fmt(to)}`;
  els.typesHint.textContent = t ? `Type: ${t}` : "All types";
  renderKPIs(from, to);
  renderTrend(filtered, from, to);
  renderTopTypes(filtered);
  renderByGrade(filtered);
}

function renderKPIs(from, to) {
  animateCount(els.kpiStudents, students.length);
  if(violationStats){
    animateCount(els.kpiViolations30, violationStats.last30);
    animateCount(els.kpiOpenCases, violationStats.open_cases);
    animateCount(els.kpiRepeat, violationStats.repeat_offenders_90);
  } else {
    const last30 = violationsInRange(violations, addDays(to, -29), to).length;
    animateCount(els.kpiViolations30, last30);
    const open = violations.filter(v => (v.status || '').toLowerCase() === 'pending' || (v.status||'').toLowerCase()==='ongoing').length;
    animateCount(els.kpiOpenCases, open);
    const v90 = violationsInRange(violations, addDays(to, -89), to);
    const byStu = new Map(); v90.forEach(v => byStu.set(v.studentId || v.studentName, (byStu.get(v.studentId || v.studentName) || 0) + 1));
    const repeat = [...byStu.values()].filter(n => n >= 3).length; animateCount(els.kpiRepeat, repeat);
  }
}
function renderTrend(list, from, to) {
  const weeks = weeksBetween(from, to);
  const labels = weeks.map(d => fmt(d));
  const counts = weeks.map((start, i) => { const end = i < weeks.length - 1 ? addDays(weeks[i+1], -1) : to; return list.filter(v => { const vd = toDate(v.date); return vd >= start && vd <= end; }).length; });
  const hasData = counts.some(c => c > 0); els.emptyTrend.classList.toggle("hidden", hasData);
  chartTrend = ensureChart(document.getElementById("chartTrend").getContext("2d"), { type: "line", data: { labels, datasets: [{ label: "Violations / week", data: counts, tension: 0.35, fill: true, borderWidth: 2 }]}, options: { responsive:true, maintainAspectRatio:false, plugins: { legend:{ display:false }, tooltip:{ intersect:false } }, scales: { y:{ beginAtZero:true, ticks:{ precision:0 } }, x:{ grid:{ display:false } } } } }, chartTrend);
}
function renderTopTypes(list) {
  const agg = countByType(list).slice(0, 5); const labels = agg.map(a => a.type); const values = agg.map(a => a.count); const hasData = values.some(v => v > 0); els.emptyTypes.classList.toggle("hidden", hasData);
  chartTopTypes = ensureChart(document.getElementById("chartTopTypes").getContext("2d"), { type: "bar", data: { labels, datasets: [{ label:"Count", data: values, borderWidth:1 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } }, x:{ grid:{ display:false } } } } }, chartTopTypes);
}
function renderByGrade(list) {
  const agg = countByGrade(list); const labels = agg.map(a => a.grade); const values = agg.map(a => a.count); const hasData = values.some(v => v > 0); els.emptyByGrade.classList.toggle("hidden", hasData);
  chartByGrade = ensureChart(document.getElementById("chartByGrade").getContext("2d"), { type: "bar", data: { labels, datasets: [{ label:"Violations", data: values, borderWidth:1 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } }, x:{ grid:{ display:false } } } } }, chartByGrade);
}

async function init(){
  showLoading(true);
  try { await loadData(); } catch(e){ console.error('Dashboard data load failed', e); }
  showLoading(false);
  initFilters();
  applyFilters();
}

init();

// === Auto-refresh when violations change elsewhere ===
let refreshTimer = null; let lastReload = 0;
async function scheduleReload(){
  const now = Date.now();
  if(now - lastReload < 1000) return; // guard: don't reload more than once per second
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async ()=>{
    lastReload = Date.now();
    try {
      await loadData();
      // Rebuild filters (add any new grades/sections/types if they appeared)
      // Simple approach: clear existing dynamic <option>s except the first blank.
      ['filterGrade','filterSection','filterType'].forEach(id=>{
        const sel = document.getElementById(id); if(!sel) return;
        for(let i=sel.options.length-1;i>0;i--) sel.remove(i);
      });
      initFilters();
      applyFilters();
      console.info('[Dashboard] Auto-refreshed due to violations change');
    } catch(e){ console.warn('[Dashboard] Auto-refresh failed', e); }
  }, 250); // slight debounce for burst events
}

// Listen for localStorage flag changes (cross-tab)
window.addEventListener('storage', (e)=>{
  if(e.key === 'sdms_violations_dirty'){ scheduleReload(); }
});

// Also listen to custom event dispatched within same tab
window.addEventListener('sdms:data-changed', scheduleReload);

// Refresh when tab becomes visible again (in case user left it open)
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') scheduleReload(); });
window.addEventListener('focus', scheduleReload);

// Logout (retained)
document.getElementById("logoutBtn")?.addEventListener("click", () => { window.location.href = "index.html"; });
});



