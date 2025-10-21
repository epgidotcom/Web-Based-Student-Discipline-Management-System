document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = window.SDMS_CONFIG?.API_BASE || "";
  const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;
  const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  let students = [];
  let totalStudentCount = 0;
  let violations = [];
  let violationStats = null;

  const metricEls = {
    totalStudents: document.getElementById("totalStudents"),
    violations30: document.getElementById("violations30"),
    openCases: document.getElementById("openCases"),
    repeatOffenders: document.getElementById("repeatOffenders"),
  };

  const els = {
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

  const toDate = (s) => (s instanceof Date ? s : new Date(String(s || '').replace(/T.+$/, '') + "T00:00:00"));
  const fmt = (d) => DATE_FMT.format(d);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  const unique = (arr) => [...new Set(arr)];
  const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

  function authHeaders() {
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchJson(path, { method = 'GET', headers = {}, body } = {}) {
    if (!API_ROOT) throw new Error('API base URL not configured');
    const init = { method, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...headers } };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(`${API_ROOT}${path}`, init);
    if (res.status === 401) {
      console.warn('[dashboard] unauthorized – redirecting to login');
      window.location.href = 'index.html';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : null;
  }

  function buildStudentName(student) {
    if (!student) return '';
    const parts = [student.lastName, student.firstName, student.middleName].filter(Boolean);
    return parts.join(', ').replace(/\s+/g, ' ').trim();
  }

  function normalizeStudent(row) {
    return {
      id: row.id,
      lrn: row.lrn || '',
      firstName: row.first_name || '',
      middleName: row.middle_name || '',
      lastName: row.last_name || '',
      grade: row.grade !== undefined && row.grade !== null ? Number(row.grade) : null,
      section: row.section || '',
      createdAt: row.created_at || null,
    };
  }

  function parseGradeSection(value) {
    if (!value) return { grade: null, section: null };
    const gradeMatch = String(value).match(/(\d+)/);
    const grade = gradeMatch ? Number(gradeMatch[1]) : null;
    const parts = String(value).split(/[-–]/).map((p) => p.trim()).filter(Boolean);
    const section = parts.length > 1 ? parts[parts.length - 1] : null;
    return { grade, section };
  }

  function normalizeViolation(row, studentIndex) {
    const student = studentIndex.get(row.student_id) || null;
    const parsed = parseGradeSection(row.grade_section);
    const grade = student?.grade ?? parsed.grade;
    const section = student?.section ?? parsed.section;
    return {
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name || buildStudentName(student),
      description: (row.description ?? row.violation_description ?? row.details ?? row.violation ?? row.offense_type ?? '').toString().trim(),
      type: row.offense_type || 'Violation',
      status: row.status || 'Pending',
      date: row.incident_date || row.created_at || new Date().toISOString().slice(0, 10),
      grade,
      section,
      sanction: row.sanction || '',
      createdAt: row.created_at || row.incident_date || null,
    };
  }

  async function hydrateData() {
    try {
      const [studentsRes, violationsRes, statsRes] = await Promise.all([
        fetchJson('/students?limit=1000&page=1').catch((err) => {
          console.warn('[dashboard] failed to load students', err);
          return null;
        }),
        fetchJson('/violations?limit=1000').catch((err) => {
          console.warn('[dashboard] failed to load violations', err);
          return null;
        }),
        fetchJson('/violations/stats').catch((err) => {
          console.warn('[dashboard] stats endpoint unavailable', err);
          return null;
        }),
      ]);

      const studentRows = Array.isArray(studentsRes?.data)
        ? studentsRes.data
        : Array.isArray(studentsRes)
          ? studentsRes
          : [];

      totalStudentCount = (() => {
        const candidates = [
          studentsRes?.totalItems,
          studentsRes?.total,
          studentsRes?.count,
          studentsRes?.meta?.totalItems,
          studentRows.length
        ];
        for (const value of candidates) {
          const num = Number(value);
          if (Number.isFinite(num) && num >= 0) {
            return num;
          }
        }
        return studentRows.length;
      })();

      if (studentRows.length) {
        students = studentRows.map(normalizeStudent);
      } else {
        students = [];
      }

      if (Array.isArray(violationsRes) && violationsRes.length) {
        const studentIndex = new Map(students.map((s) => [s.id, s]));
        violations = violationsRes.map((row) => normalizeViolation(row, studentIndex));
      } else {
        violations = [];
      }

      if (statsRes && !statsRes.error) {
        violationStats = statsRes;
      } else {
        violationStats = null;
      }
    } catch (err) {
      console.error('[dashboard] hydrate failed', err);
      students = [];
      violations = [];
      violationStats = null;
      totalStudentCount = 0;
    }
  }

  function animateCount(el, value) {
    if (!el) return;
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
    if (!isValidDate(from) || !isValidDate(to)) return list;
    const f = startOfDay(from);
    const t = endOfDay(to);
    return list.filter((v) => {
      const d = toDate(v.date);
      return d >= f && d <= t;
    });
  }

  function weeksBetween(from, to) {
    const out = [];
    if (!isValidDate(from) || !isValidDate(to)) return out;
    let cur = startOfDay(from);
    while (cur <= to) {
      out.push(new Date(cur));
      cur = addDays(cur, 7);
    }
    return out.length ? out : [startOfDay(from)];
  }

  function countByType(list) {
    const map = new Map();
    list.forEach((v) => {
      const key = v.type || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  }

  function countByGrade(list) {
    const map = new Map();
    list.forEach((v) => {
      if (v.grade == null) return;
      map.set(v.grade, (map.get(v.grade) || 0) + 1);
    });
    return [...map.entries()].map(([grade, count]) => ({ grade, count })).sort((a, b) => a.grade - b.grade);
  }

  // Violation category mapping used for the Top Types chart — only these categories are counted
  const VIOLATION_CATEGORIES = [
    'Classroom Misconduct',
    'Dress Code Violation',
    'Tardiness',
    'Cutting Classes',
  ];

  function toCategory(v) {
    const s = (v?.description || v?.type || '').toString().toLowerCase().trim();
    if (s.includes('classroom')) return 'Classroom Misconduct';
    if (s.includes('dress')) return 'Dress Code Violation';
    if (s.includes('tardi')) return 'Tardiness';
    if (s.includes('cut') || s.includes('absent without')) return 'Cutting Classes';
    return null; // anything else won’t be counted
  }

  function initFilters() {
    if (!els.filterGrade || !els.filterSection || !els.filterType) return;
    els.filterGrade.innerHTML = '<option value=\"\">All</option>';
    els.filterSection.innerHTML = '<option value=\"\">All</option>';
    els.filterType.innerHTML = '<option value=\"\">All</option>';

    const grades = unique(students.map((s) => s.grade).filter((g) => g !== null && !Number.isNaN(g))).sort((a, b) => a - b);
    grades.forEach((grade) => {
      const o = document.createElement('option');
      o.value = grade;
      o.textContent = grade;
      els.filterGrade.appendChild(o);
    });

    const sections = unique(students.map((s) => s.section).filter(Boolean)).sort();
    sections.forEach((section) => {
      const o = document.createElement('option');
      o.value = section;
      o.textContent = section;
      els.filterSection.appendChild(o);
    });

    const violationTypes = unique(violations.map((v) => v.type).filter(Boolean)).sort();
    violationTypes.forEach((type) => {
      const o = document.createElement('option');
      o.value = type;
      o.textContent = type;
      els.filterType.appendChild(o);
    });

    const to = new Date();
    const from = addDays(to, -89);
    if (els.dateFrom) els.dateFrom.value = from.toISOString().slice(0, 10);
    if (els.dateTo) els.dateTo.value = to.toISOString().slice(0, 10);

    els.btnQuick7?.addEventListener('click', () => {
      const end = new Date();
      const start = addDays(end, -6);
      els.dateFrom.value = start.toISOString().slice(0, 10);
      els.dateTo.value = end.toISOString().slice(0, 10);
      applyFilters();
    });

    els.btnQuick30?.addEventListener('click', () => {
      const end = new Date();
      const start = addDays(end, -29);
      els.dateFrom.value = start.toISOString().slice(0, 10);
      els.dateTo.value = end.toISOString().slice(0, 10);
      applyFilters();
    });

    els.btnReset?.addEventListener('click', () => {
      els.filterGrade.value = '';
      els.filterSection.value = '';
      els.filterType.value = '';
      const end = new Date();
      const start = addDays(end, -89);
      els.dateFrom.value = start.toISOString().slice(0, 10);
      els.dateTo.value = end.toISOString().slice(0, 10);
      applyFilters();
    });

    els.btnApply?.addEventListener('click', applyFilters);
  }

  function computeRepeatOffenders(list) {
    const cutoff = addDays(new Date(), -89);
    const counts = new Map();
    list.forEach((v) => {
      if (!v.studentId) return;
      const date = toDate(v.date);
      if (date >= cutoff) {
        counts.set(v.studentId, (counts.get(v.studentId) || 0) + 1);
      }
    });
    let offenders = 0;
    counts.forEach((count) => {
      if (count >= 3) offenders += 1;
    });
    return offenders;
  }

  function computeOpenCases(list) {
    return list.filter((v) => /pending|ongoing|open/i.test(v.status || '')).length;
  }

  function computeViolationsLastNDays(list, days) {
    const cutoff = addDays(new Date(), -(days - 1));
    return list.filter((v) => toDate(v.date) >= cutoff).length;
  }

  function updateMetrics() {
    const totalStudents = totalStudentCount || students.length;
    const violations30 = violationStats?.last30 ?? computeViolationsLastNDays(violations, 30);
    const openCases = violationStats?.open_cases ?? computeOpenCases(violations);
    const repeatOffenders = violationStats?.repeat_offenders_90 ?? computeRepeatOffenders(violations);

    animateCount(metricEls.totalStudents, totalStudents);
    animateCount(metricEls.violations30, violations30);
    animateCount(metricEls.openCases, openCases);
    animateCount(metricEls.repeatOffenders, repeatOffenders);
  }

  let chartTrend;
  let chartTopTypes;
  let chartByGrade;

  function ensureChart(ctx, cfg, existing) {
    if (existing) existing.destroy();
    return new Chart(ctx, cfg);
  }

  function applyFilters() {
    let from = toDate(els.dateFrom?.value);
    let to = toDate(els.dateTo?.value);
    if (!isValidDate(to)) to = new Date();
    if (!isValidDate(from)) from = addDays(to, -89);
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    const gradeFilter = els.filterGrade?.value;
    const sectionFilter = els.filterSection?.value;
    const typeFilter = els.filterType?.value;

    let filtered = violationsInRange(violations, from, to);
    if (gradeFilter) filtered = filtered.filter((v) => String(v.grade) === String(gradeFilter));
    if (sectionFilter) filtered = filtered.filter((v) => v.section === sectionFilter);
    if (typeFilter) filtered = filtered.filter((v) => v.type === typeFilter);

    if (els.rangeHint && from && to && !Number.isNaN(from) && !Number.isNaN(to)) {
      els.rangeHint.textContent = `${fmt(from)} – ${fmt(to)}`;
    }
    if (els.typesHint) {
      els.typesHint.textContent = typeFilter ? `Type: ${typeFilter}` : 'All types';
    }

    renderTrend(filtered, from, to);
    renderTopTypes(filtered);
    renderByGrade(filtered);
  }

  function renderTrend(list, from, to) {
    const weeks = weeksBetween(from, to);
    const labels = weeks.map((d) => fmt(d));
    const counts = weeks.map((start, idx) => {
      const end = idx === weeks.length - 1 ? to : addDays(weeks[idx + 1], -1);
      return list.filter((v) => {
        const date = toDate(v.date);
        return date >= start && date <= end;
      }).length;
    });
    const hasData = counts.some((count) => count > 0);
    els.emptyTrend?.classList.toggle('hidden', hasData);

    chartTrend = ensureChart(
      document.getElementById('chartTrend').getContext('2d'),
      {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Violations / week',
              data: counts,
              tension: 0.35,
              fill: true,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { intersect: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
        },
      },
      chartTrend,
    );
  }

  function renderTopTypes(list) {
    // init counts with zero for all 4
    const counts = Object.fromEntries(VIOLATION_CATEGORIES.map((c) => [c, 0]));
    for (const it of list) {
      const cat = toCategory(it);
      if (cat && Object.prototype.hasOwnProperty.call(counts, cat)) counts[cat] += 1;
    }
    const labels = VIOLATION_CATEGORIES;
    const values = labels.map((l) => counts[l]);
    const hasData = values.some((v) => v > 0);
    els.emptyTypes?.classList.toggle('hidden', hasData);

    chartTopTypes = ensureChart(
      document.getElementById('chartTopTypes').getContext('2d'),
      {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Count', data: values, borderWidth: 1 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
        },
      },
      chartTopTypes,
    );
  }

  function renderByGrade(list) {
    const agg = countByGrade(list);
    const labels = agg.map((a) => a.grade);
    const values = agg.map((a) => a.count);
    const hasData = values.some((v) => v > 0);
    els.emptyByGrade?.classList.toggle('hidden', hasData);

    chartByGrade = ensureChart(
      document.getElementById('chartByGrade').getContext('2d'),
      {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Violations', data: values, borderWidth: 1 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
        },
      },
      chartByGrade,
    );
  }

  async function init() {
    await hydrateData();
    initFilters();
    updateMetrics();
    applyFilters();

    document.getElementById('logoutBtn')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (window.SDMSAuth?.logout) {
        window.SDMSAuth.logout();
      } else {
        window.location.href = 'index.html';
      }
    });
  }

  init();
});



