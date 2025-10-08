// ================================
// Appeals Admin Page Script (Clean Version)
// ================================

document.addEventListener("DOMContentLoaded", () => {
  const appealsTable = document.getElementById("appealsTable");
  const searchInput = document.getElementById("searchInput");

  const appealModal = document.getElementById("appealModal");
  const closeModalBtn = document.getElementById("closeAppealModal");
  const approveBtn = document.getElementById("approveAppeal");
  const rejectBtn = document.getElementById("rejectAppeal");

  // View fields inside modal
  const viewStudentName = document.getElementById("viewStudentName");
  const viewSection = document.getElementById("viewSection");
  const viewViolation = document.getElementById("viewViolation");
  const viewReason = document.getElementById("viewReason");
  const viewStatus = document.getElementById("viewStatus");
  const viewDate = document.getElementById("viewDate");

  // ================================
  // Load appeals (localStorage or empty)
  // ================================
  let appeals = JSON.parse(localStorage.getItem("appealsData")) || [];

  // Ensure all loaded appeals have valid status
  appeals = appeals.map(a => ({
    ...a,
    status: a.status || "pending"
  }));

  localStorage.setItem("appealsData", JSON.stringify(appeals));

  // ================================
  // Render Appeals Table
  // ================================
  function renderAppeals(list) {
    const tbody = appealsTable.querySelector("tbody");
    tbody.innerHTML = "";

    if (!list.length) {
      tbody.innerHTML = `
        <tr><td colspan="8" style="text-align:center;color:#6b7280;">No appeals found.</td></tr>
      `;
      return;
    }

    list.forEach(a => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${a.lrn}</td>
        <td>${a.date}</td>
        <td>${a.student}</td>
        <td>${a.section}</td>
        <td>${a.violation}</td>
        <td>${a.reason}</td>
        <td><span class="status ${a.status}">${a.status}</span></td>
        <td>
          <button class="action-btn approve-btn" data-id="${a.id}" title="Approve">
            <i class="fa fa-check"></i>
          </button>
          <button class="action-btn reject-btn" data-id="${a.id}" title="Reject">
            <i class="fa fa-times"></i>
          </button>
          <button class="action-btn view-btn" data-id="${a.id}" title="View">
            <i class="fa fa-eye"></i>
          </button>
          <button class="action-btn delete-btn" data-id="${a.id}" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  // ================================
  // Search Functionality
  // ================================
  function searchAppeal() {
    const q = searchInput.value.toLowerCase();
    const filtered = appeals.filter(a =>
      Object.values(a).some(v => String(v).toLowerCase().includes(q))
    );
    renderAppeals(filtered);
  }

  // ================================
  // Modal Functions
  // ================================
  function openModal(appeal) {
    viewStudentName.textContent = appeal.student;
    viewSection.textContent = appeal.section;
    viewViolation.textContent = appeal.violation;
    viewReason.textContent = appeal.reason;
    viewStatus.textContent = appeal.status.toUpperCase();
    viewDate.textContent = appeal.date;

    approveBtn.dataset.id = appeal.id;
    rejectBtn.dataset.id = appeal.id;

    appealModal.classList.add("is-open");
  }

  function closeModal() {
    appealModal.classList.remove("is-open");
  }

  // ================================
  // Update Appeal Status
  // ================================
  function updateStatus(id, newStatus) {
    appeals = appeals.map(a =>
      a.id === id ? { ...a, status: newStatus } : a
    );
    localStorage.setItem("appealsData", JSON.stringify(appeals));
    renderAppeals(appeals);
    closeModal();
  }

  // ================================
  // Event Listeners
  // ================================
  appealsTable.addEventListener("click", e => {
    const button = e.target.closest("button");
    if (!button) return;

    const id = parseInt(button.dataset.id);
    const appeal = appeals.find(a => a.id === id);
    if (!appeal) return;

    if (button.classList.contains("view-btn")) {
      openModal(appeal);
    } else if (button.classList.contains("approve-btn")) {
      updateStatus(id, "approved");
    } else if (button.classList.contains("reject-btn")) {
      updateStatus(id, "rejected");
    } else if (button.classList.contains("delete-btn")) {
      // Confirm then delete
      if (!confirm('Delete this appeal? This action cannot be undone.')) return;
      appeals = appeals.filter(x => x.id !== id);
      localStorage.setItem('appealsData', JSON.stringify(appeals));
      renderAppeals(appeals);
    }
  });

  // Search
  searchInput.addEventListener("keyup", searchAppeal);

  // Modal close handlers
  closeModalBtn.addEventListener("click", closeModal);
  appealModal.addEventListener("click", e => {
    if (e.target === appealModal) closeModal();
  });

  // Modal approve/reject buttons
  approveBtn.addEventListener("click", e => {
    updateStatus(parseInt(e.target.dataset.id), "approved");
  });
  rejectBtn.addEventListener("click", e => {
    updateStatus(parseInt(e.target.dataset.id), "rejected");
  });

  // ================================
  // Initial Render
  // ================================
  renderAppeals(appeals);
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});