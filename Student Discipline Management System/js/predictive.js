<script>
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('chartPredictive');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  //for merging
  const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
  const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;
  const allowSimulated = Boolean(window.SDMS_CONFIG?.DEV_PREVIEW);

  const defaultWeeks = ['Jul 7', 'Jul 14', 'Jul 21', 'Jul 28', 'Aug 4', 'Aug 11'];
  const defaultStrands = ['STEM', 'ABM', 'GAS', 'HUMSS', 'TVL'];
  const defaultViolations = ['Tardiness', 'Cheating', 'Dress Code Violation', 'Disrespect'];

  const chartWrap = canvas.parentElement;
  const noteEl = document.querySelector('.chart-note');
  const defaultNote = noteEl?.textContent?.trim() || '';
  const emptyEl = document.createElement('div');
  emptyEl.id = 'predictiveEmpty';
  emptyEl.className = 'empty hidden';
  emptyEl.textContent = 'Forecast data will appear once the analytics service is connected.';
  if (chartWrap?.parentElement) {
    chartWrap.parentElement.insertBefore(emptyEl, chartWrap.nextSibling);
  }

  // container for external image mode
  const imgWrap = document.createElement('div');
  imgWrap.id = 'predictiveImageWrap';
  imgWrap.className = 'hidden';
  imgWrap.style.display = 'grid';
  imgWrap.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
  imgWrap.style.gap = '12px';
  chartWrap?.parentElement?.insertBefore(imgWrap, chartWrap.nextSibling);

  function setEmptyState(show) {
    if (chartWrap) chartWrap.classList.toggle('hidden', show);
    emptyEl?.classList.toggle('hidden', !show);
    imgWrap?.classList.add('hidden');
  }

  function setNote(source) {
    if (!noteEl) return;
    if (source === 'simulated') noteEl.textContent = `${defaultNote} (using sample data for preview)`;
    else if (source === 'none') noteEl.textContent = 'Forecast data will appear once the analytics service is connected.';
    else if (source === 'external') noteEl.textContent = `${defaultNote} (external image feed)`;
    else noteEl.textContent = defaultNote;
  }

  function generateSimulatedMatrix(weeks, strands, violations) {
    const out = {};
    strands.forEach((strand) => {
      out[strand] = {};
      violations.forEach((violation) => {
        out[strand][violation] = weeks.map((_, index) => {
          const strandBias = strand === 'STEM' ? 6 : strand === 'ABM' ? 4 : strand === 'GAS' ? 3 : strand === 'HUMSS' ? 2 : 1;
          return Math.max(0, Math.floor(Math.random() * 10 + index * 2 + strandBias));
        });
      });
    });
    return out;
  }

  const forecastState = {
    weeks: defaultWeeks.slice(),
    strands: [],
    violations: [],
    matrix: {},
  };
  let forecastSource = 'none';

  function authHeaders() {
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function formatWeekLabel(label) {
    if (!label) return '';
    const date = new Date(label);
    if (Number.isNaN(date.getTime())) return String(label);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }

  function normalizeBackendPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;

    let weeks = Array.isArray(payload.weeks) && payload.weeks.length ? payload.weeks.map(formatWeekLabel) : null;
    let strands = Array.isArray(payload.strands) && payload.strands.length ? payload.strands.map(String) : null;
    let violations = Array.isArray(payload.violations) && payload.violations.length ? payload.violations.map(String) : null;

    const matrix = {};
    if (payload.data && typeof payload.data === 'object') {
      Object.entries(payload.data).forEach(([sKey, sVal]) => {
        if (!matrix[sKey]) matrix[sKey] = {};
        Object.entries(sVal || {}).forEach(([vKey, values]) => {
          if (Array.isArray(values)) matrix[sKey][vKey] = values.map((x) => Number(x) || 0);
        });
      });
      strands = strands || Object.keys(matrix);
    } else if (Array.isArray(payload.series)) {
      payload.series.forEach((entry) => {
        const sKey = entry.strand || entry.group || entry.label;
        const vKey = entry.violation || entry.type || 'All';
        if (!sKey || !Array.isArray(entry.values)) return;
        if (!matrix[sKey]) matrix[sKey] = {};
        matrix[sKey][vKey] = entry.values.map((x) => Number(x) || 0);
      });
      strands = strands || Object.keys(matrix);
    }

    if (!strands?.length) return null;
    if (!violations?.length) {
      const set = new Set();
      strands.forEach((s) => Object.keys(matrix[s] || {}).forEach((k) => set.add(k)));
      violations = set.size ? Array.from(set) : defaultViolations.slice();
    }
    if (!weeks?.length) weeks = defaultWeeks.slice();

    strands.forEach((s) => {
      if (!matrix[s]) matrix[s] = {};
      violations.forEach((v) => {
        if (!Array.isArray(matrix[s][v])) matrix[s][v] = new Array(weeks.length).fill(0);
      });
    });

    return { weeks, strands, violations, matrix };
  }

  async function loadBackendForecast() {
    if (!API_ROOT) return false;
    try {
      const res = await fetch(`${API_ROOT}/analytics/predictive`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(await res.text() || `Request failed (${res.status})`);
      const payload = await res.json();
      const normalized = normalizeBackendPayload(payload);
      if (normalized) {
        forecastState.weeks = normalized.weeks;
        forecastState.strands = normalized.strands;
        forecastState.violations = normalized.violations;
        forecastState.matrix = normalized.matrix;
        return true;
      }
    } catch (e) {
      console.warn('[predictive] backend fetch failed', e);
    }
    return false;
  }

  // External image API
  const EXTERNAL_API_BASE = 'https://jembots-test.hf.space/plot';
  function externalImageURL(strand, violation, steps) {
    return `${EXTERNAL_API_BASE}?strand=${encodeURIComponent(strand)}&violation=${encodeURIComponent(violation)}&steps=${encodeURIComponent(String(steps))}`;
  }

  async function loadExternalForecast() {
    forecastState.weeks = forecastState.weeks?.length ? forecastState.weeks.slice() : defaultWeeks.slice();
    forecastState.strands = defaultStrands.slice();
    forecastState.violations = defaultViolations.slice();
    forecastState.matrix = {};
    return true;
  }

  function syncFilterOptions() {
    const strandSelect = document.getElementById('filterStrand');
    const violationSelect = document.getElementById('filterViolation');
    if (strandSelect) {
      const previous = strandSelect.value;
      strandSelect.innerHTML = '<option value="All">All</option>';
      forecastState.strands.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        strandSelect.appendChild(opt);
      });
      strandSelect.value = forecastState.strands.includes(previous) ? previous : 'All';
    }
    if (violationSelect) {
      const previous = violationSelect.value;
      violationSelect.innerHTML = '<option value="All">All</option>';
      forecastState.violations.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        violationSelect.appendChild(opt);
      });
      violationSelect.value = forecastState.violations.includes(previous) ? previous : 'All';
    }
  }

  let chartInstance;

  function renderExternalImages() {
    chartWrap?.classList.add('hidden');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    imgWrap.classList.remove('hidden');
    emptyEl?.classList.add('hidden');

    const strandSelect = document.getElementById('filterStrand');
    const violationSelect = document.getElementById('filterViolation');
    const strandValue = strandSelect?.value || 'All';
    const violationValue = violationSelect?.value || 'All';
    const steps = forecastState.weeks.length || defaultWeeks.length;

    const strands = strandValue === 'All' ? forecastState.strands : [strandValue];
    const violations = violationValue === 'All' ? forecastState.violations : [violationValue];

    imgWrap.innerHTML = '';
    const MAX_IMAGES = 20;
    let count = 0;

    for (const s of strands) {
      for (const v of violations) {
        if (count >= MAX_IMAGES) break;
        const url = externalImageURL(s, v, steps);

        const card = document.createElement('div');
        card.style.border = '1px solid #e5e7eb';
        card.style.borderRadius = '12px';
        card.style.overflow = 'hidden';
        card.style.background = '#fff';
        card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';

        const header = document.createElement('div');
        header.style.padding = '8px 12px';
        header.style.fontSize = '13px';
        header.style.fontWeight = '600';
        header.style.background = '#f9fafb';
        header.textContent = `${s} — ${v}`;

        const img = document.createElement('img');
        img.src = url;
        img.alt = `${s} / ${v} (${steps} steps)`;
        img.style.display = 'block';
        img.style.width = '100%';
        img.style.height = 'auto';
        img.loading = 'lazy';

        img.onerror = () => {
          const fallback = document.createElement('div');
          fallback.style.padding = '16px';
          fallback.style.color = '#991b1b';
          fallback.style.fontSize = '12px';
          fallback.textContent = `Unable to load image for ${s} / ${v}`;
          card.replaceChild(fallback, img);
        };

        card.appendChild(header);
        card.appendChild(img);
        imgWrap.appendChild(card);
        count++;
      }
      if (count >= MAX_IMAGES) break;
    }
  }

  function updateChart() {
    if (forecastSource === 'external') {
      setNote('external');
      renderExternalImages();
      return;
    }

    const strandSelect = document.getElementById('filterStrand');
    const violationSelect = document.getElementById('filterViolation');
    if (!strandSelect || !violationSelect) return;

    const strandValue = strandSelect.value;
    const violationValue = violationSelect.value;

    const visibleStrands = strandValue === 'All' ? forecastState.strands : [strandValue];
    const selectedViolations = violationValue === 'All' ? forecastState.violations : [violationValue];

    const palette = ['#1e88e5', '#43a047', '#ffb300', '#8e24aa', '#e53935', '#00acc1', '#f4511e'];

    let hasSeries = false;
    const datasets = visibleStrands.map((strand, index) => {
      const values = forecastState.weeks.map((_, weekIndex) => {
        let total = 0, count = 0;
        selectedViolations.forEach((violation) => {
          const series = forecastState.matrix?.[strand]?.[violation];
          if (Array.isArray(series) && series.length > weekIndex) {
            total += Number(series[weekIndex]) || 0;
            count += 1;
            hasSeries = true;
          }
        });
        return count ? Math.round(total / count) : 0;
      });

      const color = palette[index % palette.length];
      return {
        label: strand,
        data: values,
        borderColor: color,
        backgroundColor: `${color}33`,
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });

    const hasData = hasSeries && forecastState.weeks.length && datasets.length;

    if (!hasData) {
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      setEmptyState(true);
      setNote(forecastSource);
      return;
    }

    imgWrap.classList.add('hidden');
    chartWrap.classList.remove('hidden');
    setEmptyState(false);
    setNote(forecastSource);

    if (chartInstance) chartInstance.destroy();

    // Ensure Chart is available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded');
      return;
    }

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels: forecastState.weeks, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Predicted Repeat Offenders' } },
          x: { title: { display: true, text: '7-Day Intervals' } },
        },
      },
    });
  }

  async function init() {
    const backendLoaded = await loadBackendForecast();

    if (backendLoaded) {
      forecastSource = 'backend';
    } else {
      const externalLoaded = await loadExternalForecast();
      if (externalLoaded) {
        forecastSource = 'external';
      } else if (allowSimulated) {
        forecastState.weeks = defaultWeeks.slice();
        forecastState.strands = defaultStrands.slice();
        forecastState.violations = defaultViolations.slice();
        forecastState.matrix = generateSimulatedMatrix(defaultWeeks, defaultStrands, defaultViolations);
        forecastSource = 'simulated';
      } else {
        forecastState.weeks = defaultWeeks.slice();
        forecastState.strands = [];
        forecastState.violations = [];
        forecastState.matrix = {};
        forecastSource = 'none';
      }
    }

    syncFilterOptions();
    updateChart();

    document.getElementById('filterStrand')?.addEventListener('change', updateChart);
    document.getElementById('filterViolation')?.addEventListener('change', updateChart);
  }

  init();
});
</script>
