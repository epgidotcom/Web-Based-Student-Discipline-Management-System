document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("role");
  const gradeGroup = document.getElementById("gradeGroup");
  const form = document.getElementById("accountForm");
  const tableBody = document.querySelector('#accountsTable tbody');
  const msg = document.getElementById('accountMsg');
  const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '';

  const gradeField = document.getElementById("grade");
  const sectionGroup = document.getElementById("sectionGroup");
  const sectionField = document.getElementById("section");
  const lrnGroup = document.getElementById("lrnGroup");
  const lrnField = document.getElementById("lrn");
  const ageGroup = document.getElementById("ageGroup");
  const ageField = document.getElementById("age");

  const updateGradeVisibility = (value) => {
    if (!gradeGroup) return;
    if (value === "Student") {
      gradeGroup.style.display = "block";
      gradeField?.setAttribute("required", "true");
      // show Section
      if (sectionGroup) sectionGroup.style.display = "block";
      sectionField?.setAttribute("required", "true");
      // show LRN
      if (lrnGroup) lrnGroup.style.display = "block";
      lrnField?.setAttribute("required", "true");
      // show Age
      if (ageGroup) ageGroup.style.display = "block";
      ageField?.setAttribute("required", "true");
    } else {
      gradeGroup.style.display = "none";
      gradeField?.removeAttribute("required");
      // hide Section
      if (sectionGroup) sectionGroup.style.display = "none";
      sectionField?.removeAttribute("required");
      // hide LRN
      if (lrnGroup) lrnGroup.style.display = "none";
      lrnField?.removeAttribute("required");
      // hide Age
      if (ageGroup) ageGroup.style.display = "none";
      ageField?.removeAttribute("required");
    }
  };

  updateGradeVisibility(roleSelect?.value || "");
  roleSelect?.addEventListener("change", () => updateGradeVisibility(roleSelect.value));

  const authUser = window.SDMSAuth?.getUser?.();
  const role = (authUser?.role || '').toLowerCase();
  const allowedRoles = ['admin', 'teacher'];
  const hasAccess = allowedRoles.includes(role);

  if (!hasAccess) {
    console.warn('[Accounts] Restricted area — no authenticated admin/teacher detected. Showing read-only view.');
    if (msg) {
      msg.textContent = 'Please log in as an Administrator or Teacher to manage accounts.';
      msg.classList.add('warn');
    }
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      alert('Please log in as an Administrator or Teacher to submit changes.');
    });
    return;
  }


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
        <td>${acc.age ?? ''}</td>
        <td>${acc.role === 'Student' ? ((acc.grade || '') + (acc.section ? (' / ' + acc.section) : '') + (acc.lrn ? (' / ' + acc.lrn) : '')) : ''}</td>
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
    const section = document.getElementById("section").value.trim();
    const lrn = document.getElementById("lrn").value.trim();
    const age = document.getElementById("age") ? document.getElementById("age").value.trim() : '';

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
      ...(role === "Student" && { grade, section, lrn, age: age === '' ? null : Number(age) }),
    };

    // Create via API
    try{

      const test = JSON.stringify(newUser);
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
      if (sectionGroup) sectionGroup.style.display = "none";
      if (lrnGroup) lrnGroup.style.display = "none";
      if (ageGroup) ageGroup.style.display = "none";
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