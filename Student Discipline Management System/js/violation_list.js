(() => {
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

  const addBtn = document.getElementById('addViolationBtn');
  const searchInput = document.getElementById('searchInput');
  const paginationSummary = document.getElementById('violationsPageSummary');
  const paginationControls = document.getElementById('violationsPagination');
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
  const descriptionField = document.getElementById('description');
  const violationTypeField = document.getElementById('violationType');
  const sanctionField = document.getElementById('sanction');

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
  const viewDescription = document.getElementById('viewDescription');
  const viewViolationType = document.getElementById('viewViolationType');
  const viewSanction = document.getElementById('viewSanction');
  const viewEvidenceWrap = document.getElementById('viewEvidenceWrap');
  const viewEvidence = document.getElementById('viewEvidence');

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
        <td>${v.offense_type || '—'}</td>
        <td>${v.description || '—'}</td>
        <td>${pastOffense}</td>
        <td>${totalViolations}</td> <!-- 🆕 Added new column -->
        <td>${v.sanction || '—'}</td>
        <td>${formatDate(v.created_at)}</td>
        <td>
          <button class="action-btn" data-action="view" data-index="${idx}" title="View"><i class="fa fa-eye"></i></button>
          <button class="action-btn edit-btn" data-action="edit" data-index="${idx}" title="Edit"><i class="fa fa-edit"></i></button>
          <button class="action-btn delete-btn" data-action="delete" data-index="${idx}" title="Delete"><i class="fa fa-trash"></i></button>
        </td>
      `;
      row.dataset.incident = v.incident_date ? String(v.incident_date) : '';
      tableBody.appendChild(row);
    });

    applyFilters(); 
  }


  // === Pagination / Backend ===
  paginator = window.SDMS?.createPaginationController({
    limit: PAGE_LIMIT,
    paginationContainer: paginationControls,
    summaryElement: paginationSummary,
    async fetcher(page, limit) {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      // include date range when selected
      if (__selectedDate) {
        const r = computeRange(__selectedDate, __dateMode);
        if (r.from) params.set('date_from', r.from);
        if (r.to) params.set('date_to', r.to);
      }
      return api(`/violations?${params.toString()}`);
    },
    onData(rows) {
      violations = Array.isArray(rows) ? rows : [];
      renderTable(violations);
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
    descriptionField.value = '';
    violationTypeField.value = '';
    sanctionField.value = '';
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
    descriptionField.value = item.description || '';
    violationTypeField.value = item.offense_type || '';
    sanctionField.value = item.sanction || '';

    const files = Array.isArray(item.evidence?.files) ? item.evidence.files : [];
    evidenceState = files.slice(0, 3);
    renderEvidencePreview(evidencePreview, evidenceState, { selectable: true });

    displayPastOffensesFor(item.student_id, item.id);
    openModal(violationModal);
  }

  function showViewModal(index) {
    const item = violations[index];
    if (!item) return;
    viewStudent.textContent = item.student_name || '—';
    viewGradeSection.textContent = item.grade_section || '—';
    viewIncidentDate.textContent = formatDate(item.incident_date) || '—';
    viewAddedDate.textContent = formatDate(item.created_at) || '—';
    viewDescription.textContent = item.description || '—';
    viewViolationType.textContent = item.offense_type || '—';
    viewSanction.textContent = item.sanction || '—';

    const history = violations.filter(v => v.student_id === item.student_id && v.id !== item.id);
    if (history.length) {
      viewPastOffenseRow.classList.remove('is-hidden');
      viewPastOffense.textContent = `${history.length} earlier case${history.length > 1 ? 's' : ''}`;
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

  function applyFilters() {
    const strand = (filterStrand?.value || '').toLowerCase();
    const violationType = (filterViolationType?.value || '').toLowerCase();
    const textQuery = (filterText?.value || '').toLowerCase();
    const globalQuery = (searchInput?.value || '').toLowerCase();

    // compute selected range for client-side filtering
    const range = __selectedDate ? computeRange(__selectedDate, __dateMode) : { from: null, to: null };
    const fromDate = range.from ? new Date(range.from) : null;
    const toDate = range.to ? new Date(range.to) : null;

    document.querySelectorAll('#violationTable tbody tr').forEach(row => {
      if (row.dataset?.placeholder === 'empty') return;

      // 0: Name, 1: Grade&Section, 2: IncidentDate, 3: ViolationType,
      // 4: Description, 5: PastOffense, 6: Sanction, 7: DateAdded, 8: Actions
      const studentName = row.cells[0]?.textContent.toLowerCase() || '';
      const gradeSection = row.cells[1]?.textContent.toLowerCase() || '';
      const vType = row.cells[3]?.textContent.toLowerCase() || '';
      const description = row.cells[4]?.textContent.toLowerCase() || '';
      const rowText = row.innerText.toLowerCase();

      const matchStrand = !strand || gradeSection.includes(strand);
      const matchType = !violationType || vType.includes(violationType);
      const matchText = !textQuery || [studentName, gradeSection, vType, description].some(s => s.includes(textQuery));
      const matchGlobal = !globalQuery || rowText.includes(globalQuery);

      // date match (if range present)
      let matchDate = true;
      if (fromDate && toDate) {
        const raw = row.dataset.incident || row.cells[2]?.textContent || '';
        const rowDt = raw ? new Date(raw) : null;
        if (!rowDt || Number.isNaN(rowDt.getTime())) {
          matchDate = false;
        } else {
          matchDate = (rowDt >= fromDate && rowDt <= toDate);
        }
      }

      row.style.display = (matchStrand && matchType && matchText && matchGlobal && matchDate) ? '' : 'none';
    });
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

  function bindEvents() {
    // initialize date filter wiring
    initDateFilter();

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
    filterText?.addEventListener('input', applyFilters);
    printReportBtn?.addEventListener('click', printFilteredReport);
  }

  async function init() {
    ensureModalZStack();
    bindEvents();

    // also bind once page is fully loaded (covers dynamic DOM changes)
    window.addEventListener('load', bindEvents, { once: true });

    await Promise.all([loadStudents(), fetchData(1)]);
  }

  window.searchViolation = applyFilters;

  init();
})();