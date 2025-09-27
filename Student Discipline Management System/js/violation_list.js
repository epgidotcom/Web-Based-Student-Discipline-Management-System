/* ================= Persistence via API (replaces previous in-memory only list) ================= */
let violations = [];
let studentsIndex = []; // array of student objects from /api/students
let studentNameMap = new Map(); // lower(full name) -> student
let studentLrnMap = new Map(); // lrn -> student
const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '';

async function apiFetch(path, init) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    let txt = '';
    try { txt = await res.text(); } catch {}
    throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`.trim());
  }
  if (res.status === 204) return null;
  return res.json();
}

// ================= Student resolution & repeat logic =================
function buildStudentDisplay(s){
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}

function rebuildStudentMap(){
  studentNameMap.clear();
  studentLrnMap.clear();
  studentsIndex.forEach(s=> {
    const name = buildStudentDisplay(s);
    if(name) studentNameMap.set(name.toLowerCase(), {...s, _display: name});
    if(s.lrn){
      studentLrnMap.set(String(s.lrn).trim(), {...s, _display: name});
    }
  });
}

function resolveStudent(name){
  if(!name) return null;
  return studentNameMap.get(name.toLowerCase()) || null;
}

async function loadStudents(){
  try {
    const list = await apiFetch('/api/students');
    studentsIndex = Array.isArray(list)? list : [];
  } catch(e){
    console.error('[Violations] Failed to load students', e);
    studentsIndex = [];
  }
  rebuildStudentMap();
}

async function fetchRepeatCount(studentId, violationType){
  if(!studentId || !violationType) return 0;
  try {
    const data = await apiFetch(`/api/violations/repeat/check?student_id=${encodeURIComponent(studentId)}&offense_type=${encodeURIComponent(violationType)}`);
    return data?.count || 0;
  } catch(e){
    console.warn('[Violations] repeat check failed', e);
    return 0;
  }
}

function fromServerViolation(row){
  // Accept legacy or new field names, normalizing to frontend shape
  const evidenceRaw = row.evidence || null; // new: server stores JSON object {files: [...], notes: ...}
  let evidenceArr = [];
  if (evidenceRaw) {
    if (Array.isArray(evidenceRaw)) {
      evidenceArr = evidenceRaw; // legacy array form
    } else if (typeof evidenceRaw === 'object') {
      if (Array.isArray(evidenceRaw.files)) evidenceArr = evidenceRaw.files;
    }
  }
  return {
    id: row.id,
    studentId: row.student_id || null,
    studentName: row.student_name || '',
    gradeSection: row.grade_section || '',
    violationType: row.offense_type || row.violation_type || '',
    description: row.description || '',
    sanction: row.sanction || '',
    violation: row.violation || '', // legacy optional
    date: row.incident_date || row.date || '',
    evidence: evidenceArr,
    repeatCount: row.repeat_count != null ? row.repeat_count : (row.repeat_count_at_insert != null ? row.repeat_count_at_insert : 0)
  };
}

/* ================= Elements ================= */
const violationForm  = document.getElementById("violationForm");
const violationTable = document.getElementById("violationTable").querySelector("tbody");
const addViolationBtn= document.getElementById("addViolationBtn");
const violationModal = document.getElementById("violationModal");
const viewModal      = document.getElementById("viewModal");
const modalTitle     = document.getElementById("modalTitle");
const closeBtns      = document.querySelectorAll(".close-btn");

/* ---- Inputs (core) ---- */
const studentNameInput = document.getElementById("studentName");
const gradeSectionInput= document.getElementById("gradeSection");     // NEW
const violationTypeInput = document.getElementById("violationType");  // NEW
const sanctionInput    = document.getElementById("sanction");
const descriptionInput = document.getElementById("description");
const dateInput        = document.getElementById("date");
const editIndexInput   = document.getElementById("editIndex");
const saveBtn = violationForm?.querySelector('button[type="submit"]') || violationForm?.querySelector('button');
// dynamic info elements (create if missing)
let studentLookupStatus = document.getElementById('studentLookupStatus');
if(!studentLookupStatus && studentNameInput){
  studentLookupStatus = document.createElement('div');
  studentLookupStatus.id = 'studentLookupStatus';
  studentLookupStatus.className = 'field-hint';
  studentNameInput.parentElement.appendChild(studentLookupStatus);
}
let repeatInfoEl = document.getElementById('violationRepeatInfo');
if(!repeatInfoEl && violationTypeInput){
  repeatInfoEl = document.createElement('div');
  repeatInfoEl.id = 'violationRepeatInfo';
  repeatInfoEl.className = 'field-hint';
  violationTypeInput.parentElement.appendChild(repeatInfoEl);
}
let resolvedStudent = null; // cache of currently matched student
// LRN input + status (created if missing)
const studentLrnInput = document.getElementById('studentLRN');
let lrnLookupStatus = document.getElementById('lrnLookupStatus');
if(!lrnLookupStatus && studentLrnInput){
  lrnLookupStatus = document.createElement('div');
  lrnLookupStatus.id = 'lrnLookupStatus';
  lrnLookupStatus.className = 'field-hint';
  studentLrnInput.parentElement.appendChild(lrnLookupStatus);
}

/* ---- Optional legacy input (if your form still has it) ---- */
const violationInput   = document.getElementById("violation"); // kept for compatibility (not shown in table)

/* ---- Past Offense UI ---- */
const pastOffenseWrap   = document.getElementById("pastOffenseWrap");
const pastOffenseList   = document.getElementById("pastOffenseList");
const pastOffenseEmpty  = document.getElementById("pastOffenseEmpty");
// Optional legacy elements (may not exist in DOM)
const pastOffenseSelect = document.getElementById("pastOffenseSelect");
const pastOffenseStatus = document.getElementById("pastOffenseStatus");

/* ---- View modal elements ---- */
const viewStudent      = document.getElementById("viewStudent");
const viewGradeSection = document.getElementById("viewGradeSection");
const viewPastOffenseRow = document.getElementById("viewPastOffenseRow");
const viewPastOffense  = document.getElementById("viewPastOffense");
const viewViolationType= document.getElementById("viewViolationType");
const viewSanction     = document.getElementById("viewSanction");
const viewDescription  = document.getElementById("viewDescription");
const viewDate         = document.getElementById("viewDate");
const viewEvidenceWrap = document.getElementById("viewEvidenceWrap");
const viewEvidenceBox  = document.getElementById("viewEvidence");

/* ================= Evidence uploader ================= */
const ev = {
  input:  document.getElementById("evidenceInput"),
  drop:   document.getElementById("evidenceDrop"),
  choose: document.getElementById("evidenceChoose"),
  change: document.getElementById("evidenceChange"),
  clear:  document.getElementById("evidenceClear"),
  actions:document.getElementById("evidenceActions"),
  preview:document.getElementById("evidencePreview"),
};
let evidenceData = [];  // array of dataURLs (max 3)

async function fileToDataURL(file, maxEdge = 1024, quality = 0.85) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/jpeg", quality);
}

function renderEvidenceThumbs() {
  if (!ev.preview) return;
  ev.preview.innerHTML = "";
  evidenceData.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src; img.className = "evidence-thumb"; img.alt = `Evidence ${i+1}`;
    img.title = "Click to open";
    img.addEventListener("click", () => window.open(src, "_blank"));
    ev.preview.appendChild(img);
  });
  const has = evidenceData.length > 0;
  ev.preview?.classList.toggle("is-hidden", !has);
  ev.actions?.classList.toggle("is-hidden", !has);
  ev.drop?.classList.toggle("is-hidden", has);
}

async function addFiles(files) {
  for (const file of Array.from(files || [])) {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) continue;
    if (evidenceData.length >= 3) { alert("You can add up to 3 images."); break; }
    const dataUrl = await fileToDataURL(file, 1024, 0.85);
    evidenceData.push(dataUrl);
  }
  renderEvidenceThumbs();
}

function clearEvidence() { evidenceData = []; renderEvidenceThumbs(); }

function initEvidenceUploader() {
  if (!ev.input) return;
  ev.choose?.addEventListener("click", () => ev.input.click());
  ev.change?.addEventListener("click", () => ev.input.click());
  ev.clear?.addEventListener("click", clearEvidence);
  ev.input?.addEventListener("change", (e) => addFiles(e.target.files));

  ["dragenter","dragover"].forEach(type =>
    ev.drop?.addEventListener(type, (e)=>{ e.preventDefault(); ev.drop.classList.add("dragover"); })
  );
  ["dragleave","drop"].forEach(type =>
    ev.drop?.addEventListener(type, (e)=>{ e.preventDefault(); ev.drop.classList.remove("dragover"); })
  );
  ev.drop?.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  window._evidence = {
    get: () => evidenceData.slice(),
    set: (arr=[]) => { evidenceData = arr.slice(0,3); renderEvidenceThumbs(); },
    clear: clearEvidence,
    hasAny: () => evidenceData.length > 0
  };
}
initEvidenceUploader();

/* ================= Past Offense data via API only ================= */
// Read API configuration (set in js/config.js). Fallbacks for safety.
// (API_BASE now declared near top; keep legacy comment)

const ApiPastOffenseStore = {
  async getByName(name) {
    const res = await fetch(`${API_BASE}/api/past-offenses?name=${encodeURIComponent(name)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },
  async addOffense(name, label, dateISO) {
    const res = await fetch(`${API_BASE}/api/past-offenses`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, label, date: dateISO })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
};
const PastOffenseService = ApiPastOffenseStore;

function levelFromCount(n) {
  if (n <= 0) return 'None';
  if (n === 1) return '1st Offense';
  if (n === 2) return '2nd Offense';
  if (n === 3) return '3rd Offense';
  return 'Repeat/Chronic';
}

const debounce = (fn, ms = 300) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/* ================= Refresh Past Offense UI ================= */
async function refreshPastOffenseUI() {
  if (!pastOffenseWrap || !pastOffenseList || !pastOffenseEmpty) return;

  const name = (studentNameInput && studentNameInput.value || '').trim();

  // Hide until there's a name
  if (!name) {
    pastOffenseWrap.classList.add('is-hidden');
    pastOffenseList.innerHTML = '';
    pastOffenseEmpty.textContent = 'No past offenses.';
    return;
  }

  pastOffenseWrap.classList.remove('is-hidden');

  // Get history from API
  const offenses = await PastOffenseService.getByName(name);

  // Render list
  pastOffenseList.innerHTML = '';
  if (!offenses.length) {
    pastOffenseEmpty.classList.remove('is-hidden');
    pastOffenseEmpty.textContent = 'No past offenses.';
  } else {
    pastOffenseEmpty.classList.add('is-hidden');
    offenses.forEach(o => {
      const li = document.createElement('li');
      li.textContent = o;
      pastOffenseList.appendChild(li);
    });
  }
}


/* ================= Open/Close Modals ================= */
addViolationBtn.addEventListener("click", () => {
  violationForm.reset();
  editIndexInput.value = "";
  modalTitle.textContent = "Add Violation";
  window._evidence?.clear();             // reset images

  // Ensure Past Offense is hidden on open
  if (pastOffenseWrap) pastOffenseWrap.classList.add('is-hidden');
  if (pastOffenseList) pastOffenseList.innerHTML = '';
  if (pastOffenseEmpty) pastOffenseEmpty.textContent = 'No past offenses.';

  violationModal.style.display = "block";
  if(studentLookupStatus) studentLookupStatus.textContent = '';
  if(repeatInfoEl) repeatInfoEl.textContent = '';
  resolvedStudent = null;
  if(saveBtn) saveBtn.disabled = true; // disable until student resolved
});

closeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    violationModal.style.display = "none";
    viewModal.style.display = "none";
  });
});

/* ================= Save form (create/update via API) ================= */
violationForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const studentName   = (studentNameInput.value || "").trim();
  const gradeSection  = (gradeSectionInput?.value || "").trim();
  const violationType = (violationTypeInput?.value || "").trim();
  const sanction      = (sanctionInput.value || "").trim();
  const description   = (descriptionInput.value || "").trim();
  const date          = dateInput.value || "";

  // Keep legacy field if present (not shown in table)
  const violation     = violationInput ? (violationInput.value || "").trim() : "";

  // Build a readable label for history, e.g., "Improper Uniform | Minor | Sanction: Verbal Warning — 2025-09-20"
  const parts = [];
  if (description) parts.push(description);
  if (violationType) parts.push(violationType);
  if (sanction) parts.push(`Sanction: ${sanction}`);
  const label = parts.join(" | ") + (date ? ` — ${date}` : "");
  let offensesAfter = [];
  if (studentName) {
    offensesAfter = await PastOffenseService.addOffense(studentName, label, date);
  }

  const violationData = {
    studentName,
    gradeSection,
    pastOffense: offensesAfter.length ? offensesAfter.join(' • ') : 'No past offenses.',
    date,
    description,
    violationType,
    sanction,
    // keep the older 'violation' in case you still use it somewhere else
    violation,
    evidence: window._evidence?.get ? window._evidence.get() : []
  };

  // Ensure we have a resolved student
  if(!resolvedStudent){
    alert('Please select/enter a valid existing student from the Students list first.');
    return;
  }
  // Prepare evidence as object {files: [...]} for new schema
  const evidencePayload = (window._evidence?.get && window._evidence.get().length)
    ? { files: window._evidence.get() }
    : null;
  try {
    if (editIndexInput.value === "") {
      // Create
      const created = await apiFetch('/api/violations', { method: 'POST', body: JSON.stringify({
        student_id: resolvedStudent.id,
        grade_section: gradeSection,
        offense_type: violationType,
        sanction,
        description,
        incident_date: date,
        evidence: evidencePayload
      }) });
      violations.unshift(fromServerViolation(created)); // newest first
    } else {
      // Update
      const id = violations[editIndexInput.value].id;
      const updated = await apiFetch(`/api/violations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({
        student_id: resolvedStudent.id,
        grade_section: gradeSection,
        offense_type: violationType,
        sanction,
        description,
        incident_date: date,
        evidence: evidencePayload
      }) });
      violations[editIndexInput.value] = fromServerViolation(updated);
    }
    renderTable();
    violationModal.style.display = "none";
    window.dispatchEvent(new Event('sdms:data-changed'));
    try { localStorage.setItem('sdms_violations_dirty', String(Date.now())); } catch(_) {}
  } catch(err) {
    console.error('Failed to save violation', err);
    alert('Failed to save violation: ' + err.message);
  }
});

/* ================= Render table =================
   Columns:
   Student Name | Grade & Section | Past Offense | Date | Violation's Description | Violation Type | Sanction | Actions
================================================= */
function renderTable() {
  violationTable.innerHTML = "";

  violations.forEach((item, index) => {
    const hasAttach = item.evidence && item.evidence.length > 0;
    const paperclip = hasAttach ? `<span class="has-attachment" title="Has evidence"><i class="fa fa-paperclip"></i></span>` : "";

    const row = document.createElement("tr");
    row.className = 'violation-row';
    row.innerHTML = `
      <td class="cell-student" data-label="Student">${paperclip} <span class="cell-text">${item.studentName}</span></td>
      <td class="cell-grade" data-label="Grade & Section">${item.gradeSection || '-'}</td>
      <td class="cell-past" data-label="Past Offense">${item.pastOffense || 'None'}</td>
      <td class="cell-date" data-label="Date">${item.date || '-'}</td>
      <td class="cell-description" data-label="Description">${item.description || '—'}</td>
      <td class="cell-type" data-label="Violation Type">${item.violationType || '-'}</td>
      <td class="cell-sanction" data-label="Sanction">${item.sanction || '-'}</td>
      <td class="cell-actions" data-label="Actions">
        <div class="actions-wrap">
          <button class="tbl-btn view" onclick="viewViolationDetails(${index})" title="View" aria-label="View details for ${item.studentName}"><i class="fa fa-eye" aria-hidden="true"></i></button>
          <button class="tbl-btn edit" onclick="editViolation(${index})" title="Edit" aria-label="Edit violation for ${item.studentName}"><i class="fa fa-edit" aria-hidden="true"></i></button>
          <button class="tbl-btn delete" onclick="deleteViolation(${index})" title="Delete" aria-label="Delete violation for ${item.studentName}"><i class="fa fa-trash" aria-hidden="true"></i></button>
        </div>
      </td>
    `;
    violationTable.appendChild(row);
  });
}

/* ================= View details ================= */
window.viewViolationDetails = function (index) {
  const item = violations[index];

  if (viewStudent)      viewStudent.textContent = item.studentName || '-';
  if (viewGradeSection) viewGradeSection.textContent = item.gradeSection || '-';

  const offenseText = item.pastOffense || 'None';
  if (viewPastOffense)  viewPastOffense.textContent = offenseText;
  if (viewPastOffenseRow) viewPastOffenseRow.classList.toggle('is-hidden', !offenseText || offenseText === 'None');

  if (viewViolationType) viewViolationType.textContent = item.violationType || '-';
  if (viewSanction)     viewSanction.textContent = item.sanction || '-';
  if (viewDescription)  viewDescription.textContent = item.description || "No description provided.";
  if (viewDate)         viewDate.textContent = item.date || '-';

  // render evidence thumbs
  if (viewEvidenceBox && viewEvidenceWrap) {
    viewEvidenceBox.innerHTML = "";
    if (item.evidence && item.evidence.length) {
      item.evidence.forEach((src, i) => {
        const img = document.createElement("img");
        img.src = src; img.className = "evidence-thumb"; img.alt = `Evidence ${i+1}`;
        img.title = "Click to open";
        img.addEventListener("click", () => window.open(src, "_blank"));
        viewEvidenceBox.appendChild(img);
      });
      viewEvidenceWrap.classList.remove("is-hidden");
    } else {
      viewEvidenceWrap.classList.add("is-hidden");
    }
  }

  viewModal.style.display = "block";
};

/* ================= Edit violation ================= */
window.editViolation = function (index) {
  const item = violations[index];

  studentNameInput.value    = item.studentName || '';
  gradeSectionInput && (gradeSectionInput.value = item.gradeSection || '');
  violationTypeInput && (violationTypeInput.value = item.violationType || '');
  sanctionInput.value       = item.sanction || '';
  descriptionInput.value    = item.description || '';
  dateInput.value           = item.date || '';
  editIndexInput.value      = index;
  // set resolvedStudent using current table data (will attempt by id or name)
  resolvedStudent = item.studentId ? studentsIndex.find(s=> s.id === item.studentId) : resolveStudent(item.studentName);
  if(studentLookupStatus){
    if(resolvedStudent){
      studentLookupStatus.textContent = 'Student resolved ✔';
      studentLookupStatus.style.color = '#2e7d32';
    } else {
      studentLookupStatus.textContent = 'Unresolved student (cannot save until fixed)';
      studentLookupStatus.style.color = '#c62828';
    }
  }
  if(saveBtn) saveBtn.disabled = !resolvedStudent;
  updateRepeatDisplay();

  // Update Past Offense UI for this student (and show the block)
  refreshPastOffenseUI();

  // preload evidence
  window._evidence?.set(item.evidence || []);

  modalTitle.textContent = "Edit Violation";
  violationModal.style.display = "block";
};

/* ================= Delete violation ================= */
window.deleteViolation = async function (index) {
  if (!confirm("Delete this violation?")) return;
  const id = violations[index].id;
  try {
    await apiFetch(`/api/violations/${encodeURIComponent(id)}`, { method: 'DELETE' });
    violations.splice(index, 1);
    renderTable();
    window.dispatchEvent(new Event('sdms:data-changed'));
    try { localStorage.setItem('sdms_violations_dirty', String(Date.now())); } catch(_) {}
  } catch(err) {
    console.error('Failed to delete violation', err);
    alert('Failed to delete violation: ' + err.message);
  }
};

/* ================= Search ================= */
window.searchViolation = function () {
  const filter = document.getElementById("searchInput").value.toLowerCase();
  const rows = violationTable.getElementsByTagName("tr");
  Array.from(rows).forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? "" : "none";
  });
};

/* ================= Initial load from API ================= */
async function loadViolations() {
  try {
    const list = await apiFetch('/api/violations');
    violations = Array.isArray(list) ? list.map(fromServerViolation) : [];
  } catch (err) {
    console.error('Failed to load violations', err);
    violations = [];
  }
  renderTable();
}
// Load students then violations
loadStudents().then(()=> loadViolations());

// Hide Past Offense on load
if (pastOffenseWrap) pastOffenseWrap.classList.add('is-hidden');
if (pastOffenseSelect) pastOffenseSelect.value = 'None';
if (pastOffenseStatus) pastOffenseStatus.textContent = 'No past offenses.';

// Show/refresh past offense after typing student name
function updateResolvedStudent(){
  const name = (studentNameInput.value || '').trim();
  resolvedStudent = resolveStudent(name);
  if(studentLookupStatus){
    if(!name){
      studentLookupStatus.textContent='';
    } else if(resolvedStudent){
      studentLookupStatus.textContent = 'Student found ✔';
      studentLookupStatus.style.color = '#2e7d32';
    } else {
      studentLookupStatus.textContent = 'Student not found. Add them in Students page first.';
      studentLookupStatus.style.color = '#c62828';
    }
  }
  if(saveBtn) saveBtn.disabled = !resolvedStudent;
  updateRepeatDisplay();
}

// Attempt resolve by LRN first (non-destructive). If an exact LRN match is found,
// we populate the name field (if empty or mismatched) and auto-fill grade/section when blank.
async function updateResolvedStudentByLRN(){
  if(!studentLrnInput) return;
  const lrn = (studentLrnInput.value || '').trim();
  if(!lrn){
    if(lrnLookupStatus){ lrnLookupStatus.textContent=''; }
    return;
  }
  const s = studentLrnMap.get(lrn);
  if(s){
    // Set resolvedStudent and sync name field if different
    resolvedStudent = s;
    const displayName = buildStudentDisplay(s);
    if(studentNameInput && (!studentNameInput.value.trim() || studentNameInput.value.trim().toLowerCase() !== displayName.toLowerCase())){
      studentNameInput.value = displayName;
    }
    if(gradeSectionInput && (!gradeSectionInput.value.trim())){
      if(s.grade && s.section){ gradeSectionInput.value = `${s.grade}-${s.section}`; }
      else if(s.grade){ gradeSectionInput.value = s.grade; }
    }
    if(lrnLookupStatus){ lrnLookupStatus.textContent = 'LRN found ✔'; lrnLookupStatus.style.color = '#2e7d32'; }
    // refresh name-based status too
    updateResolvedStudent();
  } else {
    if(lrnLookupStatus){ lrnLookupStatus.textContent = 'LRN not found in loaded students.'; lrnLookupStatus.style.color = '#c62828'; }
  }
  if(saveBtn) saveBtn.disabled = !resolvedStudent;
  updateRepeatDisplay();
}

async function updateRepeatDisplay(){
  if(!repeatInfoEl){ return; }
  const violationType = (violationTypeInput?.value || '').trim();
  if(resolvedStudent && violationType){
    const count = await fetchRepeatCount(resolvedStudent.id, violationType);
    if(count === 0) {
      repeatInfoEl.textContent = 'First recorded occurrence of this violation.';
      repeatInfoEl.style.color = '#2e7d32';
    } else {
      repeatInfoEl.textContent = `Previously recorded ${count} time${count>1?'s':''}.`;
      repeatInfoEl.style.color = '#ef6c00';
    }
  } else {
    repeatInfoEl.textContent = '';
  }
}

if (studentNameInput) {
  studentNameInput.addEventListener("input", debounce(()=>{ refreshPastOffenseUI(); updateResolvedStudent(); }, 250));
}
if (violationTypeInput){
  violationTypeInput.addEventListener('change', ()=> updateRepeatDisplay());
  violationTypeInput.addEventListener('input', debounce(updateRepeatDisplay, 250));
}
if(studentLrnInput){
  studentLrnInput.addEventListener('input', debounce(updateResolvedStudentByLRN, 250));
  studentLrnInput.addEventListener('change', updateResolvedStudentByLRN);
}

// Allow other parts (like autocomplete) to set the student programmatically:
document.addEventListener('studentSelected', (e) => {
  const name = e?.detail?.name || '';
  if (name && studentNameInput) {
    studentNameInput.value = name;
  }
  refreshPastOffenseUI();
});

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  window.location.href = "index.html";
});
