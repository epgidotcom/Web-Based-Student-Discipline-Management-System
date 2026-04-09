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
  const KNOWN_STRANDS = new Set(['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'HE', 'ICT']);

  function parseGradeSection(value) {
    const raw = String(value || '').trim();
    if (!raw) return { grade: '', sectionName: '' };
    const parts = raw.split('-').map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) return { grade: parts[0] || '', sectionName: '' };
    return { grade: parts[0] || '', sectionName: parts.slice(1).join('-') };
  }

  function derivePredictiveFilterOptions(sections) {
    const strands = new Set();

    (Array.isArray(sections) ? sections : []).forEach((entry) => {
      const parsed = parseGradeSection(entry);
      if (parsed.sectionName) {
        if (KNOWN_STRANDS.has(parsed.sectionName.toUpperCase())) {
          strands.add(parsed.sectionName.toUpperCase());
        }
      }
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

  function filterRowsByExtraFilters(rows) {
    const strandFilter = strandSelect?.value || 'All';

    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const parsed = parseGradeSection(row?.section);
      if (strandFilter !== 'All' && String(parsed.sectionName || '').toUpperCase() !== String(strandFilter).toUpperCase()) return false;
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
      const payload = await fetchJson(buildEndpointPath());
      predictiveData = payload;

      const sections = Array.isArray(payload.sections) ? payload.sections : [];
      const violations = Array.isArray(payload.violations) ? payload.violations : [];
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const derived = derivePredictiveFilterOptions(sections);

      updateSelectOptions(sectionSelect, sections);
      updateSelectOptions(strandSelect, derived.strands);
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
  strandSelect?.addEventListener('change', loadPredictiveData);
  violationSelect?.addEventListener('change', loadPredictiveData);

  loadPredictiveData();
});
