document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('chartPredictive');
  if (!canvas) return;

  const chartWrap = canvas.parentElement;
  const windowSelect = document.getElementById('filterPredictiveWindow');
  const sectionSelect = document.getElementById('filterPredictiveSection');
  const strandSelect = document.getElementById('filterPredictiveStrand');
  const violationSelect = document.getElementById('filterPredictiveViolation');
  const noteEl = document.querySelector('.predictive-section .chart-note');

  const rawApiBase = window.SDMS_CONFIG?.API_BASE || '';
  const sanitizeText = window.SDMSUrlSanitize?.stripWebsiteContentTags || window.SDMSUrlSanitize?.stripWebsiteContentWrappers;
  const sanitizeUrl = window.SDMSUrlSanitize?.toSafeHttpUrl;
  const API_BASE = sanitizeText ? sanitizeText(rawApiBase) : rawApiBase;
  const safeApiBase = sanitizeUrl ? sanitizeUrl(API_BASE) : API_BASE;
  const API_ROOT = safeApiBase ? `${safeApiBase.replace(/\/+$/, '')}/api` : '';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'empty hidden';
  emptyEl.id = 'predictiveEmpty';
  emptyEl.textContent = 'No predictive data yet. Add violations to generate section-level risk likelihood.';
  chartWrap?.parentElement?.insertBefore(emptyEl, chartWrap.nextSibling);

  const statusEl = document.createElement('div');
  statusEl.className = 'hint';
  statusEl.style.marginTop = '8px';
  statusEl.id = 'predictiveStatus';
  chartWrap?.parentElement?.insertBefore(statusEl, emptyEl.nextSibling);

  let chartInstance = null;
  let predictiveData = null;
  let predictiveSections = [];
  let predictiveSectionEntries = [];
  const KNOWN_STRANDS = new Set(['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'HE', 'ICT']);
  const BLOCKED_SECTION_NAMES = new Set(['MABANGIS', 'POGI']);

  function parseGradeSection(value) {
    const raw = String(value || '').trim();
    if (!raw) return { grade: '', sectionName: '' };
    const parts = raw.split('-').map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) return { grade: parts[0] || '', sectionName: '' };
    return { grade: parts[0] || '', sectionName: parts.slice(1).join('-') };
  }

  function isStrandLikeGradeSection(value) {
    const parsed = parseGradeSection(value);
    return KNOWN_STRANDS.has(String(parsed.sectionName || '').toUpperCase());
  }

  function isBlockedSectionName(sectionName) {
    const normalized = String(sectionName || '').trim().toUpperCase();
    if (!normalized) return false;
    return BLOCKED_SECTION_NAMES.has(normalized);
  }

  function buildSectionEntry(grade, sectionName, strand = '') {
    const g = String(grade || '').trim();
    const s = String(sectionName || '').trim();
    if (!g || !s) return null;
    const sectionUpper = s.toUpperCase();
    if (KNOWN_STRANDS.has(sectionUpper)) return null;
    if (isBlockedSectionName(sectionUpper)) return null;
    return {
      gradeSection: `${g}-${s}`,
      grade: g,
      sectionName: s,
      strand: String(strand || '').trim().toUpperCase(),
    };
  }

  async function loadCanonicalSectionEntries() {
    try {
      const rows = await fetchJson('/settings/grades-sections');
      const list = Array.isArray(rows) ? rows : [];
      const byGradeSection = new Map();
      list.forEach((row) => {
        const entry = buildSectionEntry(row?.grade_level, row?.section_name, row?.strand);
        if (!entry) return;
        if (!byGradeSection.has(entry.gradeSection)) {
          byGradeSection.set(entry.gradeSection, entry);
        }
      });
      predictiveSectionEntries = Array.from(byGradeSection.values()).sort((a, b) => {
        const g = Number.parseInt(a.grade, 10) - Number.parseInt(b.grade, 10);
        if (!Number.isNaN(g) && g !== 0) return g;
        return a.gradeSection.localeCompare(b.gradeSection);
      });
    } catch (error) {
      // Keep predictive dashboard usable even when settings endpoint is unavailable.
      predictiveSectionEntries = [];
      console.warn('[predictive] failed to load canonical sections', error);
    }
  }

  function mergeSectionEntries(sectionEntries, sections, seedEntries = []) {
    const byGradeSection = new Map();

    function upsertEntry(rawEntry) {
      if (!rawEntry) return;
      const normalized = buildSectionEntry(rawEntry.grade, rawEntry.sectionName, '');
      if (!normalized) return;

      const key = normalized.gradeSection;
      const incomingStrands = Array.isArray(rawEntry.strands)
        ? rawEntry.strands
        : [rawEntry.strand];
      const incomingSet = new Set(
        incomingStrands
          .map((value) => String(value || '').trim().toUpperCase())
          .filter(Boolean)
      );

      if (!byGradeSection.has(key)) {
        byGradeSection.set(key, {
          ...normalized,
          strands: Array.from(incomingSet),
        });
        return;
      }

      const existing = byGradeSection.get(key);
      const merged = new Set([...(existing.strands || []), ...incomingSet]);
      existing.strands = Array.from(merged);
    }

    (Array.isArray(seedEntries) ? seedEntries : []).forEach((entry) => {
      upsertEntry({
        grade: entry?.grade,
        sectionName: entry?.sectionName,
        strand: entry?.strand,
        strands: entry?.strands,
      });
    });

    (Array.isArray(sectionEntries) ? sectionEntries : []).forEach((row) => {
      const parsed = parseGradeSection(row?.grade_section);
      upsertEntry({
        grade: parsed.grade,
        sectionName: parsed.sectionName,
        strand: row?.strand,
      });
    });

    (Array.isArray(sections) ? sections : []).forEach((gradeSection) => {
      const parsed = parseGradeSection(gradeSection);
      upsertEntry({
        grade: parsed.grade,
        sectionName: parsed.sectionName,
      });
    });

    return Array.from(byGradeSection.values()).sort((a, b) => {
      const g = Number.parseInt(a.grade, 10) - Number.parseInt(b.grade, 10);
      if (!Number.isNaN(g) && g !== 0) return g;
      return a.gradeSection.localeCompare(b.gradeSection);
    });
  }

  function extractSectionEntriesFromViolationRows(rows) {
    const byGradeSection = new Map();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const parsed = parseGradeSection(row?.grade_section);
      const base = buildSectionEntry(parsed.grade, parsed.sectionName, '');
      if (!base) return;

      const key = base.gradeSection;
      const strand = String(row?.strand || '').trim().toUpperCase();
      if (!byGradeSection.has(key)) {
        byGradeSection.set(key, {
          grade: base.grade,
          sectionName: base.sectionName,
          strand: strand || '',
          strands: strand ? [strand] : [],
        });
        return;
      }

      if (!strand) return;
      const existing = byGradeSection.get(key);
      const merged = new Set([...(existing.strands || []), strand]);
      existing.strands = Array.from(merged);
      if (!existing.strand) existing.strand = strand;
    });

    return Array.from(byGradeSection.values());
  }

  async function loadSectionEntriesFromViolations() {
    try {
      const params = new URLSearchParams({ page: '1', limit: '1000' });
      const payload = await fetchJson(`/violations?${params.toString()}`);
      const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
      return extractSectionEntriesFromViolationRows(rows);
    } catch (error) {
      console.warn('[predictive] failed to derive section entries from violations', error);
      return [];
    }
  }

  function derivePredictiveFilterOptions(entries) {
    const strands = new Set();

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const list = Array.isArray(entry?.strands) ? entry.strands : [entry?.strand];
      list
        .map((value) => String(value || '').trim().toUpperCase())
        .filter(Boolean)
        .forEach((strand) => strands.add(strand));
    });

    return {
      strands: Array.from(strands).sort((a, b) => String(a).localeCompare(String(b))),
    };
  }

  function authHeaders() {
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchJson(path) {
    if (!API_ROOT) throw new Error('API base URL not configured');
    const safePath = sanitizeText ? sanitizeText(path) : path;
    const requestUrl = `${API_ROOT}${safePath}`;
    const safeRequestUrl = sanitizeUrl ? sanitizeUrl(requestUrl) : requestUrl;
    const res = await fetch(safeRequestUrl, {
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });

    if (res.status === 401) {
      window.location.href = 'index.html';
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }

    return res.json();
  }

  function setEmptyState(show, message = '') {
    if (show) {
      chartWrap?.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      if (message) emptyEl.textContent = message;
    } else {
      chartWrap?.classList.remove('hidden');
      emptyEl.classList.add('hidden');
    }
  }

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
  }

  function updateSelectOptions(selectEl, values) {
    if (!selectEl) return;
    const previous = selectEl.value || 'All';
    selectEl.innerHTML = '<option value="All">All</option>';

    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      selectEl.appendChild(option);
    });

    selectEl.value = values.includes(previous) ? previous : 'All';
  }

  function getSectionsForSelectedStrand() {
    const sourceEntries = (Array.isArray(predictiveSectionEntries) && predictiveSectionEntries.length)
      ? predictiveSectionEntries
      : (Array.isArray(predictiveSections) ? predictiveSections
        .map((gradeSection) => {
          const parsed = parseGradeSection(gradeSection);
          return buildSectionEntry(parsed.grade, parsed.sectionName, '');
        })
        .filter(Boolean) : []);

    const strand = strandSelect?.value || 'All';
    if (!strand || strand === 'All') {
      return sourceEntries.map((entry) => entry.gradeSection);
    }

    const normalizedStrand = String(strand).toUpperCase();
    return sourceEntries
      .filter((entry) => {
        const strandSet = new Set(
          (Array.isArray(entry.strands) ? entry.strands : [entry.strand])
            .map((value) => String(value || '').trim().toUpperCase())
            .filter(Boolean)
        );
        // Keep entries with unknown strand mapping to avoid dropping valid sections.
        if (!strandSet.size) return true;
        return strandSet.has(normalizedStrand);
      })
      .map((entry) => entry.gradeSection);
  }

  function syncGradeSectionOptionsWithStrand() {
    if (!sectionSelect) return;
    const filteredSections = getSectionsForSelectedStrand();
    updateSelectOptions(sectionSelect, filteredSections);
  }

  function filterRowsByExtraFilters(rows) {
    const strandFilter = strandSelect?.value || 'All';
    const strandLookup = new Map();
    predictiveSectionEntries.forEach((entry) => {
      const key = String(entry.gradeSection || '').trim();
      if (!key) return;
      const strandSet = new Set(
        (Array.isArray(entry.strands) ? entry.strands : [entry.strand])
          .map((value) => String(value || '').trim().toUpperCase())
          .filter(Boolean)
      );
      strandLookup.set(key, strandSet);
    });

    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (isStrandLikeGradeSection(row?.section)) return false;
      const parsed = parseGradeSection(row?.section);
      if (isBlockedSectionName(parsed.sectionName)) return false;

      if (strandFilter !== 'All') {
        const key = String(row?.section || '').trim();
        const rowStrands = strandLookup.get(key);
        const wanted = String(strandFilter).toUpperCase();
        if (rowStrands && rowStrands.size && !rowStrands.has(wanted)) return false;
      }
      return true;
    });
  }

  function renderChart(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      setEmptyState(true);
      return;
    }

    const labels = rows.map((row) => row.section);
    const percentages = rows.map((row) => Math.round(Number(row.likelihood || 0) * 10000) / 100);
    const samples = rows.map((row) => Number(row.sample_size || 0));

    if (chartInstance) chartInstance.destroy();
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      setEmptyState(true, 'Chart library unavailable.');
      return;
    }

    setEmptyState(false);
    chartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Repeat Violation Likelihood (%)',
            data: percentages,
            backgroundColor: '#1e88e5cc',
            borderColor: '#1e88e5',
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const sample = samples[ctx.dataIndex] ?? 0;
                return `${ctx.formattedValue}% likelihood (n=${sample})`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: 'Likelihood (%)' },
          },
          x: {
            title: { display: true, text: 'Section' },
          },
        },
      },
    });
  }

  function buildEndpointPath() {
    const windowDays = String(windowSelect?.value || '90');
    const section = sectionSelect?.value || 'All';
    const violation = violationSelect?.value || 'All';
    const params = new URLSearchParams({
      section,
      violation,
      window_days: windowDays,
      limit: '50',
    });
    return `/analytics/predictive-repeat-risk?${params.toString()}`;
  }

  function windowLabel(days) {
    const value = Number(days);
    if (value === 7) return '7 days';
    if (value === 30) return '30 days';
    if (value === 90) return '3 months';
    if (value === 365) return '1 year';
    return `${value} days`;
  }

  async function loadPredictiveData() {
    try {
      setStatus('Loading repeat-risk predictions...');
      if (!predictiveSectionEntries.length) {
        await loadCanonicalSectionEntries();
      }
      const payload = await fetchJson(buildEndpointPath());
      predictiveData = payload;

      const sections = Array.isArray(payload.sections) ? payload.sections : [];
      const sectionEntries = Array.isArray(payload.section_entries) ? payload.section_entries : [];
      const violations = Array.isArray(payload.violations) ? payload.violations : [];
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      predictiveSectionEntries = mergeSectionEntries(sectionEntries, sections, predictiveSectionEntries);

      // Ensure strand->grade-section options stay aligned with actual violation data.
      const violationDerivedEntries = await loadSectionEntriesFromViolations();
      if (violationDerivedEntries.length) {
        predictiveSectionEntries = mergeSectionEntries([], sections, [
          ...predictiveSectionEntries,
          ...violationDerivedEntries,
        ]);
      }

      const derived = derivePredictiveFilterOptions(predictiveSectionEntries);
      predictiveSections = sections.slice();

      updateSelectOptions(strandSelect, derived.strands);
      syncGradeSectionOptionsWithStrand();
      updateSelectOptions(violationSelect, violations);
      renderChart(filterRowsByExtraFilters(rows));

      if (noteEl) {
        const windowDays = Number(payload.window_days || 90);
        noteEl.textContent = `Estimated section likelihood of repeat violations over the last ${windowLabel(windowDays)}. Updated automatically after each new violation.`;
      }

      const generatedAt = payload.generated_at ? new Date(payload.generated_at) : null;
      const formatted = generatedAt && !Number.isNaN(generatedAt.getTime())
        ? generatedAt.toLocaleString()
        : 'N/A';
      setStatus(`Last updated: ${formatted}`);
    } catch (error) {
      console.error('[predictive] failed to load predictive-repeat-risk', error);
      setEmptyState(true, 'Predictive service unavailable. Please check backend and inference service configuration.');
      setStatus('');
    }
  }

  windowSelect?.addEventListener('change', loadPredictiveData);
  sectionSelect?.addEventListener('change', loadPredictiveData);
  strandSelect?.addEventListener('change', () => {
    syncGradeSectionOptionsWithStrand();
    loadPredictiveData();
  });
  violationSelect?.addEventListener('change', loadPredictiveData);

  loadPredictiveData();
});
