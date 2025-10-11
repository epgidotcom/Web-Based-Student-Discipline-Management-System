// Students Page Script (renamed from student_list.js to force fresh deploy & cache bust)
// Added verbose logging to help diagnose loading issues.

console.log('[StudentsPage] script starting');

let students = [];

const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '';
console.log('[StudentsPage] API_BASE =', API_BASE || '(empty)');

async function apiFetch(path, init) {
  const url = `${API_BASE}${path}`;
  console.log('[StudentsPage] fetch', url, init?.method || 'GET');
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    console.error('[StudentsPage] HTTP error', res.status, res.statusText, text.slice(0,200));
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ' - ' + text : ''}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function toServer(body) {
  return {
    lrn: body.lrn || null,
    first_name: body.firstName || null,
    middle_name: body.middleName || null,
    last_name: body.lastName || null,
    birthdate: body.birthdate || null,
    address: body.address || null,
    grade: body.grade || null,
    section: body.section || null,
    parent_contact: body.parentContact || null
  };
}
function fromServer(row) {
  return {
    id: row.id,
    lrn: row.lrn || '',
    firstName: row.first_name || '',
    middleName: row.middle_name || '',
    lastName: row.last_name || '',
    birthdate: row.birthdate || '',
    address: row.address || '',
    grade: row.grade || '',
    section: row.section || '',
    parentContact: row.parent_contact || ''
  };
}

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
const viewBirthdate = document.getElementById('viewBirthdate');
const viewAddress = document.getElementById('viewAddress');
const viewGrade = document.getElementById('viewGrade');
const viewSection = document.getElementById('viewSection');
const viewParent = document.getElementById('viewParent');
const viewAvatar = document.getElementById('viewAvatar');
const viewInitials = document.getElementById('viewInitials');

const StudentPhotos = {
  key(lrn) { return `studentPhoto:${String(lrn).trim()}`; },
  get(lrn) { try { return localStorage.getItem(this.key(lrn)); } catch { return null; } },
  save(lrn, dataUrl) { try { localStorage.setItem(this.key(lrn), dataUrl); } catch {} },
  remove(lrn) { try { localStorage.removeItem(this.key(lrn)); } catch {} },
  move(oldLRN, newLRN) { if (!oldLRN || !newLRN || oldLRN === newLRN) return; const d=this.get(oldLRN); if(d){ this.save(newLRN,d); this.remove(oldLRN);} }
};

async function fileToDataURL(file, maxEdge=512, quality=0.85) {
  const url = URL.createObjectURL(file);
  const img = new Image(); img.src = url; await img.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL('image/jpeg', quality);
}

const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const photoDrop = document.getElementById('photoDrop');
const photoChoose = document.getElementById('photoChoose');
const photoActions = document.getElementById('photoActions');
const photoChange = document.getElementById('photoChange');
const photoRemove = document.getElementById('photoRemove');

function resetUploader(){ if(!photoPreview) return; photoPreview.removeAttribute('src'); delete photoPreview.dataset.dataurl; photoPreview.classList.add('is-hidden'); photoActions.classList.add('is-hidden'); photoDrop.classList.remove('is-hidden'); }
async function setPreviewFromFile(file){ if(!file) return; if(!/^image\/(png|jpe?g|webp)$/i.test(file.type)){ alert('Please choose a JPG or PNG image.'); return;} const dataUrl = await fileToDataURL(file,512,0.85); photoPreview.src=dataUrl; photoPreview.dataset.dataurl=dataUrl; photoPreview.classList.remove('is-hidden'); photoActions.classList.remove('is-hidden'); photoDrop.classList.add('is-hidden'); }

photoChoose?.addEventListener('click', ()=> photoInput.click());
photoChange?.addEventListener('click', ()=> photoInput.click());
photoRemove?.addEventListener('click', resetUploader);
photoInput?.addEventListener('change', e => setPreviewFromFile(e.target.files?.[0]));
['dragenter','dragover'].forEach(ev=> photoDrop?.addEventListener(ev,e=>{e.preventDefault(); photoDrop.classList.add('dragover');}));
['dragleave','drop'].forEach(ev=> photoDrop?.addEventListener(ev,e=>{e.preventDefault(); photoDrop.classList.remove('dragover');}));
photoDrop?.addEventListener('drop', e=> setPreviewFromFile(e.dataTransfer.files?.[0]));

addStudentBtn && (addStudentBtn.onclick = () => { studentForm.reset(); editIndex.value=''; modalTitle.textContent='Add Student'; resetUploader(); studentModal.style.display='flex'; });
closeBtns.forEach(btn => btn.onclick = () => { studentModal.style.display='none'; viewModal.style.display='none'; });

studentForm && (studentForm.onsubmit = async (e) => {
  e.preventDefault();
  const idx = editIndex.value === '' ? null : Number(editIndex.value);
  const prevLRN = idx === null ? null : students[idx]?.lrn;
  const student = {
    lrn: document.getElementById('lrn').value.trim(),
    firstName: document.getElementById('firstName').value.trim(),
    middleName: document.getElementById('middleName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
  
    address: document.getElementById('address').value.trim(),
    grade: document.getElementById('grade').value,
    section: document.getElementById('section').value.trim(),
    parentContact: document.getElementById('parentContact').value.trim()
  };
  try {
    if (idx === null) {
      const created = await apiFetch('/api/students', { method: 'POST', body: JSON.stringify(toServer(student)) });
      const createdUi = fromServer(created);
      const uploadedDataUrl = photoPreview?.dataset?.dataurl; if(uploadedDataUrl) StudentPhotos.save(createdUi.lrn, uploadedDataUrl);
      students.push(createdUi);
    } else {
      const id = students[idx]?.id;
      const updated = await apiFetch(`/api/students/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify(toServer(student)) });
      const updatedUi = fromServer(updated);
      if (prevLRN && prevLRN !== updatedUi.lrn) StudentPhotos.move(prevLRN, updatedUi.lrn);
      const uploadedDataUrl = photoPreview?.dataset?.dataurl; if(uploadedDataUrl) StudentPhotos.save(updatedUi.lrn, uploadedDataUrl);
      students[idx] = updatedUi;
    }
    renderTable(); studentModal.style.display='none';
  } catch(err) {
    console.error('[StudentsPage] save failed', err);
    alert('Failed to save student. ' + (err?.message || '')); 
  }
});

function initialsFromName(name){ return name.split(/\s+/).filter(Boolean).map(s=>s[0]).join('').slice(0,2).toUpperCase() || '?'; }
function renderTable(){ if(!studentTable) return; studentTable.innerHTML=''; students.forEach((s,i)=>{ const row=document.createElement('tr'); const fullName=`${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g,' ').trim(); const photo=StudentPhotos.get(s.lrn); const avatar = photo ? `<img class="avatar" src="${photo}" alt="${fullName}">` : `<div class="avatar avatar--fallback">${initialsFromName(fullName)}</div>`; row.innerHTML=`<td>${s.lrn}</td><td><div class="name-cell">${avatar}<span class="student-name">${fullName}</span></div></td><td>${s.birthdate}</td><td>${s.grade}</td><td>${s.section}</td><td><button class="action-btn" onclick="viewStudent(${i})" title="View"><i class="fa fa-eye"></i></button><button class="action-btn edit-btn" onclick="editStudent(${i})" title="Edit"><i class="fa fa-edit"></i></button><button class="action-btn delete-btn" onclick="deleteStudent(${i})" title="Delete"><i class="fa fa-trash"></i></button></td>`; studentTable.appendChild(row); }); }

function viewStudent(i){ const s=students[i]; const fullName=`${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g,' ').trim(); viewLRN.textContent=s.lrn; viewName.textContent=fullName; viewBirthdate.textContent=s.birthdate; viewAddress.textContent=s.address; viewGrade.textContent=s.grade; viewSection.textContent=s.section; viewParent.textContent=s.parentContact; const photo=StudentPhotos.get(s.lrn); if(photo){ viewAvatar.src=photo; viewAvatar.classList.remove('is-hidden'); viewInitials.classList.add('is-hidden'); } else { viewAvatar.classList.add('is-hidden'); viewInitials.textContent=initialsFromName(fullName); viewInitials.classList.remove('is-hidden'); } viewModal.style.display='flex'; }
function editStudent(i){ const s=students[i]; document.getElementById('lrn').value=s.lrn; document.getElementById('firstName').value=s.firstName; document.getElementById('middleName').value=s.middleName; document.getElementById('lastName').value=s.lastName; document.getElementById('birthdate').value=s.birthdate; document.getElementById('address').value=s.address; document.getElementById('grade').value=s.grade; document.getElementById('section').value=s.section; document.getElementById('parentContact').value=s.parentContact; editIndex.value=i; modalTitle.textContent='Edit Student'; const photo=StudentPhotos.get(s.lrn); if(photo){ photoPreview.src=photo; photoPreview.dataset.dataurl=photo; photoPreview.classList.remove('is-hidden'); photoActions.classList.remove('is-hidden'); photoDrop.classList.add('is-hidden'); } else { resetUploader(); } studentModal.style.display='flex'; }
async function deleteStudent(i){ if(!confirm('Delete this student?')) return; const s=students[i]; try { await apiFetch(`/api/students/${encodeURIComponent(s.id)}`, { method:'DELETE' }); StudentPhotos.remove(s.lrn); students.splice(i,1); renderTable(); } catch(err){ console.error('[StudentsPage] delete failed', err); alert('Failed to delete student.'); } }
function searchStudent(){ const input=document.getElementById('searchInput').value.toLowerCase(); document.querySelectorAll('#studentTable tbody tr').forEach(row=>{ const text=row.innerText.toLowerCase(); row.style.display = text.includes(input) ? '' : 'none'; }); }

async function loadStudents(){ console.log('[StudentsPage] loadStudents start'); try { const list = await apiFetch('/api/students'); students = Array.isArray(list) ? list.map(fromServer) : []; console.log('[StudentsPage] loadStudents success count=', students.length); } catch(err){ console.error('[StudentsPage] loadStudents failed', err); students=[]; } renderTable(); }

loadStudents();

window.viewStudent=viewStudent; window.editStudent=editStudent; window.deleteStudent=deleteStudent; window.searchStudent=searchStudent;

document.getElementById('logoutBtn')?.addEventListener('click', ()=>{ window.location.href='index.html'; });

console.log('[StudentsPage] script finished init');

