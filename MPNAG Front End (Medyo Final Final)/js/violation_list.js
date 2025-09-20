/* ================= In-memory list for current page ================= */
let violations = [];

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

/* ---- Optional legacy input (if your form still has it) ---- */
const violationInput   = document.getElementById("violation"); // kept for compatibility (not shown in table)

/* ---- Past Offense UI ---- */
const pastOffenseWrap   = document.getElementById("pastOffenseWrap");
const pastOffenseList   = document.getElementById("pastOffenseList");
const pastOffenseEmpty  = document.getElementById("pastOffenseEmpty");

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

/* ================= Past Offense temporary data (mock) =================
   - Persists in localStorage for demo
   - Swap to backend by setting USE_API = true and wiring endpoints
======================================================================= */
const USE_API  = false;
const API_BASE = '/api';
const STORAGE_KEY = 'sdms_mock_past_offenses_v1';

const MockPastOffenseStore = {
  _data: null,
  _load() {
    if (this._data) return this._data;
    try {
      this._data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        'Juan Dela Cruz': [
          'Tardiness — 2025-08-01',
          'Improper Uniform — 2025-09-10',
        ],
        'Maria Santos': [],
        'Hee, Wael N': ['Not Wearing Uniform — 2025-09-20'],
      };
    } catch { this._data = {}; }
    return this._data;
  },
  _save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data)); },
  async getByName(name) {
    const data = this._load();
    const key = Object.keys(data).find(k => k.toLowerCase() === String(name).trim().toLowerCase());
    return key ? data[key].slice() : [];
  },
  async addOffense(name, label) {
    const data = this._load();
    const key = Object.keys(data).find(k => k.toLowerCase() === String(name).trim().toLowerCase()) || name.trim();
    data[key] = data[key] || [];
    data[key].push(label);
    this._save();
    return data[key].slice();
  }
};

const ApiPastOffenseStore = {
  async getByName(name) {
    const res = await fetch(`${API_BASE}/past-offenses?name=${encodeURIComponent(name)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },
  async addOffense(name, label, dateISO) {
    const res = await fetch(`${API_BASE}/past-offenses`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, label, date: dateISO })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
};

const PastOffenseService = USE_API ? ApiPastOffenseStore : MockPastOffenseStore;

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

  // Get history (mock/localStorage for now)
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
});

closeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    violationModal.style.display = "none";
    viewModal.style.display = "none";
  });
});

/* ================= Save form ================= */
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

  if (editIndexInput.value === "") {
    violations.push(violationData);
  } else {
    violations[editIndexInput.value] = violationData;
  }

  // Update mock store so history appears next time
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

  renderTable();
  violationModal.style.display = "none";

  // optional: refresh dashboard
  window.dispatchEvent(new Event('sdms:data-changed'));
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
    row.innerHTML = `
      <td>${item.studentName} ${paperclip}</td>
      <td>${item.gradeSection || '-'}</td>
      <td>${item.pastOffense || 'None'}</td>
      <td>${item.date || '-'}</td>
      <td>${item.description || '—'}</td>
      <td>${item.violationType || '-'}</td>
      <td>${item.sanction || '-'}</td>
      <td>
        <button onclick="viewViolationDetails(${index})" title="View"><i class="fa fa-eye"></i></button>
        <button onclick="editViolation(${index})" title="Edit"><i class="fa fa-edit"></i></button>
        <button onclick="deleteViolation(${index})" title="Delete"><i class="fa fa-trash"></i></button>
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

  // Update Past Offense UI for this student (and show the block)
  refreshPastOffenseUI();

  // preload evidence
  window._evidence?.set(item.evidence || []);

  modalTitle.textContent = "Edit Violation";
  violationModal.style.display = "block";
};

/* ================= Delete violation ================= */
window.deleteViolation = function (index) {
  if (confirm("Are you sure you want to delete this violation?")) {
    violations.splice(index, 1);
    renderTable();
    window.dispatchEvent(new Event('sdms:data-changed'));
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

/* ================= Init ================= */
renderTable();

// Hide Past Offense on load
if (pastOffenseWrap) pastOffenseWrap.classList.add('is-hidden');
if (pastOffenseSelect) pastOffenseSelect.value = 'None';
if (pastOffenseStatus) pastOffenseStatus.textContent = 'No past offenses.';

// Show/refresh past offense after typing student name
if (studentNameInput) {
  studentNameInput.addEventListener("input", debounce(refreshPastOffenseUI, 250));
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
