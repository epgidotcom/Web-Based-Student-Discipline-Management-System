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

/* ---- Inputs ---- */
const studentNameInput = document.getElementById("studentName");
const gradeSectionInput= document.getElementById("gradeSection");
const violationTypeInput = document.getElementById("violationType");
const sanctionInput    = document.getElementById("sanction");
const descriptionInput = document.getElementById("description");
const incidentDateInput = document.getElementById("incidentDate");
const editIndexInput   = document.getElementById("editIndex");

/* Optional legacy input */
const violationInput   = document.getElementById("violation");

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
const viewIncidentDate = document.getElementById("viewIncidentDate");
const viewAddedDate    = document.getElementById("viewAddedDate");
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
    img.src = src;
    img.className = "evidence-thumb";
    img.alt = `Evidence ${i+1}`;
    img.title = "Click to enlarge";
    img.addEventListener("click", () => openImagePreview(src));
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

/* ================= Mock Past Offense Store ================= */
const STORAGE_KEY = 'sdms_mock_past_offenses_v1';
const MockPastOffenseStore = {
  _data: null,
  _load() {
    if (this._data) return this._data;
    try {
      this._data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
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
  },
  async updateLastOffense(name, newLabel) {
    const data = this._load();
    const key = Object.keys(data).find(k => k.toLowerCase() === String(name).trim().toLowerCase());
    if (!key) return [];
    if (data[key].length > 0) data[key][data[key].length - 1] = newLabel;
    this._save();
    return data[key].slice();
  }
};
const PastOffenseService = MockPastOffenseStore;

const debounce = (fn, ms = 300) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/* ================= Refresh Past Offense UI ================= */
async function refreshPastOffenseUI() {
  if (!pastOffenseWrap || !pastOffenseList || !pastOffenseEmpty) return;
  const name = (studentNameInput && studentNameInput.value || '').trim();
  if (!name) {
    pastOffenseWrap.classList.add('is-hidden');
    pastOffenseList.innerHTML = '';
    pastOffenseEmpty.textContent = 'No past offenses.';
    return;
  }

  pastOffenseWrap.classList.remove('is-hidden');
  const offenses = await PastOffenseService.getByName(name);
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
  window._evidence?.clear();
  pastOffenseWrap.classList.add('is-hidden');
  pastOffenseList.innerHTML = '';
  pastOffenseEmpty.textContent = 'No past offenses.';
  violationModal.style.display = "flex";
});

closeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    violationModal.style.display = "none";
    viewModal.style.display = "none";
    imagePreviewModal?.classList.remove("is-open");
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
  const incidentDate  = incidentDateInput.value || "";
  const addedDate     = new Date(Date.now() - (new Date()).getTimezoneOffset()*60000).toISOString().slice(0,10);
  const violation     = violationInput ? (violationInput.value || "").trim() : "";

  const parts = [];
  if (description) parts.push(description);
  if (violationType) parts.push(violationType);
  if (sanction) parts.push(`Sanction: ${sanction}`);
  const label = parts.join(" | ") + (incidentDate ? ` — ${incidentDate}` : "");

  let offensesAfter = [];
  if (studentName) {
    if (editIndexInput.value === "") {
      offensesAfter = await PastOffenseService.addOffense(studentName, label, incidentDate);
    } else {
      offensesAfter = await PastOffenseService.updateLastOffense(studentName, label);
    }
  }

  const violationData = {
    studentName,
    gradeSection,
    pastOffense: offensesAfter.length ? offensesAfter.join(' • ') : 'No past offenses.',
    incidentDate,
    addedDate,
    description,
    violationType,
    sanction,
    violation,
    evidence: window._evidence?.get ? window._evidence.get() : []
  };

  if (editIndexInput.value === "") {
    violations.push(violationData);
  } else {
    violations[editIndexInput.value] = violationData;
  }

  renderTable();
  violationModal.style.display = "none";
  window.dispatchEvent(new Event('sdms:data-changed'));
});

/* ================= Render table ================= */
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
      <td>${item.incidentDate || '-'}</td>
      <td>${item.violationType || '-'}</td>
      <td>${item.sanction || '-'}</td>
      <td>${item.addedDate || '-'}</td>
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
  viewStudent.textContent = item.studentName || '-';
  viewGradeSection.textContent = item.gradeSection || '-';
  const offenseText = item.pastOffense || 'None';
  viewPastOffense.textContent = offenseText;
  viewPastOffenseRow.classList.toggle('is-hidden', !offenseText || offenseText === 'None');
  viewViolationType.textContent = item.violationType || '-';
  viewSanction.textContent = item.sanction || '-';
  viewDescription.textContent = item.description || "No description provided.";
  viewIncidentDate.textContent = item.incidentDate || '-';
  viewAddedDate.textContent = item.addedDate || '-';

  viewEvidenceBox.innerHTML = "";
  if (item.evidence && item.evidence.length) {
    item.evidence.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.className = "evidence-thumb";
      img.alt = `Evidence ${i+1}`;
      img.title = "Click to enlarge";
      img.addEventListener("click", () => openImagePreview(src));
      viewEvidenceBox.appendChild(img);
    });
    viewEvidenceWrap.classList.remove("is-hidden");
  } else {
    viewEvidenceWrap.classList.add("is-hidden");
  }
  viewModal.style.display = "block";
};

/* ================= Edit violation ================= */
window.editViolation = function (index) {
  const item = violations[index];
  studentNameInput.value    = item.studentName || '';
  gradeSectionInput.value   = item.gradeSection || '';
  violationTypeInput.value  = item.violationType || '';
  sanctionInput.value       = item.sanction || '';
  descriptionInput.value    = item.description || '';
  incidentDateInput.value   = item.incidentDate || '';
  editIndexInput.value      = index;
  refreshPastOffenseUI();
  window._evidence?.set(item.evidence || []);
  modalTitle.textContent = "Edit Violation";
  violationModal.style.display = "flex";
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

/* ================= Image Preview Feature ================= */
const imagePreviewModal = document.getElementById("imagePreviewModal");
const imagePreviewFull  = document.getElementById("imagePreviewFull");
const imagePreviewClose = document.getElementById("imagePreviewClose");

window.openImagePreview = function (src) {
  if (!imagePreviewModal || !imagePreviewFull) return;
  imagePreviewFull.src = src;
  imagePreviewModal.classList.add("is-open");
};

if (imagePreviewClose) {
  imagePreviewClose.addEventListener("click", () => {
    imagePreviewModal.classList.remove("is-open");
  });
}

if (imagePreviewModal) {
  imagePreviewModal.addEventListener("click", (e) => {
    if (e.target === imagePreviewModal) {
      imagePreviewModal.classList.remove("is-open");
    }
  });
}

/* ================= Init ================= */
renderTable();
if (pastOffenseWrap) pastOffenseWrap.classList.add('is-hidden');
if (studentNameInput) studentNameInput.addEventListener("input", debounce(refreshPastOffenseUI, 250));

document.addEventListener('studentSelected', (e) => {
  const name = e?.detail?.name || '';
  if (name && studentNameInput) {
    studentNameInput.value = name;
  }
  refreshPastOffenseUI();
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  window.location.href = "index.html";
});
