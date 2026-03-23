(() => {
  const rawApiBase = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || window.SDMS_API_BASE || window.API_BASE || '';
  const API_BASE = window.SDMSUrlSanitize?.stripWebsiteContentWrappers
    ? window.SDMSUrlSanitize.stripWebsiteContentWrappers(rawApiBase)
    : rawApiBase;
  const API_ROOT = `${API_BASE.replace(/\/+$/, '')}/api`;

  let students = [];
  let allStudents = [];

  const studentTable = document.querySelector('#studentTable tbody');
  const addStudentBtn = document.getElementById('addStudentBtn');
  const studentModal = document.getElementById('studentModal');
  const viewModal = document.getElementById('viewModal');
  const closeBtns = document.querySelectorAll('.close-btn');
  const studentForm = document.getElementById('studentForm');

  const paginationSummary = document.getElementById('studentsPageSummary');
  const paginationControls = document.getElementById('studentsPagination');
  const PAGE_LIMIT = 100;

  let paginator = null;

  const modalTitle = document.getElementById('modalTitle');
  const editIndex = document.getElementById('editIndex');

  const viewLRN = document.getElementById('viewLRN');
  const viewName = document.getElementById('viewName');
  const viewBirthdate = document.getElementById('viewBirthdate');
  const viewGrade = document.getElementById('viewGrade');
  const viewSection = document.getElementById('viewSection');
  const viewStrand = document.getElementById('viewStrand');
  const viewParent = document.getElementById('viewParent');
  const viewAvatar = document.getElementById('viewAvatar');
  const viewInitials = document.getElementById('viewInitials');

  const birthdateInput = document.getElementById('birthdate');
  const strandInput = document.getElementById('strand');

  /* =================== Photo storage (front-end) =================== */
  const StudentPhotos = {
    key(lrn) { return `studentPhoto:${String(lrn).trim()}`; },
    get(lrn) { try { return localStorage.getItem(this.key(lrn)); } catch { return null; } },
    save(lrn, dataUrl) { try { localStorage.setItem(this.key(lrn), dataUrl); } catch {} },
    remove(lrn) { try { localStorage.removeItem(this.key(lrn)); } catch {} },
    move(oldLRN, newLRN) {
      if (!oldLRN || !newLRN || oldLRN === newLRN) return;
      const data = this.get(oldLRN);
      if (data) { this.save(newLRN, data); this.remove(oldLRN); }
    }
  };

  async function fileToDataURL(file, maxEdge = 512, quality = 0.85) {
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

  /* =================== Uploader UI =================== */
  const photoInput = document.getElementById('photoInput');
  const photoPreview = document.getElementById('photoPreview');
  const photoDrop = document.getElementById('photoDrop');
  const photoChoose = document.getElementById('photoChoose');
  const photoActions = document.getElementById('photoActions');
  const photoChange = document.getElementById('photoChange');
  const photoRemove = document.getElementById('photoRemove');

  function resetUploader() {
    if (!photoPreview) return;
    photoPreview.removeAttribute('src');
    delete photoPreview.dataset.dataurl;
    photoPreview.classList.add('is-hidden');
    photoActions.classList.add('is-hidden');
    photoDrop.classList.remove('is-hidden');
  }

  async function setPreviewFromFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      alert('Please choose a JPG or PNG image.');
      return;
    }
    const dataUrl = await fileToDataURL(file, 512, 0.85);
    photoPreview.src = dataUrl;
    photoPreview.dataset.dataurl = dataUrl;
    photoPreview.classList.remove('is-hidden');
    photoActions.classList.remove('is-hidden');
    photoDrop.classList.add('is-hidden');
  }

  photoChoose?.addEventListener('click', () => photoInput?.click());
  photoChange?.addEventListener('click', () => photoInput?.click());
  photoRemove?.addEventListener('click', resetUploader);
  photoInput?.addEventListener('change', async (e) => setPreviewFromFile(e.target.files?.[0]));

  ['dragenter', 'dragover'].forEach(ev => photoDrop?.addEventListener(ev, (e)=>{ e.preventDefault(); photoDrop.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => photoDrop?.addEventListener(ev, (e)=>{ e.preventDefault(); photoDrop.classList.remove('dragover'); }));
  photoDrop?.addEventListener('drop', async (e) => setPreviewFromFile(e.dataTransfer.files?.[0]));

  /* =================== API Helpers =================== */
  function authHeaders(){
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const init = { method, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...headers } };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Primary attempt: use configured API_ROOT (relative or absolute).
    try {
      const res = await fetch(`${API_ROOT}${path}`, init);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      if (res.status === 204) return null;
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();
    } catch (err) {
      // In production we should not auto-switch to localhost. Local fallback is only a dev convenience.
      const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (!isLocalHost) throw err;

      try {
        const fallbackHost = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || window.SDMS_API_BASE || API_BASE || 'http://localhost:3000';
        const fallbackRoot = `${fallbackHost.replace(/\/+$/, '')}/api`;
        const res2 = await fetch(`${fallbackRoot}${path}`, init);
        if (!res2.ok) {
          const text = await res2.text();
          throw new Error(text || `Fallback request failed (${res2.status})`);
        }
        if (res2.status === 204) return null;
        const ct2 = res2.headers.get('content-type') || '';
        return ct2.includes('application/json') ? res2.json() : res2.text();
      } catch (err2) {
        // Surface the original error for debugging
        throw err;
      }
    }
  }

  const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
  function computeAge(dateStr){
    if (!dateStr) return '';
    const dob = new Date(dateStr);
    if (Number.isNaN(dob.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age >= 0 ? age : '';
  }

  function formatDate(dateStr){
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return DATE_FMT.format(d);
  }

  function splitFullName(fullName) {
    const value = (fullName || '').toString().trim().replace(/\s+/g, ' ');
    if (!value) return { firstName: '', middleName: '', lastName: '' };
    const parts = value.split(' ');
    if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
    if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
    return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
  }

  function composeFullName(firstName, middleName, lastName) {
    return [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeStudent(row){
    const fullName = (row.full_name || '').toString().trim();
    const split = splitFullName(fullName);
    return {
      id: row.id,
      lrn: row.lrn || '',
      fullName,
      firstName: row.first_name || split.firstName,
      middleName: row.middle_name || split.middleName,
      lastName: row.last_name || split.lastName,
      age: (() => {
        if (row.age == null) return null;
        const parsed = Number(row.age);
        return Number.isNaN(parsed) ? null : parsed;
      })(),
      birthdate: row.birthdate || null,
      grade: row.grade || '',
      section: row.section || '',
      strand: row.strand || '',
      parentContact: row.parent_contact || '',
      createdAt: row.created_at || row.added_date || ''
    };
  }

  function initialsFromName(name) {
    return name.split(/\s+/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase() || '?';
  }

  function renderTable(list = students){
    if (!studentTable) return;
    const source = Array.isArray(list) ? list : [];
    students = source;
    studentTable.innerHTML = '';
    if (!source.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="8" style="text-align:center;color:#6b7280;">No records found.</td>';
      studentTable.appendChild(row);
      return;
    }

    source.forEach((s, i) => {
      const row = document.createElement('tr');

      // LRN cell
      const lrnCell = document.createElement('td');
      lrnCell.textContent = s.lrn || '';
      row.appendChild(lrnCell);

      // Name cell with avatar
      const nameCell = document.createElement('td');
      const nameWrap = document.createElement('div');
      nameWrap.className = 'name-cell';
      const fullName = s.fullName || composeFullName(s.firstName, s.middleName, s.lastName);
      const photo = StudentPhotos.get(s.lrn);
      if (photo) {
        const img = document.createElement('img');
        img.className = 'avatar';
        img.src = photo;
        img.alt = fullName;
        nameWrap.appendChild(img);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'avatar avatar--fallback';
        fallback.textContent = initialsFromName(fullName);
        nameWrap.appendChild(fallback);
      }
      const nameSpan = document.createElement('span');
      nameSpan.className = 'student-name';
      nameSpan.textContent = fullName;
      nameWrap.appendChild(nameSpan);
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      // Birthdate
      const birthdateCell = document.createElement('td');
      birthdateCell.textContent = s.birthdate ? formatDate(s.birthdate) : '—';
      row.appendChild(birthdateCell);

      // Grade
      const gradeCell = document.createElement('td');
      gradeCell.textContent = s.grade || '';
      row.appendChild(gradeCell);

      // Section
      const sectionCell = document.createElement('td');
      sectionCell.textContent = s.section || '';
      row.appendChild(sectionCell);

      // Strand
      const strandCell = document.createElement('td');
      strandCell.textContent = s.strand || '';
      row.appendChild(strandCell);

      // Added Date
      const dateCell = document.createElement('td');
      dateCell.textContent = formatDate(s.createdAt) || '';
      row.appendChild(dateCell);

      // Actions cell
      const actionsCell = document.createElement('td');
      actionsCell.className = 'actions-cell';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'action-btn';
      viewBtn.title = 'View';
      viewBtn.innerHTML = '<i class="fa fa-eye"></i>';
      viewBtn.addEventListener('click', () => openView(i));
      actionsCell.appendChild(viewBtn);

      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn edit-btn';
      editBtn.title = 'Edit';
      editBtn.innerHTML = '<i class="fa fa-edit"></i>';
      editBtn.addEventListener('click', () => openEdit(i));
      actionsCell.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn delete-btn';
      delBtn.title = 'Delete';
      delBtn.innerHTML = '<i class="fa fa-trash"></i>';
      delBtn.addEventListener('click', () => removeStudent(i));
      actionsCell.appendChild(delBtn);

      row.appendChild(actionsCell);

      studentTable.appendChild(row);
    });
  }

  paginator = window.SDMS?.createPaginationController({
    limit: PAGE_LIMIT,
    paginationContainer: paginationControls,
    summaryElement: paginationSummary,
    async fetcher(page, limit) {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      return api(`/students?${params.toString()}`);
    },
    onData(rows) {
      students = Array.isArray(rows) ? rows.map(normalizeStudent) : [];
      allStudents = students.slice();
      renderTable(students);
    },
    onError(err) {
      console.error('[students] failed to load', err);
      const detail = err?.message ? `\n\nDetails: ${err.message}` : '';
      alert(`Failed to load students. Please refresh or try again.${detail}`);
      students = [];
      allStudents = [];
      renderTable(students);
    }
  });

  async function fetchData(page = 1) {
    if (paginator) {
      return paginator.fetchData(page);
    }
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    const payload = await api(`/students?${params.toString()}`);
    const data = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    students = Array.isArray(data) ? data.map(normalizeStudent) : [];
    allStudents = students.slice();
    renderTable(students);
    if (paginationSummary) {
      const count = students.length;
      paginationSummary.textContent = count ? `Showing 1-${count} of ${count}` : 'Showing 0 of 0';
    }
    if (paginationControls) {
      if (students.length <= PAGE_LIMIT) {
        paginationControls.classList.add('is-hidden');
      } else {
        paginationControls.classList.remove('is-hidden');
      }
    }
    return students;
  }

  async function refreshCurrentPage(preferredPage){
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

  function renderPagination(totalPages, currentPage){
    paginator?.renderPagination(totalPages, currentPage);
  }

  function closeModals(){
    studentModal && (studentModal.style.display = 'none');
    viewModal && (viewModal.style.display = 'none');
  }

  function openCreateModal(){
    studentForm?.reset();
    if (birthdateInput) birthdateInput.value = '';
    editIndex.value = '';
    modalTitle.textContent = 'Add Student';
    resetUploader();
    studentModal.style.display = 'flex';
  }

  function openView(index){
    const s = students[index];
    const fullName = s.fullName || composeFullName(s.firstName, s.middleName, s.lastName);

    viewLRN.textContent = s.lrn;
    viewName.textContent = fullName;
    if (viewBirthdate) {
      viewBirthdate.textContent = s.birthdate ? formatDate(s.birthdate) : '—';
    }
    viewGrade.textContent = s.grade || '—';
    viewSection.textContent = s.section || '—';
    if (viewStrand) {
      viewStrand.textContent = s.strand || '—';
    }
    viewParent.textContent = s.parentContact || '—';

    const photo = StudentPhotos.get(s.lrn);
    if (photo) {
      viewAvatar.src = photo;
      viewAvatar.classList.remove('is-hidden');
      viewInitials.classList.add('is-hidden');
    } else {
      viewAvatar.classList.add('is-hidden');
      viewInitials.textContent = initialsFromName(fullName);
      viewInitials.classList.remove('is-hidden');
    }

    viewModal.style.display = 'flex';
  }

  function openEdit(index){
    const s = students[index];
    document.getElementById('lrn').value = s.lrn;
    document.getElementById('firstName').value = s.firstName;
    document.getElementById('middleName').value = s.middleName;
    document.getElementById('lastName').value = s.lastName;
    document.getElementById('grade').value = s.grade;
    document.getElementById('section').value = s.section;
    if (strandInput) strandInput.value = s.strand || '';
    document.getElementById('parentContact').value = s.parentContact;
    if (birthdateInput) {
      birthdateInput.value = s.birthdate ? String(s.birthdate).slice(0, 10) : '';
    }
    editIndex.value = index;
    modalTitle.textContent = 'Edit Student';

    const photo = StudentPhotos.get(s.lrn);
    if (photo) {
      photoPreview.src = photo;
      photoPreview.dataset.dataurl = photo;
      photoPreview.classList.remove('is-hidden');
      photoActions.classList.remove('is-hidden');
      photoDrop.classList.add('is-hidden');
    } else {
      resetUploader();
    }

    studentModal.style.display = 'flex';
  }

  async function persistStudent(event){
    event.preventDefault();

    if (studentForm && !studentForm.reportValidity()) {
      return;
    }

    const lrnField = document.getElementById('lrn');
    const firstNameField = document.getElementById('firstName');
    const middleNameField = document.getElementById('middleName');
    const lastNameField = document.getElementById('lastName');
    const gradeField = document.getElementById('grade');
    const sectionField = document.getElementById('section');
    const parentContactField = document.getElementById('parentContact');

    const missingControls = [
      ['lrn', lrnField],
      ['firstName', firstNameField],
      ['lastName', lastNameField],
      ['grade', gradeField],
      ['section', sectionField],
      ['parentContact', parentContactField]
    ].filter(([, el]) => !el);
    if (missingControls.length) {
      console.warn('[students] Missing form controls:', missingControls.map(([id]) => `#${id}`).join(', '));
    }

    const idx = editIndex.value === '' ? null : Number(editIndex.value);
    const existing = idx !== null ? students[idx] : null;
    const firstName = firstNameField?.value?.trim() || '';
    const middleName = middleNameField?.value?.trim() || null;
    const lastName = lastNameField?.value?.trim() || '';
    const normalizedBirthdate = birthdateInput?.value?.trim() || null;
    const normalizedAge = normalizedBirthdate ? computeAge(normalizedBirthdate) : null;
    const payload = {
      lrn: lrnField?.value?.trim() || null,
      full_name: composeFullName(firstName, middleName, lastName),
      // Keep legacy keys for backward compatibility with older backend deployments.
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      age: normalizedAge,
      birthdate: normalizedBirthdate || (existing?.birthdate || null),
      grade: gradeField?.value || null,
      section: sectionField?.value?.trim() || null,
      strand: strandInput?.value || null,
      parent_contact: parentContactField?.value?.trim() || null
    };

    try {
      let saved;
      if (idx === null) {
        saved = await api('/students', { method: 'POST', body: payload });
      } else {
        saved = await api(`/students/${encodeURIComponent(existing.id)}`, { method: 'PUT', body: payload });
      }

      const normalized = normalizeStudent(saved);
      const uploadedDataUrl = photoPreview?.dataset?.dataurl;
      if (idx !== null && existing?.lrn && existing.lrn !== normalized.lrn) {
        StudentPhotos.move(existing.lrn, normalized.lrn);
      }
      if (uploadedDataUrl) {
        StudentPhotos.save(normalized.lrn, uploadedDataUrl);
      }

      const state = paginator?.getState?.() || { currentPage: 1 };
      const targetPage = idx === null ? 1 : state.currentPage;
      await refreshCurrentPage(targetPage);
      studentModal.style.display = 'none';
      resetUploader();
      if (birthdateInput) birthdateInput.value = '';
    } catch (err) {
      console.error('[students] save failed', err);
      alert(err.message || 'Failed to save student.');
    }
  }

  async function removeStudent(index){
    const target = students[index];
    if (!target) return;
    if (!confirm('Delete this student?')) return;
    try {
      await api(`/students/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
      StudentPhotos.remove(target.lrn);
      const state = paginator?.getState?.() || { currentPage: 1 };
      await refreshCurrentPage(state.currentPage);
    } catch (err) {
      console.error('[students] delete failed', err);
      alert(err.message || 'Failed to delete student.');
    }
  }

  async function searchStudent(){
    const raw = document.getElementById('searchInput')?.value || '';
    const input = raw.toString().trim();
    if (!input) {
      renderTable(allStudents);
      return;
    }

    // Heuristic: treat as LRN when input contains digits and has no whitespace
    const looksLikeLRN = /\d/.test(input) && !/\s/.test(input);
    if (looksLikeLRN) {
      try {
        const data = await api(`/students?lrn=${encodeURIComponent(input)}`);
        const rows = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        renderTable(rows.map(normalizeStudent));
        return;
      } catch (err) {
        console.error('[students] LRN search failed', err);
      }
    }

    // Default: client-side text filter on the latest full page dataset
    const q = input.toLowerCase();
    const filtered = allStudents.filter((student) => {
      const rowText = [
        student.lrn,
        student.fullName || composeFullName(student.firstName, student.middleName, student.lastName),
        student.grade,
        student.section,
        student.strand,
        student.parentContact
      ].join(' ').toLowerCase();
      return rowText.includes(q);
    });
    renderTable(filtered);
  }

  (function(){
    function normalize(v){
      return (v || '').toString().trim();
    }

    function getGradeFromRow(row){
      if (row.dataset && row.dataset.grade) return normalize(row.dataset.grade);
      try {
        var cell = row.cells && row.cells[3];
        if (cell) return normalize(cell.textContent || cell.innerText);
      } catch(e){}
      return '';
    }

    function getStrandFromRow(row){
      if (row.dataset && row.dataset.strand) return normalize(row.dataset.strand);
      try {
        var cell = row.cells && row.cells[5];
        if (cell) return normalize(cell.textContent || cell.innerText);
      } catch(e){}
      return '';
    }

    function updateStudentsSummary(visibleCount){
      var summaryEl = document.getElementById('studentsPageSummary');
      var table = document.getElementById('studentTable');
      var total = 0;
      if (table) {
        // derive total from non-placeholder rows
        var tbody = table.tBodies[0];
        if (tbody) {
          total = Array.from(tbody.rows).filter(function(r){
            return !(r.cells.length === 1 && r.cells[0].hasAttribute('colspan'));
          }).length;
        }
      }
      if (summaryEl) summaryEl.textContent = 'Showing ' + visibleCount + ' of ' + total;
    }

    function applyDropdownFilters(){
      var selStrand = normalize(document.getElementById('filterStrand') && document.getElementById('filterStrand').value);
      var selGrade  = normalize(document.getElementById('filterGrade') && document.getElementById('filterGrade').value);

      var table = document.getElementById('studentTable');
      if (!table) return;
      var tbody = table.tBodies[0];
      if (!tbody) return;

      var rows = Array.from(tbody.rows);
      var visibleCount = 0;
      var placeholder = null;

      rows.forEach(function(row){
        if (row.cells.length === 1 && row.cells[0].hasAttribute('colspan')) {
          placeholder = row;
          row.style.display = 'none';
          return;
        }

        var rowGrade = getGradeFromRow(row);
        var rowStrand = getStrandFromRow(row);

        var matchesGrade = true;
        var matchesStrand = true;

        if (selGrade) {
          matchesGrade = (rowGrade === selGrade || rowGrade === ('grade ' + selGrade));
        }
        if (selStrand) {
          matchesStrand = (rowStrand === selStrand);
        }

        var keep = matchesGrade && matchesStrand;
        row.style.display = keep ? '' : 'none';
        if (keep) visibleCount++;
      });

      if (visibleCount === 0 && placeholder) {
        placeholder.style.display = '';
      }

      updateStudentsSummary(visibleCount);
    }

    document.addEventListener('DOMContentLoaded', function(){
      var filterSection = document.getElementById('filterStrand');
      var filterGrade  = document.getElementById('filterGrade');

      if (filterSection) filterSection.addEventListener('change', applyDropdownFilters);
      if (filterGrade)  filterGrade.addEventListener('change', applyDropdownFilters);

      // ensure summary reflects initial state
      // compute initial visible rows count
      (function initSummary(){
        var table = document.getElementById('studentTable');
        if (!table) return;
        var tbody = table.tBodies[0];
        if (!tbody) return;
        var rows = Array.from(tbody.rows).filter(function(r){
          return !(r.cells.length === 1 && r.cells[0].hasAttribute('colspan'));
        });
        updateStudentsSummary(rows.length);
      })();
    });
  })();

  addStudentBtn?.addEventListener('click', openCreateModal);
  closeBtns.forEach(btn => btn.addEventListener('click', closeModals));
  studentForm?.addEventListener('submit', persistStudent);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
  });

  fetchData(1);

  // Listen for cross-tab notifications that a new student account was created.
  // We use localStorage 'sdms:student_created' as a fallback and BroadcastChannel when available.
  // storage event for older / fallback method
  try {
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (e.key === 'sdms:student_created_data') {
        try {
          const obj = JSON.parse(localStorage.getItem('sdms:student_created_data')) || e.newValue && JSON.parse(e.newValue);
          const payload = obj && obj.payload;
          if (payload) {
            // Try to fetch canonical student row from server by LRN to avoid pagination/sorting issues.
            // Only fall back to inserting the provided payload if canonical lookup fails.
            (async () => {
              try {
                if (payload && payload.lrn) {
                  const data = await api(`/students?lrn=${encodeURIComponent(payload.lrn)}`);
                  const canon = Array.isArray(data) && data.length ? data[0] : null;
                  if (canon) {
                    const row = normalizeStudent(canon);
                    students.unshift(row);
                    renderTable(students.slice(0, PAGE_LIMIT));
                    try { refreshCurrentPage(1); } catch(e){}
                    return;
                  }
                }
              } catch (e) {
                // ignore and fall back to direct payload insert below
              }

              // Canonical lookup failed; normalize and insert the payload as a best-effort fallback.
              const row = normalizeStudent({
                id: payload.id,
                lrn: payload.lrn,
                full_name: payload.full_name || [payload.first_name, payload.middle_name, payload.last_name].filter(Boolean).join(' '),
                age: payload.age ?? null,
                grade: payload.grade || '',
                section: payload.section || '',
                parent_contact: payload.parent_contact || null,
                created_at: payload.created_at || new Date().toISOString()
              });
              students.unshift(row);
              renderTable(students.slice(0, PAGE_LIMIT));
              try { refreshCurrentPage(1); } catch(e){}
            })();
            return;
          }
        } catch (err) {
          // fallback to full refresh
        }
        refreshCurrentPage(1);
      }
    });
  } catch (e) {}

  try {
    if (window.BroadcastChannel) {
      const bc = new BroadcastChannel('sdms_events');
      bc.addEventListener('message', (ev) => {
        try {
          if (ev.data && ev.data.type === 'student-created' && ev.data.payload) {
            const payload = ev.data.payload;
            const row = normalizeStudent({
              id: payload.id,
              lrn: payload.lrn,
              full_name: payload.full_name || [payload.first_name, payload.middle_name, payload.last_name].filter(Boolean).join(' '),
              age: payload.age ?? null,
              grade: payload.grade || '',
              section: payload.section || '',
              parent_contact: payload.parent_contact || null,
              created_at: payload.created_at || new Date().toISOString()
            });
            students.unshift(row);
            renderTable(students.slice(0, PAGE_LIMIT));
            try { refreshCurrentPage(1); } catch(e){}
            return;
          }
        } catch(e){}
        refreshCurrentPage(1);
      });
    }
  } catch (e) {}

  window.viewStudent = openView;
  window.editStudent = openEdit;
  window.deleteStudent = removeStudent;
  window.searchStudent = searchStudent;
  window.SDMS_refreshStudents = () => fetchData(1);

})();
