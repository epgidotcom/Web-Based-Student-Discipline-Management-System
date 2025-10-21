// ================================
// Student Appeals Page Script
// ================================

document.addEventListener("DOMContentLoaded", () => {
  loadStudentProfile();
  loadAppeals();
  setupForm();
});

// ================================
// Load Student Profile (Placeholder)
// ================================
function loadStudentProfile() {
  document.getElementById("studentName").textContent = "Juan Dela Cruz";
  document.getElementById("studentSection").textContent = "Grade 9 • Emerald";
  document.getElementById("studentAvatar").src = "images/mpnag_logo.png";
}

// ================================
// Load Appeals (from localStorage)
// ================================
function loadAppeals() {
  const appeals = JSON.parse(localStorage.getItem("appealsData")) || [];
  renderAppeals(appeals);
}

// ================================
// Render Appeals in Table
// ================================
function renderAppeals(appeals) {
  const tbody = document.getElementById("appealRows");
  tbody.innerHTML = "";

  if (!appeals.length) {
    tbody.innerHTML = `
      <tr><td colspan="4" style="text-align:center; color:#888;">No appeals found.</td></tr>
    `;
    return;
  }

  appeals.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.date}</td>
      <td>${a.violation}</td>
      <td>${a.reason}</td>
      <td><span class="status ${a.status}">${a.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ================================
// Submit Appeal Form
// ================================
function setupForm() {
  const form = document.getElementById("appealForm");
  form.addEventListener("submit", e => {
    e.preventDefault();

    const violation = document.getElementById("violationText").value.trim();
    const reason = document.getElementById("appealReason").value.trim();

    if (!violation || !reason) {
      alert("Please fill out all fields before submitting.");
      return;
    }

    const appeals = JSON.parse(localStorage.getItem("appealsData")) || [];

    // Create new appeal record
    const newAppeal = {
      id: Date.now(),
      lrn: "1234567890", // (Replace with real logged-in student's LRN later)
      student: "Juan Dela Cruz",
      section: "Grade 9 - Emerald",
      violation,
      reason,
      date: new Date().toISOString().split("T")[0],
      status: "pending"
    };

    appeals.push(newAppeal);
    localStorage.setItem("appealsData", JSON.stringify(appeals));

    alert("✅ Appeal submitted successfully!");
    form.reset();
    renderAppeals(appeals);
  });
}
