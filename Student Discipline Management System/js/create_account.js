document.addEventListener("DOMContentLoaded", () => {
  // Require admin/teacher role
  if(!window.SDMSAuth?.requireRole(['Admin','Teacher'])) return;
  const roleSelect = document.getElementById("role");
  const gradeGroup = document.getElementById("gradeGroup");
  const form = document.getElementById("accountForm");
  const tableBody = document.querySelector('#accountsTable tbody');
  const msg = document.getElementById('accountMsg');
  const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '';

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // Toggle grade field based on role
  roleSelect.addEventListener("change", () => {
    if (roleSelect.value === "Student") {
      gradeGroup.style.display = "block";
      document.getElementById("grade").setAttribute("required", "true");
    } else {
      gradeGroup.style.display = "none";
      document.getElementById("grade").removeAttribute("required");
    }
  });

  async function loadAccounts(){
    try{
      msg.textContent = 'Loading accounts…';
      const res = await fetch(`${API_BASE}/api/accounts`, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      renderTable(list);
      msg.textContent = `${list.length} account(s)`;
    }catch(err){
      console.error(err);
      msg.textContent = 'Failed to load accounts.';
    }
  }

  function renderTable(list){
    if (!tableBody) return;
    tableBody.innerHTML = '';
    (list || []).forEach(acc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${acc.fullName || ''}</td>
        <td>${acc.username || ''}</td>
        <td>${acc.email || ''}</td>
        <td>${acc.role || ''}</td>
        <td>${acc.role === 'Student' ? (acc.grade || '') : ''}</td>
        <td>
          <button class="action-btn delete-btn" data-id="${acc.id}" title="Delete"><i class="fa fa-trash"></i></button>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // attach delete handlers
    tableBody.querySelectorAll('button.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!id) return;
        if (!confirm('Delete this account?')) return;
        try{
          const res = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await loadAccounts();
        }catch(err){
          console.error(err);
          alert('Failed to delete account.');
        }
      });
    });
  }

  // Handle form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const role = document.getElementById("role").value;
    const grade = document.getElementById("grade").value;

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    const newUser = {
      fullName,
      email,
      username,
      password,
      role,
      ...(role === "Student" && { grade }),
    };

    // Create via API
    try{
      const res = await fetch(`${API_BASE}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(newUser)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadAccounts();
      alert(`${role} account created successfully!`);
      form.reset();
      gradeGroup.style.display = "none";
    }catch(err){
      console.error(err);
      alert('Failed to create account.');
    }
  });

  function authHeaders(){
    const token = window.SDMSAuth?.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // initial load (may fail if unauthorized)
  loadAccounts();
});

  // Logout 
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
