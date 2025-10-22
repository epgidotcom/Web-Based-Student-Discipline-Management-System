(() => {
  const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
  const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;

  let students = [];

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
  const viewAge = document.getElementById('viewAge');
  const viewGrade = document.getElementById('viewGrade');
  const viewSection = document.getElementById('viewSection');
  const viewParent = document.getElementById('viewParent');
  const viewAvatar = document.getElementById('viewAvatar');
  const viewInitials = document.getElementById('viewInitials');

  const ageInput = document.getElementById('age');

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

  function normalizeStudent(row){
    return {
      id: row.id,
      lrn: row.lrn || '',
      firstName: row.first_name || '',
      middleName: row.middle_name || '',
      lastName: row.last_name || '',
      age: (() => {
        if (row.age == null) return null;
        const parsed = Number(row.age);
        return Number.isNaN(parsed) ? null : parsed;
      })(),
      grade: row.grade || '',
      section: row.section || '',
      parentContact: row.parent_contact || '',
      createdAt: row.created_at || ''
    };
  }

  function initialsFromName(name) {
    return name.split(/\s+/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase() || '?';
  }

  function renderTable(list = students){
    if (!studentTable) return;
    const source = Array.isArray(list) ? list : [];
    if (list !== students) {
      students = source;
    }
    studentTable.innerHTML = '';
    if (!source.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="7" style="text-align:center;color:#6b7280;">No records found.</td>';
      studentTable.appendChild(row);
      return;
    }

    source.forEach((s, i) => {
      const row = document.createElement('tr');
      if (s.section) row.dataset.section = s.section;
      
      const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g, ' ').trim();
      const age = (s.age != null && !Number.isNaN(s.age)) ? s.age : computeAge(s.birthdate);
      const photo = StudentPhotos.get(s.lrn);
      const avatar = photo
        ? `<img class="avatar" src="${photo}" alt="${fullName}">`
        : `<div class="avatar avatar--fallback">${initialsFromName(fullName)}</div>`;

      row.innerHTML = `
        <td>${s.lrn}</td>
        <td>
          <div class="name-cell">
            ${avatar}
            <span class="student-name">${fullName}</span>
          </div>
        </td>
        <td>${age !== '' && age != null ? `${age}` : ''}</td>
        <td>${s.grade || ''}</td>
        <td>${s.section || ''}</td>
        <td>${formatDate(s.createdAt)}</td>
        <td>
          <button class="action-btn" onclick="viewStudent(${i})" title="View"><i class="fa fa-eye"></i></button>
          <button class="action-btn edit-btn" onclick="editStudent(${i})" title="Edit"><i class="fa fa-edit"></i></button>
          <button class="action-btn delete-btn" onclick="deleteStudent(${i})" title="Delete"><i class="fa fa-trash"></i></button>
        </td>
      `;
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
      renderTable(students);
    },
    onError(err) {
      console.error('[students] failed to load', err);
      const detail = err?.message ? `\n\nDetails: ${err.message}` : '';
      alert(`Failed to load students. Please refresh or try again.${detail}`);
      students = [];
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
    if (ageInput) ageInput.value = '';
    editIndex.value = '';
    modalTitle.textContent = 'Add Student';
    resetUploader();
    studentModal.style.display = 'flex';
  }

  function openView(index){
    const s = students[index];
    const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g, ' ').trim();
    const age = (s.age != null && !Number.isNaN(s.age)) ? s.age : computeAge(s.birthdate);

    viewLRN.textContent = s.lrn;
    viewName.textContent = fullName;
    viewAge.textContent = age !== '' && age != null ? `${age} yrs` : '—';
    viewGrade.textContent = s.grade || '—';
    viewSection.textContent = s.section || '—';
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
    document.getElementById('parentContact').value = s.parentContact;
    if (ageInput) {
      const age = (s.age != null && !Number.isNaN(s.age)) ? s.age : computeAge(s.birthdate);
      ageInput.value = age !== '' && age != null ? age : '';
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
    const payload = {
      lrn: lrnField?.value?.trim() || null,
      first_name: firstNameField?.value?.trim() || '',
      middle_name: middleNameField?.value?.trim() || null,
      last_name: lastNameField?.value?.trim() || '',
      age: (() => {
        if (!ageInput) return null;
        const value = ageInput.value.trim();
        if (value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      })(),
      grade: gradeField?.value || null,
      section: sectionField?.value?.trim() || null,
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
      if (ageInput) ageInput.value = '';
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

  function searchStudent(){
    const input = document.getElementById('searchInput')?.value || '';
    document.querySelectorAll('#studentTable tbody tr').forEach(row => {
      const text = row.innerText;
      row.style.display = text.includes(input) ? '' : 'none';
    });
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

    function getSectionFromRow(row){
      if (row.dataset && row.dataset.section) return normalize(row.dataset.section);
      var sectionCell = row.querySelector && row.querySelector('[data-col="section"]');
      if (sectionCell) return normalize(sectionCell.textContent || sectionCell.innerText);
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
      var selSection = normalize(document.getElementById('filterSection') && document.getElementById('filterSection').value);
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
        var rowSection = getSectionFromRow(row);

        var matchesGrade = true;
        var matchesSection = true;

        if (selGrade) {
          matchesGrade = (rowGrade === selGrade || rowGrade === ('grade ' + selGrade));
        }
        if (selSection) {
          matchesSection = (rowSection === selSection);
        }

        var keep = matchesGrade && matchesSection;
        row.style.display = keep ? '' : 'none';
        if (keep) visibleCount++;
      });

      if (visibleCount === 0 && placeholder) {
        placeholder.style.display = '';
      }

      updateStudentsSummary(visibleCount);
    }

    document.addEventListener('DOMContentLoaded', function(){
      var filterSection = document.getElementById('filterSection');
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

  window.viewStudent = openView;
  window.editStudent = openEdit;
  window.deleteStudent = removeStudent;
  window.searchStudent = searchStudent;
})();