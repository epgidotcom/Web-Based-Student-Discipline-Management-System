let violations = [];

// get elements
const violationForm = document.getElementById("violationForm");
const violationTable = document.getElementById("violationTable").querySelector("tbody");
const addViolationBtn = document.getElementById("addViolationBtn");
const violationModal = document.getElementById("violationModal");
const viewModal = document.getElementById("viewModal");
const modalTitle = document.getElementById("modalTitle");

const closeBtns = document.querySelectorAll(".close-btn");

// inputs
const studentNameInput = document.getElementById("studentName");
const violationInput = document.getElementById("violation");
const sanctionInput = document.getElementById("sanction");
const descriptionInput = document.getElementById("description");
const dateInput = document.getElementById("date");
const editIndexInput = document.getElementById("editIndex");

// view modal elements
const viewStudent = document.getElementById("viewStudent");
const viewViolation = document.getElementById("viewViolation");
const viewSanction = document.getElementById("viewSanction");
const viewDescription = document.getElementById("viewDescription");
const viewDate = document.getElementById("viewDate");
const viewEvidenceWrap = document.getElementById("viewEvidenceWrap");
const viewEvidenceBox = document.getElementById("viewEvidence");

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

// Resize to keep files small
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
  ev.preview.innerHTML = "";
  evidenceData.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src; img.className = "evidence-thumb"; img.alt = `Evidence ${i+1}`;
    img.title = "Click to open";
    img.addEventListener("click", () => window.open(src, "_blank"));
    ev.preview.appendChild(img);
  });
  const has = evidenceData.length > 0;
  ev.preview.classList.toggle("is-hidden", !has);
  ev.actions.classList.toggle("is-hidden", !has);
  ev.drop.classList.toggle("is-hidden", has);
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

  // expose to other handlers
  window._evidence = {
    get: () => evidenceData.slice(),
    set: (arr=[]) => { evidenceData = arr.slice(0,3); renderEvidenceThumbs(); },
    clear: clearEvidence,
    hasAny: () => evidenceData.length > 0
  };
}
initEvidenceUploader();

/* ================= Open/Close Modals ================= */
// open add modal
addViolationBtn.addEventListener("click", () => {
  violationForm.reset();
  editIndexInput.value = "";
  modalTitle.textContent = "Add Violation";
  window._evidence.clear();             // reset images
  violationModal.style.display = "block";
});

// close modals
closeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    violationModal.style.display = "none";
    viewModal.style.display = "none";
  });
});

/* ================= Save form ================= */
violationForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const studentName = studentNameInput.value.trim();
  const violation = violationInput.value;
  const sanction = sanctionInput.value;
  const description = descriptionInput.value.trim();
  const date = dateInput.value;

  const violationData = {
    studentName, violation, sanction, description, date,
    evidence: window._evidence.get() // << attach images
  };

  if (editIndexInput.value === "") {
    violations.push(violationData);
  } else {
    violations[editIndexInput.value] = violationData;
  }

  renderTable();
  violationModal.style.display = "none";

  // optional: refresh dashboard
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
      <td>${item.violation}</td>
      <td>${item.sanction}</td>
      <td>${item.date}</td>
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
  viewStudent.textContent = item.studentName;
  viewViolation.textContent = item.violation;
  viewSanction.textContent = item.sanction;
  viewDescription.textContent = item.description || "No description provided.";
  viewDate.textContent = item.date;

  // render evidence thumbs
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

  viewModal.style.display = "block";
};

/* ================= Edit violation ================= */
window.editViolation = function (index) {
  const item = violations[index];

  studentNameInput.value = item.studentName;
  violationInput.value = item.violation;
  sanctionInput.value = item.sanction;
  descriptionInput.value = item.description || "";
  dateInput.value = item.date;
  editIndexInput.value = index;

  // preload evidence
  window._evidence.set(item.evidence || []);

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

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});
