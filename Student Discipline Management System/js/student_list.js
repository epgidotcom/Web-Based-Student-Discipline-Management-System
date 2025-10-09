(() => {
  const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
  const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;

  // ===== PAGINATION CONFIG =====
  const PAGE_SIZE = 100;
  let currentPage = 1;
  let allStudents = [];
  let filteredStudents = [];

  // ===== DOM =====
  const studentTable = document.querySelector('#studentTable tbody');
  const addStudentBtn = document.getElementById('addStudentBtn');
  const studentModal = document.getElementById('studentModal');
  const viewModal = document.getElementById('viewModal');
  const closeBtns = document.querySelectorAll('.close-btn');
  const studentForm = document.getElementById('studentForm');
  const modalTitle = document.getElementById('modalTitle');
  const editIndex = document.getElementById('editIndex');
  const ageInput = document.getElementById('age');

  const paginationEl = document.getElementById('studentPagination');
  const tableInfoEl  = document.getElementById('studentInfo');
  const tableLoading = document.getElementById('tableLoading');

  const viewLRN = document.getElementById('viewLRN');
  const viewName = document.getElementById('viewName');
  const viewAge = document.getElementById('viewAge');
  const viewGrade = document.getElementById('viewGrade');
  const viewStrand = document.getElementById('viewStrand');
  const viewParent = document.getElementById('viewParent');
  const viewAvatar = document.getElementById('viewAvatar');
  const viewInitials = document.getElementById('viewInitials');

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
      birthdate: row.birthdate ? String(row.birthdate).slice(0,10) : '',
      age: row.age ? Number(row.age) : null,
      grade: row.grade || '',
      strand: row.strand || '',
      parentContact: row.parent_contact || '',
      createdAt: row.created_at || ''
    };
  }

  function initialsFromName(name) {
    return name.split(/\s+/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase() || '?';
  }

  // ===== PAGINATION CORE =====
  function getTotalPages() { return Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE)); }

  function getSliceForPage(page) {
    const start = (page - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }

  function setInfoBar(page) {
    const total = filteredStudents.length;
    if (!tableInfoEl) return;
    if (total === 0) {
      tableInfoEl.textContent = 'Showing 0 of 0';
      return;
    }
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    tableInfoEl.textContent = `Showing ${start}–${end} of ${total}`;
  }

  function renderPaginationUI(page) {
    if (!paginationEl) return;
    paginationEl.innerHTML = '';
    const totalPages = getTotalPages();
    const makeBtn = (label, goTo, opts = {}) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      if (opts.title) btn.title = opts.title;
      if (opts.current) btn.setAttribute('aria-current', 'page');
      if (opts.disabled) btn.disabled = true;
      btn.addEventListener('click', () => gotoPage(goTo));
      return btn;
    };
    paginationEl.appendChild(makeBtn('‹', Math.max(1, page - 1), { title: 'Previous', disabled: page === 1 }));
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    if (start > 1) {
      paginationEl.appendChild(makeBtn('1', 1));
      if (start > 2) paginationEl.appendChild(Object.assign(document.createElement('span'), { textContent: '…', style: 'padding:0 4px' }));
    }
    for (let p = start; p <= end; p++) paginationEl.appendChild(makeBtn(String(p), p, { current: p === page }));
    if (end < totalPages) {
      if (end < totalPages - 1) paginationEl.appendChild(Object.assign(document.createElement('span'), { textContent: '…', style: 'padding:0 4px' }));
      paginationEl.appendChild(makeBtn(String(totalPages), totalPages));
    }
    paginationEl.appendChild(makeBtn('›', Math.min(totalPages, page + 1), { title: 'Next', disabled: page === totalPages }));
  }

  function showSpinner(show) {
    if (!tableLoading) return;
    tableLoading.classList.toggle('show', !!show);
    tableLoading.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  async function gotoPage(page) {
    const totalPages = getTotalPages();
    const next = Math.min(Math.max(1, page), totalPages);
    if (next === currentPage && studentTable?.children?.length) return;
    showSpinner(true);
    studentTable?.classList.add('fade');
    studentTable?.classList.remove('show');
    await new Promise(r => setTimeout(r, 220));
    currentPage = next;
    renderTable();
    renderPaginationUI(currentPage);
    setInfoBar(currentPage);
    requestAnimationFrame(() => {
      studentTable?.classList.add('show');
      showSpinner(false);
    });
  }

  // ===== RENDER TABLE =====
  function renderTable(){
    if (!studentTable) return;
    studentTable.innerHTML = '';
    const rows = getSliceForPage(currentPage);
    if (!rows.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="7" style="text-align:center;color:#6b7280;">No data</td>';
      studentTable.appendChild(row);
      return;
    }
    rows.forEach((s) => {
      const row = document.createElement('tr');
      const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g, ' ').trim();
      const age = s.age || computeAge(s.birthdate);
      const photo = StudentPhotos.get(s.lrn);
      const avatar = photo
        ? `<img class="avatar" src="${photo}" alt="${fullName}">`
        : `<div class="avatar avatar--fallback">${initialsFromName(fullName)}</div>`;
      const idx = filteredStudents.indexOf(s);
      row.innerHTML = `
        <td>${s.lrn}</td>
        <td><div class="name-cell">${avatar}<span class="student-name">${fullName}</span></div></td>
        <td>${age || ''}</td>
        <td>${s.grade || ''}</td>
        <td>${s.strand || ''}</td>
        <td>${formatDate(s.createdAt)}</td>
        <td>
          <button class="action-btn" onclick="viewStudent(${idx})" title="View"><i class="fa fa-eye"></i></button>
          <button class="action-btn edit-btn" onclick="editStudent(${idx})" title="Edit"><i class="fa fa-edit"></i></button>
          <button class="action-btn delete-btn" onclick="deleteStudent(${idx})" title="Delete"><i class="fa fa-trash"></i></button>
        </td>`;
      studentTable.appendChild(row);
    });
  }

  function closeModals(){ studentModal.style.display = viewModal.style.display = 'none'; }

  // ===== DATA =====
  async function loadStudents(){
    try {
      const list = await api('/students');
      allStudents = Array.isArray(list) ? list.map(normalizeStudent) : [];
    } catch (err) {
      console.error('Failed to load students', err);
      allStudents = [];
    }
    filteredStudents = [...allStudents];
    currentPage = 1;
    renderTable(); renderPaginationUI(currentPage); setInfoBar(currentPage);
    requestAnimationFrame(() => studentTable?.classList.add('show'));
  }

  function openCreateModal(){
    studentForm.reset(); ageInput.value = ''; editIndex.value = '';
    modalTitle.textContent = 'Add Student'; resetUploader();
    studentModal.style.display = 'flex';
  }

  function openView(idx){
    const s = filteredStudents[idx]; if (!s) return;
    const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g,' ').trim();
    const age = s.age || computeAge(s.birthdate);
    viewLRN.textContent = s.lrn; viewName.textContent = fullName;
    viewAge.textContent = age ? `${age} yrs` : '—';
    viewGrade.textContent = s.grade || '—';
    viewStrand.textContent = s.strand || '—';
    viewParent.textContent = s.parentContact || '—';
    const photo = StudentPhotos.get(s.lrn);
    if (photo){ viewAvatar.src = photo; viewAvatar.classList.remove('is-hidden'); viewInitials.classList.add('is-hidden'); }
    else { viewAvatar.classList.add('is-hidden'); viewInitials.textContent = initialsFromName(fullName); viewInitials.classList.remove('is-hidden'); }
    viewModal.style.display = 'flex';
  }

  function openEdit(idx){
    const s = filteredStudents[idx]; if (!s) return;
    const $ = id => document.getElementById(id);
    $('lrn').value = s.lrn; $('firstName').value = s.firstName;
    $('middleName').value = s.middleName; $('lastName').value = s.lastName;
    $('grade').value = s.grade; $('strand').value = s.strand;
    $('parentContact').value = s.parentContact;
    ageInput.value = s.age || computeAge(s.birthdate) || '';
    editIndex.value = allStudents.indexOf(s); modalTitle.textContent = 'Edit Student';
    const photo = StudentPhotos.get(s.lrn);
    if (photo){ photoPreview.src = photo; photoPreview.dataset.dataurl = photo;
      photoPreview.classList.remove('is-hidden'); photoActions.classList.remove('is-hidden'); photoDrop.classList.add('is-hidden');
    } else resetUploader();
    studentModal.style.display = 'flex';
  }

  async function persistStudent(e){
    e.preventDefault();
    if (!studentForm.reportValidity()) return;
    const $ = id => document.getElementById(id);
    const idx = editIndex.value === '' ? null : Number(editIndex.value);
    const existing = idx !== null ? allStudents[idx] : null;
    const payload = {
      lrn: $('lrn').value.trim() || null,
      first_name: $('firstName').value.trim() || '',
      middle_name: $('middleName').value.trim() || null,
      last_name: $('lastName').value.trim() || '',
      age: ageInput.value ? Number(ageInput.value) : null,
      grade: $('grade').value || null,
      strand: $('strand').value.trim() || null,
      parent_contact: $('parentContact').value.trim() || null
    };
    try {
      let saved = idx === null
        ? await api('/students', { method: 'POST', body: payload })
        : await api(`/students/${encodeURIComponent(existing.id)}`, { method: 'PUT', body: payload });
      const normalized = normalizeStudent(saved);
      const img = photoPreview?.dataset?.dataurl;
      if (idx === null){ if (img) StudentPhotos.save(normalized.lrn, img); allStudents.push(normalized); }
      else { if (existing.lrn && existing.lrn!==normalized.lrn) StudentPhotos.move(existing.lrn, normalized.lrn);
        if (img) StudentPhotos.save(normalized.lrn, img); allStudents[idx] = normalized; }
      applySearchFilter($('searchInput')?.value||'');
      studentModal.style.display='none'; resetUploader(); ageInput.value='';
    } catch(err){ alert(err.message || 'Failed to save student.'); }
  }

  async function removeStudent(idx){
    const s = filteredStudents[idx]; if (!s) return;
    if (!confirm('Delete this student?')) return;
    try {
      await api(`/students/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      StudentPhotos.remove(s.lrn);
      allStudents = allStudents.filter(x=>x!==s);
      applySearchFilter(document.getElementById('searchInput')?.value||'');
    } catch(err){ alert(err.message || 'Failed to delete student.'); }
  }

  function applySearchFilter(query){
    const q = query.toLowerCase();
    filteredStudents = q ? allStudents.filter(s =>
      `${s.lrn} ${s.firstName} ${s.middleName} ${s.lastName} ${s.strand}`.toLowerCase().includes(q)
    ) : [...allStudents];
    currentPage=1;
    renderTable(); renderPaginationUI(currentPage); setInfoBar(currentPage);
  }

  function searchStudent(){ applySearchFilter(document.getElementById('searchInput')?.value || ''); }

  addStudentBtn?.addEventListener('click', openCreateModal);
  closeBtns.forEach(b => b.addEventListener('click', closeModals));
  studentForm?.addEventListener('submit', persistStudent);
  window.addEventListener('keydown', e => { if (e.key==='Escape') closeModals(); });

  loadStudents();

  window.viewStudent = openView;
  window.editStudent = openEdit;
  window.deleteStudent = removeStudent;
  window.searchStudent = searchStudent;
})();