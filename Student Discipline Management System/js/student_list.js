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
const viewBirthdate = document.getElementById("viewBirthdate");
const viewAddress = document.getElementById("viewAddress");
const viewGrade = document.getElementById("viewGrade");
const viewSection = document.getElementById("viewSection");
const viewParent = document.getElementById("viewParent");

// Open Add Student Modal
addStudentBtn.onclick = () => {
  studentForm.reset();
  editIndex.value = "";
  modalTitle.textContent = "Add Student";
  studentModal.style.display = "flex";
};

// Close Modals
closeBtns.forEach(btn => btn.onclick = () => {
  studentModal.style.display = "none";
  viewModal.style.display = "none";
});

// Save Student
studentForm.onsubmit = (e) => {
  e.preventDefault();
  const student = {
    lrn: document.getElementById("lrn").value,
    firstName: document.getElementById("firstName").value,
    middleName: document.getElementById("middleName").value,
    lastName: document.getElementById("lastName").value,
    birthdate: document.getElementById("birthdate").value,
    address: document.getElementById("address").value,
    grade: document.getElementById("grade").value,
    section: document.getElementById("section").value,
    parentContact: document.getElementById("parentContact").value
  };

  if (editIndex.value === "") {
    students.push(student);
  } else {
    students[editIndex.value] = student;
  }

  renderTable();
  studentModal.style.display = "none";
};

// Render Table
function renderTable() {
  studentTable.innerHTML = "";
  students.forEach((s, i) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.lrn}</td>
      <td>${s.firstName} ${s.middleName} ${s.lastName}</td>
      <td>${s.birthdate}</td>
      <td>${s.grade}</td>
      <td>${s.section}</td>
      <td>
        <button onclick="viewStudent(${i})"><i class="fa fa-eye"></i></button>
        <button onclick="editStudent(${i})"><i class="fa fa-edit"></i></button>
        <button onclick="deleteStudent(${i})"><i class="fa fa-trash"></i></button>
      </td>
    `;
    studentTable.appendChild(row);
  });
}

// View Student
function viewStudent(i) {
  const s = students[i];
  viewLRN.textContent = s.lrn;
  viewName.textContent = `${s.firstName} ${s.middleName} ${s.lastName}`;
  viewBirthdate.textContent = s.birthdate;
  viewAddress.textContent = s.address;
  viewGrade.textContent = s.grade;
  viewSection.textContent = s.section;
  viewParent.textContent = s.parentContact;
  viewModal.style.display = "flex";
}

// Edit Student
function editStudent(i) {
  const s = students[i];
  document.getElementById("lrn").value = s.lrn;
  document.getElementById("firstName").value = s.firstName;
  document.getElementById("middleName").value = s.middleName;
  document.getElementById("lastName").value = s.lastName;
  document.getElementById("birthdate").value = s.birthdate;
  document.getElementById("address").value = s.address;
  document.getElementById("grade").value = s.grade;
  document.getElementById("section").value = s.section;
  document.getElementById("parentContact").value = s.parentContact;
  editIndex.value = i;
  modalTitle.textContent = "Edit Student";
  studentModal.style.display = "flex";
}

// Delete Student
function deleteStudent(i) {
  if (confirm("Are you sure you want to delete this student?")) {
    students.splice(i, 1);
    renderTable();
  }
}

// Search Student
function searchStudent() {
  let input = document.getElementById("searchInput").value.toLowerCase();
  let rows = document.querySelectorAll("#studentTable tbody tr");

  rows.forEach(row => {
    let text = row.innerText.toLowerCase();
    row.style.display = text.includes(input) ? "" : "none";
  });
}

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});
