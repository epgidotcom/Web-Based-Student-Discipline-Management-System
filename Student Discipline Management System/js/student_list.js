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

  const modalTitle = document.getElementById('modalTitle');
  const editIndex = document.getElementById('editIndex');

  const viewLRN = document.getElementById('viewLRN');
  const viewName = document.getElementById('viewName');
  const viewAge = document.getElementById('viewAge');
  const viewBirthdate = document.getElementById('viewBirthdate');
  const viewGrade = document.getElementById('viewGrade');
  const viewSection = document.getElementById('viewSection');
  const viewParent = document.getElementById('viewParent');
  const viewAvatar = document.getElementById('viewAvatar');
  const viewInitials = document.getElementById('viewInitials');

  const birthdateInput = document.getElementById('birthdate');
  if (birthdateInput) {
    birthdateInput.max = new Date().toISOString().slice(0, 10);
  }

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
      grade: row.grade || '',
      section: row.section || '',
      parentContact: row.parent_contact || '',
      createdAt: row.created_at || ''
    };
  }

  function initialsFromName(name) {
    return name.split(/\s+/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase() || '?';
  }

  function renderTable(){
    if (!studentTable) return;
    studentTable.innerHTML = '';
    if (!students.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="7" style="text-align:center;color:#6b7280;">No data</td>';
      studentTable.appendChild(row);
      return;
    }

    students.forEach((s, i) => {
      const row = document.createElement('tr');
      const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g, ' ').trim();
      const age = computeAge(s.birthdate);
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
        <td>${age !== '' ? `${age}` : ''}</td>
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

  function closeModals(){
    studentModal && (studentModal.style.display = 'none');
    viewModal && (viewModal.style.display = 'none');
  }

  async function loadStudents(){
    try {
      const list = await api('/students');
      students = Array.isArray(list) ? list.map(normalizeStudent) : [];
    } catch (err) {
      console.error('[students] failed to load', err);
      alert('Failed to load students. Please refresh or try again.');
      students = [];
    }
    renderTable();
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
    const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g, ' ').trim();
    const age = computeAge(s.birthdate);

    viewLRN.textContent = s.lrn;
    viewName.textContent = fullName;
    viewAge.textContent = age !== '' ? `${age} yrs` : '—';
    viewBirthdate.textContent = s.birthdate ? formatDate(s.birthdate) : '—';
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
    if (birthdateInput) birthdateInput.value = s.birthdate || '';
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

    const idx = editIndex.value === '' ? null : Number(editIndex.value);
    const existing = idx !== null ? students[idx] : null;
    const payload = {
      lrn: document.getElementById('lrn').value.trim(),
      first_name: document.getElementById('firstName').value.trim(),
      middle_name: document.getElementById('middleName').value.trim() || null,
      last_name: document.getElementById('lastName').value.trim(),
      birthdate: birthdateInput?.value || null,
      grade: document.getElementById('grade').value || null,
      section: document.getElementById('section').value.trim() || null,
      parent_contact: document.getElementById('parentContact').value.trim() || null
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
      if (idx === null) {
        if (uploadedDataUrl) StudentPhotos.save(normalized.lrn, uploadedDataUrl);
        students.push(normalized);
      } else {
        if (existing.lrn && existing.lrn !== normalized.lrn) {
          StudentPhotos.move(existing.lrn, normalized.lrn);
        }
        if (uploadedDataUrl) StudentPhotos.save(normalized.lrn, uploadedDataUrl);
        students[idx] = normalized;
      }

      renderTable();
      studentModal.style.display = 'none';
      resetUploader();
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
      students.splice(index, 1);
      renderTable();
    } catch (err) {
      console.error('[students] delete failed', err);
      alert(err.message || 'Failed to delete student.');
    }
  }

  function searchStudent(){
    const input = document.getElementById('searchInput')?.value.toLowerCase() || '';
    document.querySelectorAll('#studentTable tbody tr').forEach(row => {
      const text = row.innerText.toLowerCase();
      row.style.display = text.includes(input) ? '' : 'none';
    });
  }

  addStudentBtn?.addEventListener('click', openCreateModal);
  closeBtns.forEach(btn => btn.addEventListener('click', closeModals));
  studentForm?.addEventListener('submit', persistStudent);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
  });

  loadStudents();

  window.viewStudent = openView;
  window.editStudent = openEdit;
  window.deleteStudent = removeStudent;
  window.searchStudent = searchStudent;
})();