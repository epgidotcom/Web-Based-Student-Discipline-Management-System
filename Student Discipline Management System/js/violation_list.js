;(() => {
  const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
  const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;

  let violations = [];
  let students = [];
  let evidenceState = [];

  const tableBody = document.querySelector('#violationTable tbody');

  const filterDateInput = document.getElementById('filterDate');
  const clearFilterDateBtn = document.getElementById('clearFilterDate');

  // Date filter state
  let __dateMode = 'day'; // 'day' | 'month' | 'year'
  let __selectedDate = null; // JS Date or null
  let __datepickerInstance = null;

  // --- Date RANGE filter state (new) ---
  const dateFromEl = document.getElementById('dateFrom');
  const dateToEl   = document.getElementById('dateTo');
  const clearDateRangeBtn = document.getElementById('clearDateRange');

  let __rangeFrom = null; // string 'YYYY-MM-DD' or null
  let __rangeTo   = null; // string 'YYYY-MM-DD' or null
  let __dpFrom = null;    // Datepicker instance
  let __dpTo   = null;    // Datepicker instance

  function toISODateOnly(d) {
    if (!(d instanceof Date) || isNaN(d)) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function computeRange(date, mode) {
    if (!date) return { from: null, to: null };
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return { from: null, to: null };
    if (mode === 'year') {
      return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
    }
    if (mode === 'month') {
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { from: toYMD(first), to: toYMD(last) };
    }
    return { from: toYMD(d), to: toYMD(d) };
  }

  function applyDateSelection(date, mode) {
    __selectedDate = date ? new Date(date) : null;
    __dateMode = mode || __dateMode || 'day';
    if (__selectedDate) {
      if (__dateMode === 'year') {
        filterDateInput.value = String(__selectedDate.getFullYear());
      } else if (__dateMode === 'month') {
        filterDateInput.value = `${__selectedDate.toLocaleString(undefined, { month: 'short' })} ${__selectedDate.getFullYear()}`;
      } else {
        // let datepicker populate locale string; keep it if available
        try { filterDateInput.value = __selectedDate.toLocaleDateString(); } catch { filterDateInput.value = String(__selectedDate); }
      }
      clearFilterDateBtn?.classList?.remove?.('is-hidden');
      clearFilterDateBtn && (clearFilterDateBtn.style.display = '');
    } else {
      filterDateInput.value = '';
      clearFilterDateBtn?.classList?.add?.('is-hidden');
      clearFilterDateBtn && (clearFilterDateBtn.style.display = 'none');
    }
    // reload backend & re-filter client-side
    if (paginator?.fetchData) paginator.fetchData(1).catch(()=>{});
    else fetchData(1).catch(()=>{});
    applyFilters();
  }

  function initDateFilter() {
    if (!filterDateInput) return;
    // try to create a vanillajs-datepicker instance if available
    try {
      const Datepicker = window.Datepicker || window.datepicker;
      if (Datepicker) {
        __datepickerInstance = new Datepicker(filterDateInput, { autohide: true, buttonClass: 'btn' });
        // when input changes, try to obtain the real Date
        filterDateInput.addEventListener('change', () => {
          let chosen = null;
          // try dp.getDate() if available
          try {
            if (__datepickerInstance && typeof __datepickerInstance.getDate === 'function') {
              chosen = __datepickerInstance.getDate();
            }
          } catch (e) { /* ignore */ }
          // fallback to parsing input text
          if (!chosen || isNaN(chosen.getTime())) {
            const parsed = new Date(filterDateInput.value);
            if (!isNaN(parsed.getTime())) chosen = parsed;
          }
          applyDateSelection(chosen, __dateMode);
        });

        // cycle mode when user clicks the picker's header/title (best-effort)
        document.addEventListener('click', (ev) => {
          const sw = ev.target.closest && ev.target.closest('.datepicker .datepicker-switch');
          if (!sw) return;
          __dateMode = __dateMode === 'day' ? 'month' : (__dateMode === 'month' ? 'year' : 'day');
          // update placeholder to give feedback
          filterDateInput.placeholder = __dateMode === 'year' ? 'Year view' : __dateMode === 'month' ? 'Month view' : 'Day view';
        });
      } else {
        // fallback: clicking opens native date input
        filterDateInput.addEventListener('click', () => {
          const native = document.createElement('input');
          native.type = 'date';
          native.style.position = 'absolute';
          native.style.opacity = '0';
          document.body.appendChild(native);
          native.click();
          native.addEventListener('change', () => {
            const d = native.value ? new Date(native.value) : null;
            applyDateSelection(d, 'day');
            native.remove();
          }, { once: true });
        });
      }
    } catch (err) {
      console.warn('[violations] datepicker init error', err);
    }

    // clear button behavior
    clearFilterDateBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      applyDateSelection(null, 'day');
    });
  }

  function initDateRangeFilter() {
    if (!dateFromEl || !dateToEl) return;

    const common = { autohide: true, format: 'yyyy-mm-dd', buttonClass: 'btn' };
    try {
      const DP = window.Datepicker || window.datepicker;
      if (DP) {
        __dpFrom = new DP(dateFromEl, common);
        __dpTo   = new DP(dateToEl,   common);
      }
    } catch (e) {
      console.warn('[violations] range datepickers unavailable, falling back to plain inputs', e);
    }

    function updateClearBtn() {
      const any = Boolean(__rangeFrom || __rangeTo);
      if (clearDateRangeBtn) clearDateRangeBtn.style.display = any ? '' : 'none';
    }

    function onFromChange(e) {
      const d = (e?.detail?.date) || new Date(dateFromEl.value);
      __rangeFrom = d && !isNaN(d) ? toISODateOnly(d) : null;

      // keep valid min for "to"
      if (__dpTo) {
        __dpTo.setOptions({ minDate: __rangeFrom ? new Date(__rangeFrom) : null });
      }
      updateClearBtn();

      // refresh page + re-filter
      if (paginator?.fetchData) paginator.fetchData(1).catch(()=>{});
      else fetchData(1).catch(()=>{});
      applyFilters();
    }

    function onToChange(e) {
      const d = (e?.detail?.date) || new Date(dateToEl.value);
      __rangeTo = d && !isNaN(d) ? toISODateOnly(d) : null;

      // keep valid max for "from"
      if (__dpFrom) {
        __dpFrom.setOptions({ maxDate: __rangeTo ? new Date(__rangeTo) : null });
      }
      updateClearBtn();

      if (paginator?.fetchData) paginator.fetchData(1).catch(()=>{});
      else fetchData(1).catch(()=>{});
      applyFilters();
    }

    // Events (datepicker or plain input)
    dateFromEl.addEventListener('change', onFromChange);
    dateToEl.addEventListener('change', onToChange);
    dateFromEl.addEventListener('changeDate', onFromChange);
    dateToEl.addEventListener('changeDate', onToChange);

    clearDateRangeBtn?.addEventListener('click', () => {
      __rangeFrom = null;
      __rangeTo = null;
      if (__dpFrom?.setDate) __dpFrom.setDate({ clear: true });
      if (__dpTo?.setDate) __dpTo.setDate({ clear: true });
      dateFromEl.value = '';
      dateToEl.value = '';
      if (__dpFrom?.setOptions) __dpFrom.setOptions({ maxDate: null });
      if (__dpTo?.setOptions) __dpTo.setOptions({ minDate: null });
      updateClearBtn();

      if (paginator?.fetchData) paginator.fetchData(1).catch(()=>{});
      else fetchData(1).catch(()=>{});
      applyFilters();
    });

    // initial state
    clearDateRangeBtn && (clearDateRangeBtn.style.display = 'none');
  }

  const addBtn = document.getElementById('addViolationBtn');
  const searchInput = document.getElementById('searchInput');
  // const paginationSummary = document.getElementById('violationsPageSummary');
  // const paginationControls = document.getElementById('violationsPagination');
  const PAGE_LIMIT = 100;
  let paginator = null;

  const violationModal = document.getElementById('violationModal');
  const violationForm = document.getElementById('violationForm');
  const modalTitle = document.getElementById('modalTitle');
  const editIndexField = document.getElementById('editIndex');

  const studentLRNField = document.getElementById('studentLRN');
  const studentNameField = document.getElementById('studentName');
  const gradeSectionField = document.getElementById('gradeSection');
  const incidentDateField = document.getElementById('incidentDate');
  const violationTypeField = document.getElementById('violationType');
  const sanctionField = document.getElementById('sanction');
  const remarksField = document.getElementById('remarks');

  const pastOffenseWrap = document.getElementById('pastOffenseWrap');
  const pastOffenseList = document.getElementById('pastOffenseList');
  const pastOffenseEmpty = document.getElementById('pastOffenseEmpty');

  const evidenceUploader = document.getElementById('evidenceUploader');
  const evidencePreview = document.getElementById('evidencePreview');
  const evidenceDrop = document.getElementById('evidenceDrop');
  const evidenceChoose = document.getElementById('evidenceChoose');
  const evidenceInput = document.getElementById('evidenceInput');
  const evidenceActions = document.getElementById('evidenceActions');
  const evidenceChange = document.getElementById('evidenceChange');
  const evidenceClear = document.getElementById('evidenceClear');

  const viewModal = document.getElementById('viewModal');
  const viewStudent = document.getElementById('viewStudent');
  const viewGradeSection = document.getElementById('viewGradeSection');
  const viewPastOffenseRow = document.getElementById('viewPastOffenseRow');
  const viewPastOffense = document.getElementById('viewPastOffense');
  const viewIncidentDate = document.getElementById('viewIncidentDate');
  const viewAddedDate = document.getElementById('viewAddedDate');
  const viewViolationType = document.getElementById('viewViolationType');
  const viewSanction = document.getElementById('viewSanction');
  const viewEvidenceWrap = document.getElementById('viewEvidenceWrap');
  const viewEvidence = document.getElementById('viewEvidence');
  const viewRemarks = document.getElementById('viewRemarks');

  const imagePreviewModal = document.getElementById('imagePreviewModal');
  const imagePreviewClose = document.getElementById('imagePreviewClose');
  const imagePreviewFull = document.getElementById('imagePreviewFull');

  function authHeaders(){
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const init = { method, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...headers } };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(`${API_ROOT}${path}`, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return DATE_FMT.format(date);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.style.display = 'none';
  }

  function openModal(modal) {
    if (!modal) return;
    modal.style.display = 'flex';
  }

  function renderEvidencePreview(container, list = [], { selectable = false } = {}) {
    if (!container) return;
    container.innerHTML = '';
    if (!list.length) {
      container.classList.add('is-hidden');
      if (selectable) evidenceActions?.classList.add('is-hidden');
      return;
    }
    container.classList.remove('is-hidden');
    if (selectable) evidenceActions?.classList.remove('is-hidden');

    list.forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'evidence-thumb';
      const img = document.createElement('img');
      img.alt = `Evidence ${idx + 1}`;
      img.src = item;
      img.addEventListener('click', () => {
        if (!imagePreviewModal || !imagePreviewFull) return;
        imagePreviewFull.src = item;
        openModal(imagePreviewModal);
      });
      wrapper.appendChild(img);
      container.appendChild(wrapper);
    });
  }

  function resetEvidence() {
    evidenceState = [];
    renderEvidencePreview(evidencePreview, evidenceState, { selectable: true });
  }

  async function fileToDataURL(file, maxEdge = 1280, quality = 0.9) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function addEvidenceFiles(fileList) {
    if (!fileList?.length) return;
    const toProcess = Array.from(fileList).slice(0, 3 - evidenceState.length);
    for (const file of toProcess) {
      if (!/^image\//i.test(file.type)) continue;
      try {
        const dataUrl = await fileToDataURL(file, 1280, 0.85);
        evidenceState.push(dataUrl);
      } catch (err) {
        console.error('[violations] failed to process evidence', err);
      }
    }
    renderEvidencePreview(evidencePreview, evidenceState, { selectable: true });
  }

  function updatePastOffenseDisplay(items) {
    if (!pastOffenseWrap || !pastOffenseList || !pastOffenseEmpty) return;
    pastOffenseList.innerHTML = '';
    if (!items?.length) {
      pastOffenseWrap.classList.add('is-hidden');
      pastOffenseEmpty.classList.remove('is-hidden');
      return;
    }
    pastOffenseWrap.classList.remove('is-hidden');
    pastOffenseEmpty.classList.add('is-hidden');
    items.slice(0, 5).forEach(v => {
      const li = document.createElement('li');
      const date = formatDate(v.incident_date);
      li.textContent = `${date ? `${date}: ` : ''}${v.offense_type || 'Violation'}`;
      pastOffenseList.appendChild(li);
    });
  }

  // === RENDER TABLE ===
  function renderTable(list = violations) {
    if (!tableBody) return;
    const source = Array.isArray(list) ? list : [];
    if (list !== violations) violations = source;

    tableBody.innerHTML = '';
    if (!source.length) {
      const row = document.createElement('tr');
      row.dataset.placeholder = 'empty';
      row.innerHTML = '<td colspan="10" style="text-align:center;color:#6b7280;">No records found.</td>';
      tableBody.appendChild(row);
      applyFilters();
      return;
    }

    // Compute total violations per student (client-side grouping)
    const totalByStudent = {};
    source.forEach(v => {
      const key = v.student_id || v.student_name || 'unknown';
      totalByStudent[key] = (totalByStudent[key] || 0) + 1;
    });

    source.forEach((v, idx) => {
      const pastOffense = (v.repeat_count ?? 0) > 0 ? `${v.repeat_count}` : '—';
      const totalViolations = totalByStudent[v.student_id || v.student_name || 'unknown'] || 1;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${v.student_name || '—'}</td>
        <td>${v.grade_section || '—'}</td>
        <td>${formatDate(v.incident_date)}</td>
        <td>${v.violation_type || '—'}</td>
        <td>${pastOffense}</td>
        <td>${totalViolations}</td> <!-- 🆕 Added new column -->
        <td>${v.sanction || '—'}</td>
        <td>
        <span class="status-badge ${v.status ? v.status.toLowerCase() : 'pending'}">
        ${v.status || 'Pending'}
        </span>
        </td>
        <td>${formatDate(v.created_at)}</td>
        <td>
        <button class="action-btn" data-action="view" data-index="${idx}" title="View"><i class="fa fa-eye"></i></button>
        <button class="action-btn edit-btn" data-action="edit" data-index="${idx}" title="Edit"><i class="fa fa-edit"></i></button>
        <button class="action-btn resolve-btn" data-action="resolve" data-index="${idx}" title="Resolve"><i class="fa fa-check"></i></button>
        <button class="action-btn delete-btn" data-action="delete" data-index="${idx}" title="Delete"><i class="fa fa-trash"></i></button>
        </td>
      `;
      row.dataset.incident = v.incident_date ? String(v.incident_date) : '';
      tableBody.appendChild(row);
    });

    applyFilters(); 
  }


  // === Pagination / Backend ===

  const paginationSummary = document.getElementById('violationsPageSummary');
  const paginationControls = document.getElementById('violationsPagination');
  paginator = window.SDMS?.createPaginationController({
    limit: PAGE_LIMIT,
    paginationContainer: paginationControls,
    summaryElement: paginationSummary,
    async fetcher(page, limit) {
  console.debug('[violations] fetcher called', { page, limit, rangeFrom: __rangeFrom, rangeTo: __rangeTo, selectedDate: __selectedDate });
  try { const dbg = document.getElementById('sdms-pagination-debug'); if (dbg) dbg.textContent = `violations: fetching page=${page}`; } catch (e) {}
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });

      // 1) Prefer explicit range if set
      if (__rangeFrom) params.set('date_from', __rangeFrom);
      if (__rangeTo)   params.set('date_to',   __rangeTo);

      // 2) Otherwise fall back to single date mode (day/month/year)
      if (!__rangeFrom && !__rangeTo && __selectedDate) {
        const r = computeRange(__selectedDate, __dateMode);
        if (r.from) params.set('date_from', r.from);
        if (r.to)   params.set('date_to',   r.to);
      }

      const res = await api(`/violations?${params.toString()}`);
      console.debug('[violations] fetcher response', { page, items: Array.isArray(res) ? res.length : (Array.isArray(res?.data) ? res.data.length : null), payload: res });
      try { const dbg = document.getElementById('sdms-pagination-debug'); if (dbg) dbg.textContent = `violations: fetched page=${page}, items=${Array.isArray(res) ? res.length : (Array.isArray(res?.data) ? res.data.length : 0)}`; } catch (e) {}
      return res;
    },
    // onData now receives the normalized array and controller state from
    // createPaginationController.fetchData -> onData(normalized.data, state)
    onData(dataPayload, controllerState) {
      console.debug('[violations] onData', { currentPage: controllerState?.currentPage, totalItems: controllerState?.totalItems, totalPages: controllerState?.totalPages, dataLength: Array.isArray(dataPayload) ? dataPayload.length : 0 });
      try { const dbg = document.getElementById('sdms-pagination-debug'); if (dbg) dbg.textContent = `violations: onData page=${controllerState?.currentPage} items=${Array.isArray(dataPayload) ? dataPayload.length : 0}`; } catch (e) {}
      const data = Array.isArray(dataPayload) ? dataPayload : [];
      violations = data;
      renderTable(violations);

      // Prefer controller-provided totals/state when available
      const total = controllerState?.totalItems ?? controllerState?.total ?? null;
      const currentPage = Number(controllerState?.currentPage ?? 1);
      const totalPages = Number(controllerState?.totalPages ?? 1);

      // Update pagination UI/summary. The controller will also render the
      // pagination buttons, but we update the summary here to reflect
      // the controller's computed values.
      try { paginator?.renderPagination?.(totalPages, currentPage); } catch (e) { /* ignore */ }
      if (paginationSummary) {
        const shown = Array.isArray(data) ? data.length : 0;
        const start = shown ? ((currentPage - 1) * PAGE_LIMIT + 1) : 0;
        const end = shown ? (start + shown - 1) : 0;
        paginationSummary.textContent = total != null ? `Showing ${start}-${end} of ${total}` : `Showing ${start}-${end}`;
      }
    },

    onError(err) {
  console.error('[violations] failed to load', err);
  alert(`Failed to load violations. ${err?.message || ''}`.trim());
  violations = [];
  renderTable(violations);
}

  });

  async function fetchData(page = 1) {
    if (paginator) {
      return paginator.fetchData(page);
    }
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    const payload = await api(`/violations?${params.toString()}`);
    const data = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    violations = Array.isArray(data) ? data : [];
    renderTable(violations);
    if (paginationSummary) {
      const count = violations.length;
      paginationSummary.textContent = count ? `Showing 1-${count} of ${count}` : 'Showing 0 of 0';
    }
    if (paginationControls) {
      if (violations.length <= PAGE_LIMIT) {
        paginationControls.classList.add('is-hidden');
      } else {
        paginationControls.classList.remove('is-hidden');
      }
    }
    return violations;
  }

  async function refreshCurrentPage(preferredPage) {
    if (!paginator) {
      return fetchData(Math.max(1, preferredPage ?? 1));
    }
    const state = paginator.getState?.() || { currentPage: 1 };
    const targetPage = Math.max(1, preferredPage ?? state.currentPage ?? 1);
    let data = await fetchData(targetPage);
    const nextState = paginator.getState?.() || state;
    if (!data.length && nextState.currentPage > 1) {
      data = await fetchData(nextState.currentPage - 1);
    }
    return data;
  }

  function renderPagination(totalPages, currentPage) {
    paginator?.renderPagination(totalPages, currentPage);
  }

  async function loadStudents() {
    try {
      const params = new URLSearchParams({ page: '1', limit: '1000' });
      const payload = await api(`/students?${params.toString()}`);
      const data = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      students = data;
    } catch (err) {
      console.warn('[violations] failed to load students list', err);
      students = [];
    }
  }

  function findStudentByLRN(lrn) {
    if (!lrn) return null;
    const target = lrn.replace(/\s+/g, '').toLowerCase();
    return students.find(s => String(s.lrn || '').replace(/\s+/g, '').toLowerCase() === target) || null;
  }

  function displayPastOffensesFor(studentId, excludeId) {
    if (!studentId) {
      updatePastOffenseDisplay([]);
      return;
    }
    const items = violations.filter(v => v.student_id === studentId && v.id !== excludeId);
    updatePastOffenseDisplay(items);
  }

  function prepareCreateModal() {
    violationForm?.reset();
    violationForm.dataset.studentId = '';
    editIndexField.value = '';
    studentLRNField.value = '';
    studentNameField.value = '';
    gradeSectionField.value = '';
    incidentDateField.value = '';
    violationTypeField.value = '';
    sanctionField.value = '';
    remarksField.value = '';
    modalTitle.textContent = 'Add Violation';
    resetEvidence();
    displayPastOffensesFor(null);
    openModal(violationModal);
  }

  function prepareEditModal(index) {
    const item = violations[index];
    if (!item) return;
    modalTitle.textContent = 'Edit Violation';
    editIndexField.value = index;
    violationForm.dataset.studentId = item.student_id ? String(item.student_id) : '';

    const matchingStudent = students.find(s => s.id === item.student_id);
    if (matchingStudent) {
      studentLRNField.value = matchingStudent.lrn || '';
      studentNameField.value = [matchingStudent.first_name, matchingStudent.middle_name, matchingStudent.last_name].filter(Boolean).join(' ');
      gradeSectionField.value = item.grade_section || `${matchingStudent.grade ?? ''}-${matchingStudent.section ?? ''}`.replace(/^-/, '') || '';
    } else {
      studentLRNField.value = '';
      studentNameField.value = item.student_name || '';
      gradeSectionField.value = item.grade_section || '';
    }

    incidentDateField.value = item.incident_date ? String(item.incident_date).slice(0, 10) : '';
    violationTypeField.value = item.offense_type || '';
    sanctionField.value = item.sanction || '';
    remarksField.value = item.remarks || '';

    const files = Array.isArray(item.evidence?.files) ? item.evidence.files : [];
    evidenceState = files.slice(0, 3);
    renderEvidencePreview(evidencePreview, evidenceState, { selectable: true });

    displayPastOffensesFor(item.student_id, item.id);
    openModal(violationModal);
  }

  function showViewModal(index) {
    const item = violations[index];
      if (!item) return;

      // === Current Offense Details ===
      viewStudent.textContent = item.student_name || '—';
      viewGradeSection.textContent = item.grade_section || '—';
      viewIncidentDate.textContent = formatDate(item.incident_date) || '—';
      viewAddedDate.textContent = formatDate(item.created_at) || '—';
      viewViolationType.textContent =  item.description || '—';
      viewSanction.textContent = item.sanction || '—';
      //remarksField.textContent = item.remarks || '-';
      viewRemarks.textContext = item.remarks || '-';
      const viewRemarks2 = document.getElementById('viewRemarks');
      viewRemarks2.value = item.remarks || '-';
      viewRemarks2.textContent = item.remarks || '-';

      // === All Offense Cards ===
      const allWrap = document.getElementById('viewAllOffensesWrap');
      const allContainer = document.getElementById('viewAllOffenses');
      allContainer.innerHTML = '';

      const allOffenses = violations
        .filter(v => v.student_id === item.student_id)
        .sort((a, b) => new Date(a.incident_date) - new Date(b.incident_date));

      if (allOffenses.length) {
        allWrap.classList.remove('is-hidden');

        // ensure one-time badge styles exist
        if (!document.getElementById('sdms-status-badge-style')) {
          const style = document.createElement('style');
          style.id = 'sdms-status-badge-style';
          style.textContent = `
            .status-badge { display:inline-block; padding:2px 8px; border-radius:9999px; font-size:12px; font-weight:600; }
            .status-pending  { background:#FEF3C7; color:#92400E; }   /* amber */
            .status-approved { background:#DCFCE7; color:#166534; }   /* green */
            .status-rejected { background:#FEE2E2; color:#991B1B; }   /* red */
          `;
          document.head.appendChild(style);
        }

        allOffenses.forEach((off, i) => {
          const card = document.createElement('div');
          card.className = 'offense-card';

          // derive normalized status + badge class; default to 'pending'
          const rawStatus = (off.status || 'pending').toString().trim().toLowerCase();
          const statusNorm = ['approved', 'rejected', 'pending'].includes(rawStatus) ? rawStatus : 'pending';
          const badgeClass = `status-badge status-${statusNorm}`;
          const statusLabel = statusNorm.charAt(0).toUpperCase() + statusNorm.slice(1);

          card.innerHTML = `
            <div class="offense-header">
              <strong>Case ${i + 1}</strong> — ${formatDate(off.incident_date)}
            </div>
            <div class="offense-body">
              <div><strong>Violation Type:</strong> ${off.description || '—'}</div>
              <div><strong>Sanction:</strong> ${off.sanction || '—'}</div>
              <div><strong>Recorded On:</strong> ${formatDate(off.created_at) || '—'}</div>
              <div><strong>Status:</strong> <span class="${badgeClass}">${statusLabel}</span></div>
              <div><strong>Remarks:</strong> ${off.remarks || '—'}</div>
            </div>
          `;
          allContainer.appendChild(card);
        });
    } else {
      viewPastOffenseRow.classList.add('is-hidden');
      viewPastOffense.textContent = '';
    }

    const files = Array.isArray(item.evidence?.files) ? item.evidence.files : [];
    if (files.length) {
      viewEvidenceWrap.classList.remove('is-hidden');
      viewEvidence.innerHTML = '';
      files.forEach((src, idx) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Evidence ${idx + 1}`;
        img.addEventListener('click', () => {
          if (!imagePreviewModal || !imagePreviewFull) return;
          imagePreviewFull.src = src;
          openModal(imagePreviewModal);
        });
        viewEvidence.appendChild(img);
      });
    } else {
      viewEvidenceWrap.classList.add('is-hidden');
      viewEvidence.innerHTML = '';
    }

    openModal(viewModal);
  }

  async function persistViolation(event) {
    event.preventDefault();
    if (violationForm && !violationForm.reportValidity()) {
      return;
    }
    const studentIdRaw = violationForm.dataset.studentId || '';
    const studentId = studentIdRaw ? studentIdRaw : null;

    if (!studentId || Number.isNaN(studentId)) {
      alert('Please enter a valid student LRN to link this violation to an existing student.');
      return;
    }

    const payload = {
      student_id: studentId,
      grade_section: gradeSectionField?.value?.trim() || null,
      offense_type: violationTypeField?.value || null,
      description: descriptionField?.value?.trim() || null,
      sanction: sanctionField?.value || null,
      remarks: remarksField?.value?.trim() || null,
      incident_date: incidentDateField?.value || null,
      evidence: evidenceState.length ? { files: evidenceState.slice(0, 3) } : null
    };

    try {
      const editIndex = editIndexField?.value === '' ? null : Number(editIndexField.value);
      if (editIndex === null) {
        await api('/violations', { method: 'POST', body: payload });
      } else {
        const target = violations[editIndex];
        await api(`/violations/${encodeURIComponent(target.id)}`, { method: 'PUT', body: payload });
      }
      const state = paginator?.getState?.() || { currentPage: 1 };
      const targetPage = editIndex === null ? 1 : state.currentPage;
      await refreshCurrentPage(targetPage);
      closeModal(violationModal);
      violationForm.reset();
      violationForm.dataset.studentId = '';
      studentLRNField.value = '';
      studentNameField.value = '';
      gradeSectionField.value = '';
      resetEvidence();
      displayPastOffensesFor(null);
    } catch (err) {
      console.error('[violations] save failed', err);
      alert(err.message || 'Failed to save violation.');
    }
  }

  async function removeViolation(index) {
    const item = violations[index];
    if (!item) return;
    if (!confirm('Delete this violation record?')) return;
    try {
      await api(`/violations/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const state = paginator?.getState?.() || { currentPage: 1 };
      await refreshCurrentPage(state.currentPage);
    } catch (err) {
      console.error('[violations] delete failed', err);
      alert(err.message || 'Failed to delete violation.');
    }
  }

  async function handleResolve(index) {
  const item = violations[index];
  if (!item) return;

  // Determine next status (optional: cycle)
  const nextStatus = item.status === 'Pending' ? 'Resolved' :
                     item.status === 'Resolved' ? 'Appealed' : 'Pending';

  if (!confirm(`Change status to ${nextStatus}?`)) return;

  try {
    const res = await api(`/violations/${item.id}/status`, {
      method: 'PATCH',
      body: { status: nextStatus }
    });
    alert(res.message || `Status updated to ${nextStatus}`);
    await refreshCurrentPage(); // refresh list
  } catch (err) {
    console.error('[violations] resolve failed', err);
    alert(err.message || 'Failed to update status.');
  }
}


  // === Existing global search ===
  function filterTable() {
    const query = searchInput?.value?.toLowerCase() || '';
    document.querySelectorAll('#violationTable tbody tr').forEach(row => {
      if (row.dataset?.placeholder === 'empty') return;
      const text = row.innerText.toLowerCase();
      row.style.display = query ? (text.includes(query) ? '' : 'none') : '';
    });
  }

  // === Dropdown + Text filters + keep global search ===
  const filterStrand = document.getElementById('filterStrand');
  const filterViolationType = document.getElementById('filterViolationType');
  const filterText = document.getElementById('filterText');
  const applyFilterBtn = document.getElementById('applyFilterBtn');
  const printReportBtn = document.getElementById('printReportBtn');

  // --- Load school_violations.json and populate dropdowns ---
  async function loadSchoolViolations() {
    const candidatePaths = [
      'student/js/school_violations.json',
      'js/school_violations.json',
      'student/school_violations.json'
    ];

    let payload = null;
    for (const p of candidatePaths) {
      try {
        const res = await fetch(p, { cache: 'no-store' });
        if (!res.ok) continue;
        payload = await res.json();
        break;
      } catch (e) {
        // try next
      }
    }

    if (!payload || !payload.school_policy || !Array.isArray(payload.school_policy.categories)) {
      // nothing to populate
      return;
    }

    // collect descriptions (avoid duplicates)
    const set = new Set();
    payload.school_policy.categories.forEach(cat => {
      if (!Array.isArray(cat.items)) return;
      cat.items.forEach(it => {
        const text = (it.description || '').trim();
        if (text) set.add(text);
      });
    });

    // helper to add option if not present
    function addOptionsToSelect(selectEl) {
      if (!selectEl) return;
      // build existing values set to avoid duplicates
      const existing = new Set(Array.from(selectEl.options).map(o => (o.value || o.text).trim()));
      // append sorted
      Array.from(set).sort().forEach(val => {
        if (existing.has(val)) return;
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectEl.appendChild(opt);
      });
    }

    // populate both filter and modal select
    addOptionsToSelect(filterViolationType);
    addOptionsToSelect(remarksField);
  }


    function applyFilters() {
    const strand = (filterStrand?.value || '').toLowerCase();
    const violationType = (filterViolationType?.value || '').toLowerCase();
    const textQuery = (filterText?.value || '').toLowerCase();
    const globalQuery = (searchInput?.value || '').toLowerCase();

    // Decide which date window to use
    let fromDate = null, toDate = null;

    if (__rangeFrom || __rangeTo) {
      fromDate = __rangeFrom ? new Date(__rangeFrom) : null;
      toDate   = __rangeTo   ? new Date(__rangeTo)   : null;
    } else if (__selectedDate) {
      const r = computeRange(__selectedDate, __dateMode);
      fromDate = r.from ? new Date(r.from) : null;
      toDate   = r.to   ? new Date(r.to)   : null;
    }

    document.querySelectorAll('#violationTable tbody tr').forEach(row => {
      if (row.dataset?.placeholder === 'empty') return;

      const studentName = row.cells[0]?.textContent.toLowerCase() || '';
      const gradeSection = row.cells[1]?.textContent.toLowerCase() || '';
      const vType = row.cells[3]?.textContent.toLowerCase() || '';
      const description = row.cells[4]?.textContent.toLowerCase() || '';
      const rowText = row.innerText.toLowerCase();

      const matchStrand = !strand || gradeSection.includes(strand);
      const matchType = !violationType || vType.includes(violationType);
      const matchText = !textQuery || [studentName, gradeSection, vType, description].some(s => s.includes(textQuery));
      const matchGlobal = !globalQuery || rowText.includes(globalQuery);

      // date match
      let matchDate = true;
      if (fromDate || toDate) {
        const raw = row.dataset.incident || row.cells[2]?.textContent || '';
        const d = raw ? new Date(raw) : null;
        if (!d || isNaN(d)) {
          matchDate = false;
        } else {
          if (fromDate && d < fromDate) matchDate = false;
          if (toDate && d > toDate)     matchDate = false;
        }
      }

      row.style.display = (matchStrand && matchType && matchText && matchGlobal && matchDate) ? '' : 'none';
    });

    // Update "Showing X of Y"
    const rows = Array.from(document.querySelectorAll('#violationTable tbody tr'))
      .filter(r => r.dataset?.placeholder !== 'empty');
    const shown = rows.filter(r => r.style.display !== 'none').length;
    paginationSummary && (paginationSummary.textContent = `Showing ${shown} of ${rows.length}`);
  }


  // === Direct Print ===
  let __printStyleEl = null;
  let __printHeaderEl = null;

  function cleanupPrintArtifacts() {
    try { __printHeaderEl?.remove(); } catch {}
    try { __printStyleEl?.remove(); } catch {}
    __printHeaderEl = null;
    __printStyleEl = null;
  }

  function printFilteredReport() {
    const table = document.getElementById('violationTable');
    if (!table) return;

    cleanupPrintArtifacts(); // ensure clean slate

    const header = document.createElement('div');
    header.className = 'print-header';
    header.style.zIndex = '100000'; // be above everything only during print
    header.innerHTML = `
      <h2 style="text-align:center;margin-bottom:5px;">Violation Report</h2>
      <div style="text-align:right;font-size:12px;color:#555;margin-bottom:8px;">
        Generated on: ${new Date().toLocaleString()}<br>
        Filters:
        ${filterStrand?.value ? 'Strand: ' + filterStrand.value : 'All Strands'} |
        ${filterViolationType?.value ? 'Violation: ' + filterViolationType.value : 'All Violations'} |
        ${filterText?.value ? 'Search: ' + filterText.value : 'No text filter'}
      </div>
    `;

    table.parentNode.insertBefore(header, table);
    __printHeaderEl = header;

    const style = document.createElement('style');
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .print-header, #violationTable, #violationTable * { visibility: visible !important; }
        .print-header { position: absolute; top: 40px; left: 40px; right: 40px; }
        #violationTable { position: absolute; top: 130px; left: 40px; width: calc(100% - 80px); border-collapse: collapse; }
        #violationTable th, #violationTable td { border: 1px solid #ccc; padding: 8px; font-size: 13px; color: #000; }
        #violationTable th { background: #f2f2f2 !important; font-weight: 600; text-transform: uppercase; }
        #violationTable th:last-child, #violationTable td:last-child { display: none !important; }
        #violationTable td:nth-child(5) { white-space: normal !important; }
        @page { margin: 20mm; }
      }
    `;
    document.head.appendChild(style);
    __printStyleEl = style;

    // more robust cleanup
    const after = () => cleanupPrintArtifacts();
    window.addEventListener('focus', after, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') cleanupPrintArtifacts();
    }, { once: true });

    window.print();
    // Safari sometimes misses onafterprint; keep a fallback
    setTimeout(cleanupPrintArtifacts, 1000);
    window.onafterprint = cleanupPrintArtifacts;
  }

  // === NEW: Download (CSV) of the currently filtered/visible rows ===
  function downloadFilteredReport() {
    const table = document.getElementById('violationTable');
    if (!table) return;

    const strand = (filterStrand?.value || 'All Strands');
    const vtype  = (filterViolationType?.value || 'All Violations');
    const txt    = (filterText?.value || 'No text filter');

    // headers (exclude the last "Actions" column)
    const ths = Array.from(table.querySelectorAll('thead th'));
    const headers = ths.slice(0, ths.length - 1).map(th => th.textContent.trim());

    // visible rows only (respect filters + CSS display)
    const bodyRows = Array.from(table.tBodies?.[0]?.rows || []).filter(r => {
      if (r.dataset?.placeholder === 'empty') return false;
      const disp = (r.style.display || '').trim();
      const cssDisp = getComputedStyle(r).display;
      return disp !== 'none' && cssDisp !== 'none';
    });

    const rows = bodyRows.map(tr => {
      const cells = Array.from(tr.cells);
      const wanted = cells.slice(0, Math.max(0, cells.length - 1)); // drop Actions col
      return wanted.map(td => (td.textContent || '').trim());
    });

    // CSV helpers
    const esc = (s) => {
      const v = String(s ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    };

    // Metadata (Excel-friendly)
    const meta = [
      ['Student Violation Report'],
      ['Generated on', new Date().toLocaleString()],
      ['Filters', `Strand: ${strand} | Violation: ${vtype} | Search: ${txt}`],
      []
    ];

    const csvLines = []
      .concat(meta.map(arr => arr.map(esc).join(',')))
      .concat([headers.map(esc).join(',')])
      .concat(rows.map(r => r.map(esc).join(',')));

    const csv = '\uFEFF' + csvLines.join('\r\n'); // BOM for Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url;
    a.download = `Violation_Report_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // inject minimal runtime CSS to ensure modals are always on top
  function ensureModalZStack() {
    if (document.getElementById('sdms-modal-zfix')) return;
    const s = document.createElement('style');
    s.id = 'sdms-modal-zfix';
    s.textContent = `
      .modal { z-index: 99998 !important; }
      .modal-content { position: relative; z-index: 99999 !important; }
      .modal .close-btn { position: absolute; top: 10px; right: 12px; z-index: 100000 !important; cursor: pointer; }
      .print-header { pointer-events: none; } /* prevent blocking clicks if left behind */
    `;
    document.head.appendChild(s);
  }

  // --- Floating centered select picker (improves long lists in modals) ---
  let __floatingSelectEl = null;
  let __floatingBackdrop = null;

  function createFloatingSelectElements() {
    if (__floatingSelectEl && __floatingBackdrop) return;
    __floatingBackdrop = document.createElement('div');
    __floatingBackdrop.className = 'sdms-floating-select-backdrop';

    __floatingSelectEl = document.createElement('div');
    __floatingSelectEl.className = 'sdms-floating-select';
    __floatingSelectEl.setAttribute('role', 'dialog');
    __floatingSelectEl.setAttribute('aria-modal', 'true');

    const header = document.createElement('div');
    header.className = 'sdms-floating-select-header';
    header.textContent = 'Select an option';
    __floatingSelectEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'sdms-floating-select-list';
    __floatingSelectEl.appendChild(list);

    document.body.appendChild(__floatingBackdrop);
    document.body.appendChild(__floatingSelectEl);

    // inject styles once
    if (!document.getElementById('sdms-floating-select-styles')) {
      const st = document.createElement('style');
      st.id = 'sdms-floating-select-styles';
      st.textContent = `
        .sdms-floating-select-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index:100050; }
        .sdms-floating-select { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(880px, 92%); max-height: 72vh; overflow: hidden; background: #fff; border-radius:8px; box-shadow: 0 10px 30px rgba(2,6,23,0.2); z-index:100051; display:none; font-family:inherit; }
        .sdms-floating-select-header { padding: 12px 16px; border-bottom: 1px solid #eee; font-weight:600; }
        .sdms-floating-select-list { max-height: calc(72vh - 52px); overflow: auto; padding: 8px 12px; }
        .sdms-floating-select-item { padding:10px 12px; border-radius:6px; cursor:pointer; color:#111827; }
        .sdms-floating-select-item:hover { background:#f3f4f6; }
        .sdms-floating-select-item.current { background:#e6f4ea; }
        @media (max-width:420px){ .sdms-floating-select { width: 96%; } }
      `;
      document.head.appendChild(st);
    }

    __floatingBackdrop.addEventListener('click', hideFloatingSelect);
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') hideFloatingSelect();
    });
  }

  function showFloatingSelectFor(selectEl) {
    if (!selectEl) return;
    createFloatingSelectElements();
    const list = __floatingSelectEl.querySelector('.sdms-floating-select-list');
    list.innerHTML = '';
    const opts = Array.from(selectEl.options || []);
    // copy options
    opts.forEach(o => {
      const item = document.createElement('div');
      item.className = 'sdms-floating-select-item';
      item.tabIndex = 0;
      item.textContent = o.textContent || o.value || '';
      item.dataset.value = o.value;
      if (o.disabled) item.classList.add('disabled');
      if ((selectEl.value || '') === (o.value || '')) item.classList.add('current');
      item.addEventListener('click', () => {
        selectEl.value = item.dataset.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        hideFloatingSelect();
      });
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') item.click();
      });
      list.appendChild(item);
    });

    __floatingBackdrop.style.display = '';
    __floatingSelectEl.style.display = 'block';
    // focus first selectable
    setTimeout(() => {
      const first = list.querySelector('.sdms-floating-select-item:not(.disabled)');
      first && first.focus();
    }, 10);
  }

  function hideFloatingSelect() {
    if (__floatingSelectEl) __floatingSelectEl.style.display = 'none';
    if (__floatingBackdrop) __floatingBackdrop.style.display = 'none';
  }

  function bindEvents() {
    // initialize date filter wiring
    initDateFilter();
    initDateRangeFilter(); // NEW

    addBtn?.addEventListener('click', prepareCreateModal);
    document.querySelectorAll('#violationModal .close-btn').forEach(btn => btn.addEventListener('click', () => closeModal(violationModal)));
    document.querySelectorAll('#viewModal .close-btn').forEach(btn => btn.addEventListener('click', () => closeModal(viewModal)));
    imagePreviewClose?.addEventListener('click', () => closeModal(imagePreviewModal));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal(violationModal);
        closeModal(viewModal);
        closeModal(imagePreviewModal);
      }
    });

    violationForm?.addEventListener('submit', persistViolation);

    // existing global search
    searchInput?.addEventListener('keyup', applyFilters);

    // table action buttons (hardened)
    tableBody?.addEventListener('click', (event) => {
      // if any stray print header/style exists, remove before handling click
      cleanupPrintArtifacts();

      const button = event.target.closest('button[data-action]');
      if (!button) return;

      // make sure click isn't swallowed by any overlay
      event.stopPropagation();
      event.preventDefault();

      const action = button.dataset.action;
      const index = Number(button.dataset.index);
      if (Number.isNaN(index)) return;

      if (action === 'view') showViewModal(index);
      else if (action === 'edit') prepareEditModal(index);
      else if (action === 'delete') removeViolation(index);
      else if (action === 'resolve') handleResolve(index);
    });

    // LRN lookup
    studentLRNField?.addEventListener('blur', () => {
      const lrn = studentLRNField.value.trim();
      if (!lrn) {
        violationForm.dataset.studentId = '';
        studentNameField.value = '';
        displayPastOffensesFor(null);
        return;
      }
      const match = findStudentByLRN(lrn);
      if (match) {
        violationForm.dataset.studentId = String(match.id);
        studentNameField.value = [match.first_name, match.middle_name, match.last_name].filter(Boolean).join(' ');
        if (!gradeSectionField.value) {
          const composed = [match.grade, match.section].filter(Boolean).join('-');
          gradeSectionField.value = composed || gradeSectionField.value;
        }
        displayPastOffensesFor(match.id);
      } else {
        violationForm.dataset.studentId = '';
        displayPastOffensesFor(null);
        alert('No student found for that LRN. Please ensure the student exists in the system.');
      }
    });

    evidenceChoose?.addEventListener('click', () => evidenceInput?.click());
    evidenceChange?.addEventListener('click', () => evidenceInput?.click());
    evidenceClear?.addEventListener('click', resetEvidence);
    evidenceInput?.addEventListener('change', (e) => addEvidenceFiles(e.target.files));

    ['dragenter', 'dragover'].forEach(ev => evidenceDrop?.addEventListener(ev, (e) => {
      e.preventDefault();
      evidenceDrop.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => evidenceDrop?.addEventListener(ev, (e) => {
      e.preventDefault();
      evidenceDrop.classList.remove('dragover');
    }));
    evidenceDrop?.addEventListener('drop', (e) => addEvidenceFiles(e.dataTransfer?.files));

    // filter + print
    applyFilterBtn?.addEventListener('click', applyFilters);
  filterStrand?.addEventListener('change', applyFilters);
    filterViolationType?.addEventListener('change', applyFilters);
    // show centered floating picker for long lists (better display inside modals)
    [filterViolationType, violationTypeField].forEach(sel => {
      if (!sel) return;
      sel.addEventListener('mousedown', (ev) => {
        // prevent native opening and show our centered picker
        ev.preventDefault();
        showFloatingSelectFor(sel);
      });
      // keyboard users: open picker on Space/Enter
      sel.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          showFloatingSelectFor(sel);
        }
      });
    });
      filterText?.addEventListener('input', applyFilters); // <-- fixed typo here

    if (printReportBtn) {
      printReportBtn.textContent = 'Download Report';
      printReportBtn.title = 'Download the filtered rows as CSV';
      // avoid duplicate handlers when bindEvents runs more than once
      printReportBtn.removeEventListener?.('click', printFilteredReport);
      printReportBtn.removeEventListener?.('click', downloadFilteredReport);
      printReportBtn.addEventListener('click', downloadFilteredReport);
      }
    }
  
  async function init() {
    ensureModalZStack();
    bindEvents();

    window.addEventListener('load', bindEvents, { once: true });

    await Promise.all([loadStudents(), fetchData(1), loadSchoolViolations()]);
  }

  window.searchViolation = applyFilters;

  init();
})();