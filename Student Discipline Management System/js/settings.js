document.addEventListener("DOMContentLoaded", async () => {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const FORCED_API_BASE = isLocal ? 'http://localhost:3000' : ((window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '');
  const API_BASE = FORCED_API_BASE || (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || window.SDMS_API_BASE || window.API_BASE || '';
  const toast = document.getElementById('toast');

  // ========== Auth Headers ==========
  function authHeaders() {
    try {
      const auth = JSON.parse(localStorage.getItem('sdms_auth_v1') || '{}');
      return {
        'Content-Type': 'application/json',
        ...(auth.token && { 'Authorization': `Bearer ${auth.token}` })
      };
    } catch (_) {
      return { 'Content-Type': 'application/json' };
    }
  }

  // ========== Toast Notification ==========
  function showToast(message, type = 'success', duration = 3000) {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
          toast.classList.remove('show', 'hide', type);
        }, 300);
      }, duration);
    }
  }

  // ========== Tab Switching (event delegation) ==========
  const tabsContainer = document.querySelector('.settings-tabs');
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      e.preventDefault();

      // Remove active from all tabs and contents
      tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      // Add active to clicked tab and its content
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      const tabContent = document.getElementById(`${tabId}-tab`);
      if (tabContent) tabContent.classList.add('active');
    });
  }

  // ========== VIOLATION TYPES ==========
  const violationForm = document.getElementById('violationForm');
  const violationsList = document.getElementById('violationsList');

  violationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = (document.getElementById('violationType') || {}).value?.trim();
    const code = (document.getElementById('violationCode') || {}).value?.trim();
    const description = (document.getElementById('violationDescription') || {}).value?.trim();

    if (!category || !code || !description) {
      showToast('Please complete category, code, and description', 'error');
      return;
    }

    try {
      const payload = {
        category,
        code,
        description
      };
      const res = await fetch(`${API_BASE}/api/violations/type`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      violationForm.reset();
      showToast('Violation type added successfully!', 'success');
      await loadViolations();
    } catch (err) {
      console.error('Error adding violation:', err);
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  async function fetchViolationDescriptions(category) {
    const res = await fetch(`${API_BASE}/api/violations/description/${encodeURIComponent(category)}`, {
      headers: authHeaders()
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  function createViolationDescriptionModal(category, descriptions) {
    const existing = document.getElementById('violationDescriptionModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'violationDescriptionModal';
    modal.className = 'confirmation-modal show';
    modal.style.zIndex = 9999;
    modal.innerHTML = `
      <div class="confirmation-modal-content" style="max-width: 680px; width: 95%;">
        <div class="confirmation-modal-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h2 class="confirmation-modal-title">Violation Descriptions: ${category}</h2>
          <button id="closeViolationDescriptionModal" class="btn btn-secondary" type="button">Close</button>
        </div>
        <div class="confirmation-modal-body" style="max-height: 60vh; overflow-y:auto;">
          <div class="violation-description-add" style="margin: 10px 0; display:flex; gap: 8px; flex-wrap:wrap;">
            <input id="newDescriptionCode" type="text" placeholder="Code" style="flex: 0 0 110px;" />
            <input id="newDescriptionText" type="text" placeholder="Description" style="flex: 1;" />
            <button id="addDescriptionBtn" class="btn btn-sm btn-success" type="button">Add</button>
          </div>
          <div class="description-items">
            ${descriptions.length === 0 ? '<p class="empty-state"><i class="fa fa-inbox"></i> No descriptions found.</p>' : descriptions.map(item => `
              <div class="description-item" data-id="${item.id}" style="border-bottom:1px solid #ddd; padding:8px 0;">
                <div class="description-content" style="display:flex; justify-content:space-between; align-items:center;">
                  <div><strong>${item.code || 'N/A'}</strong> - ${item.description || 'No description'}</div>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-sm btn-outline-secondary edit-description" type="button">Edit</button>
                    <button class="btn btn-sm btn-outline-danger delete-description" type="button">Delete</button>
                  </div>
                </div>
                <div class="edit-description-form" style="display:none; margin-top:8px; gap: 6px;">
                  <input class="edit-description-code" type="text" value="${item.code || ''}" style="flex:0 0 110px;" />
                  <input class="edit-description-text" type="text" value="${item.description || ''}" style="flex:1;" />
                  <button class="btn btn-sm btn-primary save-description" type="button">Save</button>
                  <button class="btn btn-sm btn-secondary cancel-description" type="button">Cancel</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#closeViolationDescriptionModal')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    const addButton = modal.querySelector('#addDescriptionBtn');
    const newCodeInput = modal.querySelector('#newDescriptionCode');
    const newTextInput = modal.querySelector('#newDescriptionText');

    addButton?.addEventListener('click', async () => {
      const code = (newCodeInput?.value || '').trim();
      const description = (newTextInput?.value || '').trim();
      if (!code || !description) {
        showToast('Code and description are required', 'error');
        return;
      }
      try {
        const createRes = await fetch(`${API_BASE}/api/violations/description`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ category, code, description })
        });
        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${createRes.status}`);
        }
        showToast('Description added', 'success');
        const updated = await fetchViolationDescriptions(category);
        modal.remove();
        createViolationDescriptionModal(category, updated);
      } catch (err) {
        console.error('Error adding description:', err);
        showToast(`Error: ${err.message}`, 'error');
      }
    });

    modal.querySelectorAll('.description-item').forEach(itemEl => {
      const id = itemEl.dataset.id;
      const editBtn = itemEl.querySelector('.edit-description');
      const deleteBtn = itemEl.querySelector('.delete-description');
      const editForm = itemEl.querySelector('.edit-description-form');
      const saveBtn = itemEl.querySelector('.save-description');
      const cancelBtn = itemEl.querySelector('.cancel-description');
      const codeInput = itemEl.querySelector('.edit-description-code');
      const textInput = itemEl.querySelector('.edit-description-text');

      editBtn?.addEventListener('click', () => {
        if (!editForm) return;
        editForm.style.display = editForm.style.display === 'flex' ? 'none' : 'flex';
      });
      cancelBtn?.addEventListener('click', () => { if (!editForm) return; editForm.style.display = 'none'; });

      saveBtn?.addEventListener('click', async () => {
        const code = (codeInput?.value || '').trim();
        const description = (textInput?.value || '').trim();
        if (!code || !description) {
          showToast('Code and description are required for update', 'error');
          return;
        }
        try {
          const updateRes = await fetch(`${API_BASE}/api/violations/description/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ category, code, description })
          });
          if (!updateRes.ok) {
            const errData = await updateRes.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${updateRes.status}`);
          }
          showToast('Description updated', 'success');
          const updated = await fetchViolationDescriptions(category);
          modal.remove();
          createViolationDescriptionModal(category, updated);
        } catch (err) {
          console.error('Error updating description:', err);
          showToast(`Error: ${err.message}`, 'error');
        }
      });

      deleteBtn?.addEventListener('click', async () => {
        if (!confirm('Delete this description?')) return;
        try {
          const deleteRes = await fetch(`${API_BASE}/api/violations/description/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: authHeaders()
          });
          if (!deleteRes.ok && deleteRes.status !== 204) {
            const errData = await deleteRes.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${deleteRes.status}`);
          }
          showToast('Description deleted', 'success');
          const updated = await fetchViolationDescriptions(category);
          modal.remove();
          createViolationDescriptionModal(category, updated);
        } catch (err) {
          console.error('Error deleting description:', err);
          showToast(`Error: ${err.message}`, 'error');
        }
      });
    });
  }

  async function openViolationDescriptionModal(category) {
    try {
      const descriptions = await fetchViolationDescriptions(category);
      createViolationDescriptionModal(category, descriptions);
    } catch (err) {
      console.error('Error opening violation description modal:', err);
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  async function loadViolations() {
    try {
      const res = await fetch(`${API_BASE}/api/violations/type`, {
        headers: authHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const violations = await res.json();

      if (!Array.isArray(violations) || violations.length === 0) {
        violationsList.innerHTML = '<p class="empty-state"><i class="fa fa-inbox"></i> No violation types yet. Add one above!</p>';
        return;
      }

      const normalized = violations.map((item, index) => {
        if (typeof item === 'string') {
          const category = item.trim();
          return {
            id: null,
            category,
            code: category.slice(0, 5).toUpperCase() || 'N/A',
            description: category
          };
        }

        if (item && typeof item === 'object') {
          const category = item.category || item.description || item.code || 'Violation';
          return {
            id: item.id || null,
            category,
            code: item.code || (typeof category === 'string' ? category.slice(0, 5).toUpperCase() : 'N/A'),
            description: item.description || ''
          };
        }

        return {
          id: null,
          category: 'Violation',
          code: 'N/A',
          description: ''
        };
      });

      violationsList.innerHTML = normalized.map(v => `
        <div class="list-item" data-category="${encodeURIComponent(v.category)}">
          <div class="list-item-header">
            <h4>${v.category}</h4>
          </div>
          <p class="list-item-description">${v.description}</p>
          <div class="list-item-actions">
            <button class="btn btn-secondary btn-sm view-violation-descriptions" data-category="${encodeURIComponent(v.category)}">
              <i class="fa fa-eye"></i> View Descriptions
            </button>
            <button class="btn btn-danger btn-sm delete-violation" data-category="${encodeURIComponent(v.category)}">
              <i class="fa fa-trash"></i> Delete
            </button>
          </div>
          <div class="violation-description-panel" style="display:none; margin-top:10px;"></div>
        </div>
      `).join('');

      // Attach view descriptions handlers
      violationsList.querySelectorAll('.view-violation-descriptions').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const category = decodeURIComponent((e.currentTarget.dataset.category || '').toString());
          await openViolationDescriptionModal(category);
        });
      });

      // Attach delete handlers
      violationsList.querySelectorAll('.delete-violation').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const category = decodeURIComponent((e.currentTarget.dataset.category || '').toString());
          if (!category) return;
          if (!confirm(`Are you sure you want to delete the category '${category}'; this removes all descriptions for it?`)) return;

          try {
            const res = await fetch(`${API_BASE}/api/violations/type/${encodeURIComponent(category)}`, {
              method: 'DELETE',
              headers: authHeaders()
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || `HTTP ${res.status}`);
            }

            showToast('Violation category deleted', 'success');
            await loadViolations();
          } catch (err) {
            console.error('Error deleting violation category:', err);
            showToast(`Error: ${err.message}`, 'error');
          }
        });
      });
    } catch (err) {
      console.error('Error loading violations:', err);
      violationsList.innerHTML = '<p class="empty-state"><i class="fa fa-exclamation-triangle"></i> Failed to load violation types</p>';
    }
  }

  // ========== SANCTION TYPES ==========
  const sanctionForm = document.getElementById('sanctionForm');
  const sanctionsList = document.getElementById('sanctionsList');

  sanctionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sanctionType = (document.getElementById('sanctionType') || {}).value?.trim();

    if (!sanctionType) {
      showToast('Please enter a sanction type', 'error');
      return;
    }

    try {
      // Provide compatible payload fields
      const payload = { name: sanctionType, level: 'default', description: sanctionType };
      const res = await fetch(`${API_BASE}/api/sanctions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      sanctionForm.reset();
      showToast('Sanction type added successfully!', 'success');
      await loadSanctions();
    } catch (err) {
      console.error('Error adding sanction:', err);
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  async function loadSanctions() {
    try {
      const res = await fetch(`${API_BASE}/api/sanctions`, {
        headers: authHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sanctions = await res.json();

      if (!Array.isArray(sanctions) || sanctions.length === 0) {
        sanctionsList.innerHTML = '<p class="empty-state"><i class="fa fa-inbox"></i> No sanction types yet. Add one above!</p>';
        return;
      }

      sanctionsList.innerHTML = sanctions.map(s => `
        <div class="list-item">
          <div class="list-item-header">
            <h4>${s.name || 'Sanction'}</h4>
            <span class="list-item-level">${s.level || 'N/A'}</span>
          </div>
          <p class="list-item-description">${s.description || ''}</p>
          <div class="list-item-actions">
            <button class="btn btn-danger btn-sm delete-sanction" data-id="${s.id}">
              <i class="fa fa-trash"></i> Delete
            </button>
          </div>
        </div>
      `).join('');

      // Attach delete handlers
      sanctionsList.querySelectorAll('.delete-sanction').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.dataset.id;
          if (!confirm('Are you sure you want to delete this sanction type?')) return;

          try {
            const res = await fetch(`${API_BASE}/api/sanctions/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers: authHeaders()
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showToast('Sanction type deleted', 'success');
            await loadSanctions();
          } catch (err) {
            console.error('Error deleting sanction:', err);
            showToast(`Error: ${err.message}`, 'error');
          }
        });
      });
    } catch (err) {
      console.error('Error loading sanctions:', err);
      sanctionsList.innerHTML = '<p class="empty-state"><i class="fa fa-exclamation-triangle"></i> Failed to load sanction types</p>';
    }
  }

  // ========== GRADES & SECTIONS ==========
  const gradeForm = document.getElementById('gradeForm');
  const gradesList = document.getElementById('gradesList');

  gradeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const gradeName = (document.getElementById('gradeName') || {}).value?.trim();
    const sectionName = (document.getElementById('sectionName') || {}).value?.trim();
    const adviser = (document.getElementById('adviser') || {}).value?.trim() || null;

    if (!gradeName || !sectionName) {
      showToast('Please fill in Grade Level and Section', 'error');
      return;
    }

    try {
      const payload = { grade: gradeName, section: sectionName, adviser };
      const res = await fetch(`${API_BASE}/api/grades-sections`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      gradeForm.reset();
      showToast('Grade & Section added successfully!', 'success');
      await loadGrades();
    } catch (err) {
      console.error('Error adding grade & section:', err);
      showToast(`Error: ${err.message}`, 'error');
    }
  });

  async function loadGrades() {
    try {
      const res = await fetch(`${API_BASE}/api/grades-sections`, {
        headers: authHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const grades = await res.json();

      if (!Array.isArray(grades) || grades.length === 0) {
        gradesList.innerHTML = '<p class="empty-state"><i class="fa fa-inbox"></i> No grades & sections yet. Add one above!</p>';
        return;
      }

      gradesList.innerHTML = grades.map(g => `
        <div class="list-item">
          <div class="list-item-header">
            <h4>${g.grade || 'Grade'} - ${g.section || 'Section'}</h4>
          </div>
          ${g.roomNumber ? `<p class="list-item-description"><strong>Room:</strong> ${g.roomNumber}</p>` : ''}
          ${g.adviser ? `<p class="list-item-description"><strong>Adviser:</strong> ${g.adviser}</p>` : ''}
          <div class="list-item-actions">
            <button class="btn btn-danger btn-sm delete-grade" data-id="${g.id}">
              <i class="fa fa-trash"></i> Delete
            </button>
          </div>
        </div>
      `).join('');

      // Attach delete handlers
      gradesList.querySelectorAll('.delete-grade').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.dataset.id;
          if (!confirm('Are you sure you want to delete this grade & section?')) return;

          try {
            const res = await fetch(`${API_BASE}/api/grades-sections/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers: authHeaders()
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showToast('Grade & Section deleted', 'success');
            await loadGrades();
          } catch (err) {
            console.error('Error deleting grade:', err);
            showToast(`Error: ${err.message}`, 'error');
          }
        });
      });
    } catch (err) {
      console.error('Error loading grades:', err);
      gradesList.innerHTML = '<p class="empty-state"><i class="fa fa-exclamation-triangle"></i> Failed to load grades and sections</p>';
    }
  }

  // ========== BULK DELETE / DATA MANAGEMENT ==========
  let studentsData = [];
  let violationsData = [];

  // Safe element getters with null checks
  const getElements = () => ({
    studentsList: document.getElementById('studentsList'),
    violationsList: document.querySelector('#data-management-tab #violationsList'),
    selectAllStudents: document.getElementById('selectAllStudents'),
    selectAllViolations: document.getElementById('selectAllViolations'),
    deleteSelectedStudentsBtn: document.getElementById('deleteSelectedStudentsBtn'),
    deleteAllStudentsBtn: document.getElementById('deleteAllStudentsBtn'),
    deleteSelectedViolationsBtn: document.getElementById('deleteSelectedViolationsBtn'),
    deleteAllViolationsBtn: document.getElementById('deleteAllViolationsBtn'),
    studentsSelectedCount: document.getElementById('studentsSelectedCount'),
    violationsSelectedCount: document.getElementById('violationsSelectedCount')
  });

  // ========== Helper: Get checked items ==========
  function getCheckedItems(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
  }

  // ========== Helper: Update selected count ==========
  function updateSelectedCount(containerSelector, countElement, dataArray) {
    const checked = getCheckedItems(containerSelector);
    const count = checked.length;
    if (countElement) {
      countElement.textContent = `(${count} selected)`;
    }
    
    // Enable/disable delete button
    const els = getElements();
    const deleteBtn = containerSelector.includes('students') 
      ? els.deleteSelectedStudentsBtn 
      : els.deleteSelectedViolationsBtn;
    
    if (deleteBtn) {
      deleteBtn.disabled = count === 0;
    }
    
    return checked;
  }

  // ========== Load Students ==========
  async function loadStudentsForBulkDelete() {
    const els = getElements();
    if (!els.studentsList) return; // Element doesn't exist
    
    try {
      const res = await fetch(`${API_BASE}/api/students?limit=1000`, {
        headers: authHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const responseData = await res.json();
      
      // Handle paginated response format
      studentsData = Array.isArray(responseData) ? responseData : (responseData.data || []);

      if (!Array.isArray(studentsData) || studentsData.length === 0) {
        els.studentsList.innerHTML = '<p class="empty-state"><i class="fa fa-inbox"></i> No students found.</p>';
        if (els.selectAllStudents) els.selectAllStudents.disabled = true;
        return;
      }

      if (els.selectAllStudents) els.selectAllStudents.disabled = false;
      renderStudentsList();
      attachStudentCheckboxListeners();
    } catch (err) {
      console.error('Error loading students for bulk delete:', err);
      els.studentsList.innerHTML = '<p class="empty-state"><i class="fa fa-exclamation-triangle"></i> Failed to load students</p>';
    }
  }

  function renderStudentsList(filteredData = null) {
    const els = getElements();
    if (!els.studentsList) return;
    
    const toRender = filteredData || studentsData;
    
    if (!toRender || toRender.length === 0) {
      els.studentsList.innerHTML = '<p class="empty-state"><i class="fa fa-inbox"></i> No matching records found.</p>';
      return;
    }
    
    els.studentsList.innerHTML = toRender.map(student => {
      const firstName = student.first_name || student.firstName || '';
      const lastName = student.last_name || student.lastName || '';
      const name = firstName || lastName 
        ? `${firstName} ${lastName}`.trim() 
        : student.name || 'Unnamed Student';
      const lrn = student.lrn || student.id || 'N/A';
      const grade = student.grade || 'N/A';
      const section = student.section || '';
      const gradeSection = section ? `${grade} - ${section}` : grade;
      
      return `
        <div class="bulk-item">
          <input type="checkbox" class="student-checkbox" data-id="${student.id}" data-name="${name}">
          <div class="bulk-item-content">
            <p class="bulk-item-title">${name}</p>
          </div>
          <div class="bulk-item-content">
            <p class="bulk-item-subtitle">${lrn}</p>
          </div>
          <div class="bulk-item-content">
            <p class="bulk-item-subtitle">${gradeSection}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  // ========== SEARCH & FILTER FUNCTIONS ==========
  function filterStudents(searchQuery) {
    if (!searchQuery.trim()) {
      return studentsData;
    }
    
    const query = searchQuery.toLowerCase();
    return studentsData.filter(student => {
      const firstName = student.first_name || student.firstName || '';
      const lastName = student.last_name || student.lastName || '';
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const lrn = (student.lrn || student.id || '').toString().toLowerCase();
      
      return fullName.includes(query) || lrn.includes(query);
    });
  }

  function filterViolations(searchQuery, statusFilter) {
    let filtered = violationsData;
    
    // Apply status filter if specified
    if (statusFilter && statusFilter.startsWith('status:')) {
      const status = statusFilter.substring(7); // Remove "status:" prefix
      filtered = filtered.filter(v => (v.status || '').toLowerCase() === status.toLowerCase());
    }
    
    // Apply search query if specified
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(violation => {
        const studentName = (violation.student_name || violation.studentName || '').toLowerCase();
        const violationType = (violation.description || violation.violationType || '').toLowerCase();
        
        return studentName.includes(query) || violationType.includes(query);
      });
    }
    
    return filtered;
  }

  // ========== ATTACH SEARCH EVENT LISTENERS ==========
  function attachSearchListeners() {
    const studentSearchInput = document.getElementById('studentSearchInput');
    const violationSearchInput = document.getElementById('violationSearchInput');
    const clearStudentSearchBtn = document.getElementById('clearStudentSearchBtn');
    const clearViolationSearchBtn = document.getElementById('clearViolationSearchBtn');
    const violationFilterDropdown = document.getElementById('violationFilterDropdown');
    
    // Student search
    if (studentSearchInput) {
      studentSearchInput.addEventListener('input', (e) => {
        const filtered = filterStudents(e.target.value);
        renderStudentsList(filtered);
        attachStudentCheckboxListeners();
        
        if (clearStudentSearchBtn) {
          clearStudentSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    
    // Clear student search
    if (clearStudentSearchBtn) {
      clearStudentSearchBtn.addEventListener('click', () => {
        if (studentSearchInput) {
          studentSearchInput.value = '';
          clearStudentSearchBtn.style.display = 'none';
          renderStudentsList(studentsData);
          attachStudentCheckboxListeners();
        }
      });
    }
    
    // Violation search
    if (violationSearchInput) {
      violationSearchInput.addEventListener('input', (e) => {
        const statusFilter = violationFilterDropdown ? violationFilterDropdown.value : '';
        const filtered = filterViolations(e.target.value, statusFilter);
        renderViolationsList(filtered);
        attachViolationCheckboxListeners();
        
        if (clearViolationSearchBtn) {
          clearViolationSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    
    // Clear violation search
    if (clearViolationSearchBtn) {
      clearViolationSearchBtn.addEventListener('click', () => {
        if (violationSearchInput) {
          violationSearchInput.value = '';
          clearViolationSearchBtn.style.display = 'none';
          const statusFilter = violationFilterDropdown ? violationFilterDropdown.value : '';
          renderViolationsList(filterViolations('', statusFilter));
          attachViolationCheckboxListeners();
        }
      });
    }
    
    // Violation status filter
    if (violationFilterDropdown) {
      violationFilterDropdown.addEventListener('change', (e) => {
        const searchQuery = violationSearchInput ? violationSearchInput.value : '';
        const filtered = filterViolations(searchQuery, e.target.value);
        renderViolationsList(filtered);
        attachViolationCheckboxListeners();
      });
    }
  }

  function attachStudentCheckboxListeners() {
    const els = getElements();
    if (!els.studentsList) return;
    
    const checkboxes = els.studentsList.querySelectorAll('.student-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (els.studentsSelectedCount) {
          updateSelectedCount('#studentsList', els.studentsSelectedCount, studentsData);
        }
        
        // Update select all checkbox based on visible items
        const visibleCheckboxes = els.studentsList.querySelectorAll('.student-checkbox');
        const allVisible = Array.from(visibleCheckboxes);
        const allChecked = allVisible.length > 0 && allVisible.every(cb => cb.checked);
        const someChecked = allVisible.some(cb => cb.checked);
        if (els.selectAllStudents) {
          els.selectAllStudents.checked = allChecked;
          els.selectAllStudents.indeterminate = someChecked && !allChecked;
        }
      });
    });
  }

  // Attach event listeners with safety check
  (() => {
    const els = getElements();
    if (els.selectAllStudents) {
      els.selectAllStudents.addEventListener('change', () => {
        if (!els.studentsList) return;
        const visibleCheckboxes = els.studentsList.querySelectorAll('.student-checkbox');
        visibleCheckboxes.forEach(checkbox => {
          checkbox.checked = els.selectAllStudents.checked;
        });
        if (els.studentsSelectedCount) {
          updateSelectedCount('#studentsList', els.studentsSelectedCount, studentsData);
        }
      });
    }
  })();

  // ========== Load Violations for Bulk Delete ==========
  async function loadViolationsForBulkDelete() {
    const els = getElements();
    
    try {
      const res = await fetch(`${API_BASE}/api/violations?limit=1000`, {
        headers: authHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const responseData = await res.json();
      
      // Handle paginated response format
      violationsData = Array.isArray(responseData) ? responseData : (responseData.data || []);

      if (!Array.isArray(violationsData) || violationsData.length === 0) {
        const violationsContainer = document.querySelector('#data-management-tab #violationsList');
        if (violationsContainer) {
          violationsContainer.innerHTML = '<p class="empty-state"><i class="fa fa-inbox"></i> No violations found.</p>';
        }
        if (els.selectAllViolations) els.selectAllViolations.disabled = true;
        return;
      }

      if (els.selectAllViolations) els.selectAllViolations.disabled = false;
      renderViolationsList();
      attachViolationCheckboxListeners();
    } catch (err) {
      console.error('Error loading violations for bulk delete:', err);
      const violationsContainer = document.querySelector('#data-management-tab #violationsList');
      if (violationsContainer) {
        violationsContainer.innerHTML = '<p class="empty-state"><i class="fa fa-exclamation-triangle"></i> Failed to load violations</p>';
      }
    }
  }

  function renderViolationsList(filteredData = null) {
    const violationsContainer = document.querySelector('#data-management-tab #violationsList');
    if (!violationsContainer) return;

    const toRender = filteredData || violationsData;
    
    if (!toRender || toRender.length === 0) {
      violationsContainer.innerHTML = '<p class="empty-state"><i class="fa fa-inbox"></i> No matching records found.</p>';
      return;
    }

    violationsContainer.innerHTML = toRender.map(violation => {
      const studentName = violation.student_name || violation.studentName || 'Unknown Student';
      const violationType = violation.description || violation.violationType || 'N/A';
      const incidentDate = violation.incident_date || violation.incidentDate || violation.created_at || 'N/A';
      const dateDisplay = incidentDate !== 'N/A' ? new Date(incidentDate).toLocaleDateString() : 'N/A';
      const sanction = violation.sanction || 'None';
      
      return `
        <div class="bulk-item">
          <input type="checkbox" class="violation-checkbox" data-id="${violation.id}" data-name="${studentName}">
          <div class="bulk-item-content">
            <p class="bulk-item-title">${studentName}</p>
          </div>
          <div class="bulk-item-content">
            <p class="bulk-item-subtitle">${violationType}</p>
          </div>
          <div class="bulk-item-content">
            <p class="bulk-item-subtitle">${dateDisplay}</p>
          </div>
          <div class="bulk-item-content">
            <p class="bulk-item-subtitle">${sanction}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function attachViolationCheckboxListeners() {
    const els = getElements();
    const violationsContainer = document.querySelector('#data-management-tab #violationsList');
    if (!violationsContainer) return;
    
    const checkboxes = violationsContainer.querySelectorAll('.violation-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (els.violationsSelectedCount) {
          updateSelectedCount('#data-management-tab #violationsList', els.violationsSelectedCount, violationsData);
        }
        
        // Update select all checkbox based on visible items
        const visibleCheckboxes = violationsContainer.querySelectorAll('.violation-checkbox');
        const allVisible = Array.from(visibleCheckboxes);
        const allChecked = allVisible.length > 0 && allVisible.every(cb => cb.checked);
        const someChecked = allVisible.some(cb => cb.checked);
        if (els.selectAllViolations) {
          els.selectAllViolations.checked = allChecked;
          els.selectAllViolations.indeterminate = someChecked && !allChecked;
        }
      });
    });
  }

  // Attach event listeners with safety check
  (() => {
    const els = getElements();
    if (els.selectAllViolations) {
      els.selectAllViolations.addEventListener('change', () => {
        const violationsContainer = document.querySelector('#data-management-tab #violationsList');
        if (!violationsContainer) return;
        const visibleCheckboxes = violationsContainer.querySelectorAll('.violation-checkbox');
        visibleCheckboxes.forEach(checkbox => {
          checkbox.checked = els.selectAllViolations.checked;
        });
        if (els.violationsSelectedCount) {
          updateSelectedCount('#data-management-tab #violationsList', els.violationsSelectedCount, violationsData);
        }
      });
    }
  })();

  // ========== Confirmation Modal ==========
  function showConfirmationModal(title, message, stats, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'confirmation-modal show';
    modal.innerHTML = `
      <div class="confirmation-modal-content">
        <div class="confirmation-modal-header">
          <h2 class="confirmation-modal-title"><i class="fa fa-exclamation-circle" style="color: #ef4444; margin-right: 8px;"></i>${title}</h2>
          <p class="confirmation-modal-message">${message}</p>
          ${stats ? `<div class="confirmation-modal-stats">${stats}</div>` : ''}
        </div>
        <div class="confirmation-modal-footer">
          <button class="btn btn-cancel" id="confirmCancel">Cancel</button>
          <button class="btn btn-danger" id="confirmDelete">Delete</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const confirmBtn = modal.querySelector('#confirmDelete');
    const cancelBtn = modal.querySelector('#confirmCancel');
    
    const cleanup = () => {
      modal.remove();
    };
    
    confirmBtn.addEventListener('click', async () => {
      cleanup();
      await onConfirm();
    });
    
    cancelBtn.addEventListener('click', cleanup);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup();
    });
  }

  // ========== Delete Selected Students ==========
  (() => {
    const els = getElements();
    if (els.deleteSelectedStudentsBtn) {
      els.deleteSelectedStudentsBtn.addEventListener('click', async () => {
        const checked = getCheckedItems('#studentsList');
        if (checked.length === 0) {
          showToast('Please select students to delete', 'warning');
          return;
        }

        const studentIds = checked.map(cb => cb.dataset.id);
        const studentNames = checked.map(cb => cb.dataset.name);

        showConfirmationModal(
          'Delete Selected Students',
          'This will permanently delete the selected students and all their associated violations. This action cannot be undone.',
          `<strong>${studentIds.length} student(s)</strong> will be deleted along with their violations.`,
          async () => {
            try {
              let deletedCount = 0;
              let failedCount = 0;

              // Delete each student
              for (const id of studentIds) {
                try {
                  const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                    headers: authHeaders()
                  });
                  if (res.ok) {
                    deletedCount++;
                  } else {
                    failedCount++;
                  }
                } catch (err) {
                  failedCount++;
                }
              }

              // Reload both lists
              await loadStudentsForBulkDelete();
              await loadViolationsForBulkDelete();

              if (deletedCount > 0) {
                showToast(`✓ Successfully deleted ${deletedCount} student(s) and their associated violations`, 'success');
              }
              if (failedCount > 0) {
                showToast(`⚠ Failed to delete ${failedCount} student(s)`, 'error');
              }
            } catch (err) {
              console.error('Error deleting students:', err);
              showToast(`Error: ${err.message}`, 'error');
            }
          }
        );
      });
    }
  })();

  // ========== Delete All Students ==========
  (() => {
    const els = getElements();
    if (els.deleteAllStudentsBtn) {
      els.deleteAllStudentsBtn.addEventListener('click', async () => {
        if (studentsData.length === 0) {
          showToast('No students to delete', 'warning');
          return;
        }

        showConfirmationModal(
          'Delete All Students',
          'This will permanently delete ALL students and all their associated violations. This action cannot be undone.',
          `<strong>${studentsData.length} student(s)</strong> will be permanently deleted.`,
          async () => {
            try {
              let deletedCount = 0;

              // Delete each student
              for (const student of studentsData) {
                try {
                  const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(student.id)}`, {
                    method: 'DELETE',
                    headers: authHeaders()
                  });
                  if (res.ok) deletedCount++;
                } catch (err) {
                  // Continue with next deletion
                }
              }

              // Reload both lists
              await loadStudentsForBulkDelete();
              await loadViolationsForBulkDelete();

              showToast(`✓ Successfully deleted ${deletedCount} student(s)`, 'success');
            } catch (err) {
              console.error('Error deleting all students:', err);
              showToast(`Error: ${err.message}`, 'error');
            }
          }
        );
      });
    }
  })();

  // ========== Delete Selected Violations ==========
  (() => {
    const els = getElements();
    if (els.deleteSelectedViolationsBtn) {
      els.deleteSelectedViolationsBtn.addEventListener('click', async () => {
        const checked = getCheckedItems('#data-management-tab #violationsList');
        if (checked.length === 0) {
          showToast('Please select violations to delete', 'warning');
          return;
        }

        const violationIds = checked.map(cb => cb.dataset.id);

        showConfirmationModal(
          'Delete Selected Violations',
          'This will permanently delete the selected violation types. Records with these violations will be updated. This action cannot be undone.',
          `<strong>${violationIds.length} violation type(s)</strong> will be deleted.`,
          async () => {
            try {
              let deletedCount = 0;
              let failedCount = 0;

              // Delete each violation
              for (const id of violationIds) {
                try {
                  const res = await fetch(`${API_BASE}/api/violations/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                    headers: authHeaders()
                  });
                  if (res.ok) {
                    deletedCount++;
                  } else {
                    failedCount++;
                  }
                } catch (err) {
                  failedCount++;
                }
              }

              // Reload violation list
              await loadViolationsForBulkDelete();

              if (deletedCount > 0) {
                showToast(`✓ Successfully deleted ${deletedCount} violation type(s)`, 'success');
              }
              if (failedCount > 0) {
                showToast(`⚠ Failed to delete ${failedCount} violation type(s)`, 'error');
              }
            } catch (err) {
              console.error('Error deleting violations:', err);
              showToast(`Error: ${err.message}`, 'error');
            }
          }
        );
      });
    }
  })();

  // ========== Delete All Violations ==========
  (() => {
    const els = getElements();
    if (els.deleteAllViolationsBtn) {
      els.deleteAllViolationsBtn.addEventListener('click', async () => {
        if (violationsData.length === 0) {
          showToast('No violations to delete', 'warning');
          return;
        }

        showConfirmationModal(
          'Delete All Violations',
          'This will permanently delete ALL violation types. Records with these violations will be updated. This action cannot be undone.',
          `<strong>${violationsData.length} violation type(s)</strong> will be permanently deleted.`,
          async () => {
            try {
              let deletedCount = 0;

              // Delete each violation
              for (const violation of violationsData) {
                try {
                  const res = await fetch(`${API_BASE}/api/violations/${encodeURIComponent(violation.id)}`, {
                    method: 'DELETE',
                    headers: authHeaders()
                  });
                  if (res.ok) deletedCount++;
                } catch (err) {
                  // Continue with next deletion
                }
              }

              // Reload violation list
              await loadViolationsForBulkDelete();

              showToast(`✓ Successfully deleted ${deletedCount} violation type(s)`, 'success');
            } catch (err) {
              console.error('Error deleting all violations:', err);
              showToast(`Error: ${err.message}`, 'error');
            }
          }
        );
      });
    }
  })();

  // ========== Initial Load ==========
  await loadViolations();
  await loadSanctions();
  await loadGrades();
  
  // Load bulk delete data (with error handling so it doesn't break tabs)
  try {
    await loadStudentsForBulkDelete();
  } catch (err) {
    console.error('Failed to load students for bulk delete:', err);
  }
  
  try {
    await loadViolationsForBulkDelete();
  } catch (err) {
    console.error('Failed to load violations for bulk delete:', err);
  }
  
  // Attach search and filter listeners
  attachSearchListeners();
});