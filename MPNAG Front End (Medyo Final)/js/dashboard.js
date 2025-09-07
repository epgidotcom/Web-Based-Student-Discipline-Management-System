document.addEventListener("DOMContentLoaded", () => {
  /* ===== Data sources =====
     If you have arrays, define them before this script:
       window.studentsData = [ { id, grade, section, ... } ];
       window.violationsData = [ { id, studentId, type, status, date, grade, section } ];
     This file will fallback to your tables if arrays aren't present.
  */
  const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  // Fallback parsers from tables (optional)
  function parseStudentsFromTable() {
    const rows = Array.from(document.querySelectorAll("#studentTable tr")).slice(1);
    return rows.map((r, i) => {
      const tds = r.querySelectorAll("td");
      return {
        id: i + 1,
        firstName: (tds[0]?.textContent || "").trim(),
        grade: Number((tds[1]?.textContent || "").trim()),
        section: (tds[2]?.textContent || "").trim(),
      };
    });
  }
  function parseViolationsFromTable() {
    const rows = Array.from(document.querySelectorAll("#violationTable tr")).slice(1);
    return rows.map((r, i) => {
      const tds = r.querySelectorAll("td");
      const date = (tds[2]?.textContent || "").trim();
      return {
        id: i + 1,
        studentName: (tds[0]?.textContent || "").trim(),
        type: (tds[1]?.textContent || "").trim(),
        status: "Open",
        date: date || new Date().toISOString().slice(0,10),
        grade: undefined,
        section: undefined,
      };
    });
  }

  // Prefer global arrays if present
  let students = Array.isArray(window.studentsData) ? window.studentsData : parseStudentsFromTable();
  let violations = Array.isArray(window.violationsData) ? window.violationsData : parseViolationsFromTable();

  // If absolutely empty, fake a tiny dataset so the dashboard shows structure
  if (students.length === 0 && violations.length === 0) {
    const sections = ["A","B","C","D"];
    for (let i=0;i<18;i++) {
      const grade = 7 + (i % 6);
      const section = sections[i % sections.length];
      students.push({ id: i+1, grade, section, firstName: "Student "+(i+1) });
    }
    const types = ["Tardiness","Dress Code","Disrespect","Cheating"];
    const today = new Date();
    for (let i=0;i<48;i++) {
      const s = students[Math.floor(Math.random()*students.length)];
      const d = new Date(today); d.setDate(today.getDate()-Math.floor(Math.random()*80));
      violations.push({
        id:i+1, studentId:s.id, type: types[Math.floor(Math.random()*types.length)],
        status: Math.random()<0.7 ? "Resolved":"Open",
        date: d.toISOString().slice(0,10), grade: s.grade, section: s.section
      });
    }
  }

  /* ===== Helpers ===== */
  const toDate = (s) => (s instanceof Date ? s : new Date(s + "T00:00:00"));
  const fmt = (d) => DATE_FMT.format(d);
  const addDays = (d,n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n);
  const startOfDay = (d)=>new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d)=>new Date(d.getFullYear(), d.getMonth(), d.getDate(),23,59,59);

  function animateCount(el, value) {
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
  (function initFilters(){
    // populate grade/section/type
    const grades = unique(students.map(s=>s.grade).filter(Boolean)).sort((a,b)=>a-b);
    grades.forEach(g => {
      const o=document.createElement("option"); o.value=g; o.textContent=g;
      els.filterGrade.appendChild(o);
    });
    const sections = unique(students.map(s=>s.section).filter(Boolean)).sort();
    sections.forEach(s => {
      const o=document.createElement("option"); o.value=s; o.textContent=s;
      els.filterSection.appendChild(o);
    });
    const types = unique(violations.map(v=>v.type).filter(Boolean)).sort();
    types.forEach(t => {
      const o=document.createElement("option"); o.value=t; o.textContent=t;
      els.filterType.appendChild(o);
    });

    // default date: last 90 days
    const to = new Date();
    const from = addDays(to, -89);
    els.dateFrom.value = from.toISOString().slice(0,10);
    els.dateTo.value = to.toISOString().slice(0,10);

    // quick buttons
    els.btnQuick7.addEventListener("click", () => {
      const to=new Date(); const from=addDays(to,-6);
      els.dateFrom.value = from.toISOString().slice(0,10);
      els.dateTo.value = to.toISOString().slice(0,10);
      applyFilters();
    });
    els.btnQuick30.addEventListener("click", () => {
      const to=new Date(); const from=addDays(to,-29);
      els.dateFrom.value = from.toISOString().slice(0,10);
      els.dateTo.value = to.toISOString().slice(0,10);
      applyFilters();
    });
    els.btnReset.addEventListener("click", () => {
      els.filterGrade.value=""; els.filterSection.value=""; els.filterType.value="";
      const to=new Date(); const from=addDays(to,-89);
      els.dateFrom.value = from.toISOString().slice(0,10);
      els.dateTo.value = to.toISOString().slice(0,10);
      applyFilters();
    });
    els.btnApply.addEventListener("click", applyFilters);
  })();

  /* ===== Charts ===== */
  let chartTrend, chartTopTypes, chartByGrade;
  function ensureChart(ctx, cfg, existing) { if (existing) existing.destroy(); return new Chart(ctx, cfg); }

  /* ===== Render ===== */
  function applyFilters() {
    const from = toDate(els.dateFrom.value);
    const to = toDate(els.dateTo.value);
    const g = els.filterGrade.value;
    const s = els.filterSection.value;
    const t = els.filterType.value;

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

    const last30 = violationsInRange(violations, addDays(to, -29), to).length;
    animateCount(els.kpiViolations30, last30);

    const open = violations.filter(v => (v.status || "").toLowerCase() === "open").length;
    animateCount(els.kpiOpenCases, open);

    // repeat offenders: >=3 in last 90 days
    const v90 = violationsInRange(violations, addDays(to, -89), to);
    const byStu = new Map();
    v90.forEach(v => byStu.set(v.studentId || v.studentName, (byStu.get(v.studentId || v.studentName) || 0) + 1));
    const repeat = [...byStu.values()].filter(n => n >= 3).length;
    animateCount(els.kpiRepeat, repeat);
  }

  function renderTrend(list, from, to) {
    const weeks = weeksBetween(from, to);
    const labels = weeks.map(d => fmt(d));
    const counts = weeks.map((start, i) => {
      const end = i < weeks.length - 1 ? addDays(weeks[i+1], -1) : to;
      return list.filter(v => {
        const vd = toDate(v.date);
        return vd >= start && vd <= end;
      }).length;
    });
    const hasData = counts.some(c => c > 0);
    document.getElementById("emptyTrend").classList.toggle("hidden", hasData);

    chartTrend = ensureChart(
      document.getElementById("chartTrend").getContext("2d"),
      {
        type: "line",
        data: { labels, datasets: [{ label: "Violations / week", data: counts, tension: 0.35, fill: true, borderWidth: 2 }]},
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins: { legend:{ display:false }, tooltip:{ intersect:false } },
          scales: { y:{ beginAtZero:true, ticks:{ precision:0 } }, x:{ grid:{ display:false } } }
        }
      },
      chartTrend
    );
  }

  function renderTopTypes(list) {
    const agg = countByType(list).slice(0, 5);
    const labels = agg.map(a => a.type);
    const values = agg.map(a => a.count);
    const hasData = values.some(v => v > 0);
    document.getElementById("emptyTypes").classList.toggle("hidden", hasData);

    chartTopTypes = ensureChart(
      document.getElementById("chartTopTypes").getContext("2d"),
      {
        type: "bar",
        data: { labels, datasets: [{ label:"Count", data: values, borderWidth:1 }] },
        options: {
          responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
          scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } }, x:{ grid:{ display:false } } }
        }
      },
      chartTopTypes
    );
  }

  function renderByGrade(list) {
    const agg = countByGrade(list);
    const labels = agg.map(a => a.grade);
    const values = agg.map(a => a.count);
    const hasData = values.some(v => v > 0);
    document.getElementById("emptyByGrade").classList.toggle("hidden", hasData);

    chartByGrade = ensureChart(
      document.getElementById("chartByGrade").getContext("2d"),
      {
        type: "bar",
        data: { labels, datasets: [{ label:"Violations", data: values, borderWidth:1 }] },
        options: {
          responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
          scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } }, x:{ grid:{ display:false } } }
        }
      },
      chartByGrade
    );
  }


  // Initial render
  applyFilters();

  // Logout (kept)
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});
