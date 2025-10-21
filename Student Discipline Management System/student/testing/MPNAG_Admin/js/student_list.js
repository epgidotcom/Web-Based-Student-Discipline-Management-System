let students = [];

const studentTable = document.querySelector("#studentTable tbody");
const addStudentBtn = document.getElementById("addStudentBtn");
const studentModal = document.getElementById("studentModal");
const viewModal = document.getElementById("viewModal");
const closeBtns = document.querySelectorAll(".close-btn");
const studentForm = document.getElementById("studentForm");

const modalTitle = document.getElementById("modalTitle");
const editIndex = document.getElementById("editIndex");

const viewLRN = document.getElementById("viewLRN");
const viewName = document.getElementById("viewName");
const viewAge = document.getElementById("viewAge");
const viewGrade = document.getElementById("viewGrade");
const viewSection = document.getElementById("viewSection");
const viewParent = document.getElementById("viewParent");
const viewAvatar = document.getElementById("viewAvatar");
const viewInitials = document.getElementById("viewInitials");

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
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/jpeg", quality);
}

/* =================== Uploader UI =================== */
const photoInput = document.getElementById("photoInput");
const photoPreview = document.getElementById("photoPreview");
const photoDrop = document.getElementById("photoDrop");
const photoChoose = document.getElementById("photoChoose");
const photoActions = document.getElementById("photoActions");
const photoChange = document.getElementById("photoChange");
const photoRemove = document.getElementById("photoRemove");

function resetUploader() {
  if (!photoPreview) return;
  photoPreview.removeAttribute("src");
  delete photoPreview.dataset.dataurl;
  photoPreview.classList.add("is-hidden");
  photoActions.classList.add("is-hidden");
  photoDrop.classList.remove("is-hidden");
}

async function setPreviewFromFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    alert("Please choose a JPG or PNG image.");
    return;
  }
  const dataUrl = await fileToDataURL(file, 512, 0.85);
  photoPreview.src = dataUrl;
  photoPreview.dataset.dataurl = dataUrl;
  photoPreview.classList.remove("is-hidden");
  photoActions.classList.remove("is-hidden");
  photoDrop.classList.add("is-hidden");
}

photoChoose?.addEventListener("click", () => photoInput.click());
photoChange?.addEventListener("click", () => photoInput.click());
photoRemove?.addEventListener("click", resetUploader);
photoInput?.addEventListener("change", async (e) => setPreviewFromFile(e.target.files?.[0]));

// drag & drop
["dragenter","dragover"].forEach(ev => photoDrop?.addEventListener(ev, (e)=>{ e.preventDefault(); photoDrop.classList.add("dragover"); }));
["dragleave","drop"].forEach(ev => photoDrop?.addEventListener(ev, (e)=>{ e.preventDefault(); photoDrop.classList.remove("dragover"); }));
photoDrop?.addEventListener("drop", async (e) => setPreviewFromFile(e.dataTransfer.files?.[0]));

/* =================== Modal control =================== */
// Open Add Student Modal
addStudentBtn.onclick = () => {
  studentForm.reset();
  editIndex.value = "";
  modalTitle.textContent = "Add Student";
  resetUploader();
  studentModal.style.display = "flex";
};

// Close Modals
closeBtns.forEach(btn => btn.onclick = () => {
  studentModal.style.display = "none";
  viewModal.style.display = "none";
});

/* =================== Helpers =================== */
function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/* =================== Save Student =================== */
studentForm.onsubmit = (e) => {
  e.preventDefault();

  const prevLRN = editIndex.value === "" ? null : students[editIndex.value]?.lrn;

  // if editing, keep existing addedDate; if new, set to today
  const existingAdded = editIndex.value === "" ? null : (students[editIndex.value]?.addedDate || null);
  const computedAddedDate = existingAdded || todayISO();

  const ageRaw = document.getElementById("age").value;
  const student = {
    lrn: document.getElementById("lrn").value.trim(),
    firstName: document.getElementById("firstName").value.trim(),
    middleName: document.getElementById("middleName").value.trim(),
    lastName: document.getElementById("lastName").value.trim(),
    age: ageRaw === "" ? "" : parseInt(ageRaw, 10),
    grade: document.getElementById("grade").value,
    section: document.getElementById("section").value.trim(),
    parentContact: document.getElementById("parentContact").value.trim(),
    addedDate: computedAddedDate  // NEW
  };

  // Save/move photo in storage by LRN
  const uploadedDataUrl = photoPreview?.dataset?.dataurl;
  if (editIndex.value === "") {
    if (uploadedDataUrl) StudentPhotos.save(student.lrn, uploadedDataUrl);
    students.push(student);
  } else {
    if (prevLRN && prevLRN !== student.lrn) {
      StudentPhotos.move(prevLRN, student.lrn);
    }
    if (uploadedDataUrl) StudentPhotos.save(student.lrn, uploadedDataUrl);
    students[editIndex.value] = student;
  }

  renderTable();
  studentModal.style.display = "none";
  window.dispatchEvent(new Event('sdms:data-changed'));
};

/* =================== Render Table =================== */
function initialsFromName(name) {
  return name.split(/\s+/).filter(Boolean).map(s => s[0]).join("").slice(0,2).toUpperCase() || "?";
}

function renderTable() {
  studentTable.innerHTML = "";
  if (!students.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="7" style="text-align:center;color:#6b7280;">No data</td>`;
    studentTable.appendChild(row);
    return;
  }

  students.forEach((s, i) => {
    const row = document.createElement("tr");
    const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g, " ").trim();
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
      <td>${s.age ?? ""}</td>
      <td>${s.grade}</td>
      <td>${s.section}</td>
      <td>${s.addedDate || ""}</td> <!-- NEW -->
      <td>
        <button class="action-btn" onclick="viewStudent(${i})" title="View"><i class="fa fa-eye"></i></button>
        <button class="action-btn edit-btn" onclick="editStudent(${i})" title="Edit"><i class="fa fa-edit"></i></button>
        <button class="action-btn delete-btn" onclick="deleteStudent(${i})" title="Delete"><i class="fa fa-trash"></i></button>
      </td>
    `;
    studentTable.appendChild(row);
  });
}

/* =================== View Student =================== */
function viewStudent(i) {
  const s = students[i];
  const fullName = `${s.firstName} ${s.middleName} ${s.lastName}`.replace(/\s+/g, " ").trim();

  viewLRN.textContent = s.lrn;
  viewName.textContent = fullName;
  viewAge.textContent = s.age === "" || s.age == null ? "" : `${s.age} yrs`;
  viewGrade.textContent = s.grade;
  viewSection.textContent = s.section;
  viewParent.textContent = s.parentContact;

  const photo = StudentPhotos.get(s.lrn);
  if (photo) {
    viewAvatar.src = photo;
    viewAvatar.classList.remove("is-hidden");
    viewInitials.classList.add("is-hidden");
  } else {
    viewAvatar.classList.add("is-hidden");
    viewInitials.textContent = initialsFromName(fullName);
    viewInitials.classList.remove("is-hidden");
  }

  viewModal.style.display = "flex";
}

/* =================== Edit Student =================== */
function editStudent(i) {
  const s = students[i];
  document.getElementById("lrn").value = s.lrn;
  document.getElementById("firstName").value = s.firstName;
  document.getElementById("middleName").value = s.middleName;
  document.getElementById("lastName").value = s.lastName;
  document.getElementById("age").value = s.age ?? "";
  document.getElementById("grade").value = s.grade;
  document.getElementById("section").value = s.section;
  document.getElementById("parentContact").value = s.parentContact;
  editIndex.value = i;
  modalTitle.textContent = "Edit Student";

  const photo = StudentPhotos.get(s.lrn);
  if (photo) {
    photoPreview.src = photo;
    photoPreview.dataset.dataurl = photo;
    photoPreview.classList.remove("is-hidden");
    photoActions.classList.remove("is-hidden");
    photoDrop.classList.add("is-hidden");
  } else {
    resetUploader();
  }

  studentModal.style.display = "flex";
}

/* =================== Delete Student =================== */
function deleteStudent(i) {
  if (confirm("Are you sure you want to delete this student?")) {
    const s = students[i];
    StudentPhotos.remove(s.lrn);
    students.splice(i, 1);
    renderTable();
    window.dispatchEvent(new Event('sdms:data-changed'));
  }
}

/* =================== Search Student =================== */
function searchStudent() {
  let input = document.getElementById("searchInput").value.toLowerCase();
  let rows = document.querySelectorAll("#studentTable tbody tr");

  rows.forEach(row => {
    let text = row.innerText.toLowerCase();
    row.style.display = text.includes(input) ? "" : "none";
  });
}

/* =================== Init =================== */
renderTable();

// expose functions to window
window.viewStudent = viewStudent;
window.editStudent = editStudent;
window.deleteStudent = deleteStudent;
window.searchStudent = searchStudent;

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});