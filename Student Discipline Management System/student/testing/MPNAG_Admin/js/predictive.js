document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('chartPredictive');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
  const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;
  const allowSimulated = Boolean(window.SDMS_CONFIG?.DEV_PREVIEW);

  const defaultWeeks = ['Jul 7', 'Jul 14', 'Jul 21', 'Jul 28', 'Aug 4', 'Aug 11'];
  const defaultStrands = ['STEM', 'ABM', 'GAS', 'HUMSS', 'TVL'];
  const defaultViolations = ['Tardiness', 'Cheating', 'Dress Code', 'Disrespect'];

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

  function setEmptyState(show) {
    if (chartWrap) chartWrap.classList.toggle('hidden', show);
    emptyEl?.classList.toggle('hidden', !show);
  }

  function setNote(source) {
    if (!noteEl) return;
    if (source === 'simulated') {
      noteEl.textContent = `${defaultNote} (using sample data for preview)`;
    } else if (source === 'none') {
      noteEl.textContent = 'Forecast data will appear once the analytics service is connected.';
    } else {
      noteEl.textContent = defaultNote;
    }
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

    let weeks = Array.isArray(payload.weeks) && payload.weeks.length
      ? payload.weeks.map(formatWeekLabel)
      : null;

    let strands = Array.isArray(payload.strands) && payload.strands.length
      ? payload.strands.map((s) => String(s))
      : null;

    let violations = Array.isArray(payload.violations) && payload.violations.length
      ? payload.violations.map((v) => String(v))
      : null;

    const matrix = {};

    if (payload.data && typeof payload.data === 'object') {
      Object.entries(payload.data).forEach(([strandKey, strandValue]) => {
        if (!matrix[strandKey]) matrix[strandKey] = {};
        Object.entries(strandValue || {}).forEach(([violationKey, values]) => {
          if (Array.isArray(values)) {
            matrix[strandKey][violationKey] = values.map((value) => Number(value) || 0);
          }
        });
      });
      strands = strands || Object.keys(matrix);
    } else if (Array.isArray(payload.series)) {
      payload.series.forEach((entry) => {
        const strandKey = entry.strand || entry.group || entry.label;
        const violationKey = entry.violation || entry.type || 'All';
        if (!strandKey || !Array.isArray(entry.values)) return;
        if (!matrix[strandKey]) matrix[strandKey] = {};
        matrix[strandKey][violationKey] = entry.values.map((value) => Number(value) || 0);
      });
      strands = strands || Object.keys(matrix);
    }

    if (!strands || !strands.length) return null;
    if (!violations || !violations.length) {
      const violationSet = new Set();
      strands.forEach((strand) => {
        Object.keys(matrix[strand] || {}).forEach((key) => violationSet.add(key));
      });
      violations = violationSet.size ? Array.from(violationSet) : defaultViolations.slice();
    }
    if (!weeks || !weeks.length) weeks = defaultWeeks.slice();

    // Ensure every strand/violation combination has an array (fill with zeros if missing)
    strands.forEach((strand) => {
      if (!matrix[strand]) matrix[strand] = {};
      violations.forEach((violation) => {
        if (!Array.isArray(matrix[strand][violation])) {
          matrix[strand][violation] = new Array(weeks.length).fill(0);
        }
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
      if (res.status === 404) {
        console.info('[predictive] backend endpoint not yet available, using simulated data');
        return false;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      const payload = await res.json();
      const normalized = normalizeBackendPayload(payload);
      if (normalized) {
        forecastState.weeks = normalized.weeks;
        forecastState.strands = normalized.strands;
        forecastState.violations = normalized.violations;
        forecastState.matrix = normalized.matrix;
        console.info('[predictive] forecast data loaded from backend');
        return true;
      }
    } catch (err) {
      console.warn('[predictive] failed to fetch backend forecast', err);
    }
    return false;
  }

  function syncFilterOptions() {
    const strandSelect = document.getElementById('filterStrand');
    const violationSelect = document.getElementById('filterViolation');
    if (strandSelect) {
      const previous = strandSelect.value;
      strandSelect.innerHTML = '<option value="All">All</option>';
      forecastState.strands.forEach((strand) => {
        const option = document.createElement('option');
        option.value = strand;
        option.textContent = strand;
        strandSelect.appendChild(option);
      });
      strandSelect.value = forecastState.strands.includes(previous) ? previous : 'All';
    }
    if (violationSelect) {
      const previous = violationSelect.value;
      violationSelect.innerHTML = '<option value="All">All</option>';
      forecastState.violations.forEach((violation) => {
        const option = document.createElement('option');
        option.value = violation;
        option.textContent = violation;
        violationSelect.appendChild(option);
      });
      violationSelect.value = forecastState.violations.includes(previous) ? previous : 'All';
    }
  }

  let chartInstance;

  function updateChart() {
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
        let total = 0;
        let count = 0;
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
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      setEmptyState(true);
      setNote(forecastSource);
      return;
    }

    setEmptyState(false);
    setNote(forecastSource);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels: forecastState.weeks, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 15 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Predicted Repeat Offenders' },
          },
          x: {
            title: { display: true, text: '7-Day Intervals' },
          },
        },
      },
    });
  }

  async function init() {
    const backendLoaded = await loadBackendForecast();

    if (backendLoaded) {
      forecastSource = 'backend';
    } else if (allowSimulated) {
      forecastState.weeks = defaultWeeks.slice();
      forecastState.strands = defaultStrands.slice();
      forecastState.violations = defaultViolations.slice();
      forecastState.matrix = generateSimulatedMatrix(defaultWeeks, defaultStrands, defaultViolations);
      forecastSource = 'simulated';
      console.info('[predictive] using sample forecast data (DEV_PREVIEW)');
    } else {
      forecastState.weeks = defaultWeeks.slice();
      forecastState.strands = [];
      forecastState.violations = [];
      forecastState.matrix = {};
      forecastSource = 'none';
    }

    syncFilterOptions();
    updateChart();

    document.getElementById('filterStrand')?.addEventListener('change', updateChart);
    document.getElementById('filterViolation')?.addEventListener('change', updateChart);
  }

  init();
});
