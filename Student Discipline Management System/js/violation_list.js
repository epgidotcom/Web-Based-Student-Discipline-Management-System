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
const violationInput = document.getElementById("violation");  // now select
const sanctionInput = document.getElementById("sanction");    // now select
const descriptionInput = document.getElementById("description"); // ✅ NEW
const dateInput = document.getElementById("date");
const editIndexInput = document.getElementById("editIndex");

// view modal elements
const viewStudent = document.getElementById("viewStudent");
const viewViolation = document.getElementById("viewViolation");
const viewSanction = document.getElementById("viewSanction");
const viewDescription = document.getElementById("viewDescription"); // ✅ NEW
const viewDate = document.getElementById("viewDate");

// open ddd modal
addViolationBtn.addEventListener("click", () => {
  violationForm.reset();
  editIndexInput.value = "";
  modalTitle.textContent = "Add Violation";
  violationModal.style.display = "block";
});

// close modals
closeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    violationModal.style.display = "none";
    viewModal.style.display = "none";
  });
});

// save form
violationForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const studentName = studentNameInput.value;
  const violation = violationInput.value;
  const sanction = sanctionInput.value;
  const description = descriptionInput.value; // ✅ NEW
  const date = dateInput.value;

  const violationData = { studentName, violation, sanction, description, date }; // ✅ include description

  if (editIndexInput.value === "") {
    violations.push(violationData); // Add new
  } else {
    violations[editIndexInput.value] = violationData; // Update existing
  }

  renderTable();
  violationModal.style.display = "none";
});

// render table
function renderTable() {
  violationTable.innerHTML = "";

  violations.forEach((item, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.studentName}</td>
      <td>${item.violation}</td>
      <td>${item.sanction}</td>
      <td>${item.date}</td>
      <td>
        <button onclick="viewViolationDetails(${index})"><i class="fa fa-eye"></i></button>
        <button onclick="editViolation(${index})"><i class="fa fa-edit"></i></button>
        <button onclick="deleteViolation(${index})"><i class="fa fa-trash"></i></button>
      </td>
    `;

    violationTable.appendChild(row);
  });
}

// view details
window.viewViolationDetails = function (index) {
  const item = violations[index];
  viewStudent.textContent = item.studentName;
  viewViolation.textContent = item.violation;
  viewSanction.textContent = item.sanction;
  viewDescription.textContent = item.description || "No description provided."; // ✅ NEW
  viewDate.textContent = item.date;

  viewModal.style.display = "block";
};

// edit violation
window.editViolation = function (index) {
  const item = violations[index];

  studentNameInput.value = item.studentName;
  violationInput.value = item.violation;  // auto-selects
  sanctionInput.value = item.sanction;    // auto-selects
  descriptionInput.value = item.description || ""; // ✅ NEW
  dateInput.value = item.date;
  editIndexInput.value = index;

  modalTitle.textContent = "Edit Violation";
  violationModal.style.display = "block";
};

// delete violation
window.deleteViolation = function (index) {
  if (confirm("Are you sure you want to delete this violation?")) {
    violations.splice(index, 1);
    renderTable();
  }
};

// search function
window.searchViolation = function () {
  const filter = document.getElementById("searchInput").value.toLowerCase();
  const rows = violationTable.getElementsByTagName("tr");

  Array.from(rows).forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? "" : "none";
  });
};
