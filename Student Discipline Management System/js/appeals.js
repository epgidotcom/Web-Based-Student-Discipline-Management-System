(() => {
  const PRIVILEGE_ROLES = ['Admin', 'Teacher'];

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.SDMSAuth?.requireRole === 'function') {
      const allowed = window.SDMSAuth.requireRole(PRIVILEGE_ROLES);
      if (!allowed) return;
    }

    const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
    const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;

    const tableBody = document.querySelector('#appealsTable tbody');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');

    const modal = document.getElementById('appealModal');
    const modalClose = document.getElementById('appealModalClose');
    const modalStudentName = document.getElementById('modalStudentName');
    const modalLRN = document.getElementById('modalLRN');
    const modalSection = document.getElementById('modalSection');
    const modalViolation = document.getElementById('modalViolation');
    const modalReason = document.getElementById('modalReason');
    const modalStatus = document.getElementById('modalStatus');
    const modalSubmitted = document.getElementById('modalSubmitted');
    const modalDecision = document.getElementById('modalDecision');
    const decisionRow = document.getElementById('decisionRow');

    const approveBtn = document.getElementById('modalApprove');
    const rejectBtn = document.getElementById('modalReject');
    const backToPendingBtn = document.getElementById('modalBackToPending');

    const state = {
      appeals: [],
      filtered: [],
      selected: null
    };

    function authHeaders() {
      const token = window.SDMSAuth?.getToken?.();
      return token ? { Authorization: `Bearer ${token}` } : {};
    }

    async function api(path, options = {}) {
      const init = {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) }
      };
      if (options.body !== undefined) {
        init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
      const response = await fetch(`${API_ROOT}${path}`, init);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed (${response.status})`);
      }
      if (response.status === 204) return null;
      const ct = response.headers.get('content-type') || '';
      return ct.includes('application/json') ? response.json() : response.text();
    }

    function formatDate(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    function renderTable(list) {
      if (!tableBody) return;
      tableBody.innerHTML = '';
      if (!list.length) {
        const row = document.createElement('tr');
        row.dataset.placeholder = 'empty';
        row.innerHTML = '<td colspan="8">No appeals found.</td>';
        tableBody.appendChild(row);
        return;
      }

      list.forEach((appeal) => {
        const row = document.createElement('tr');
        const statusClass = (appeal.status || '').toLowerCase();
        const createdDate = formatDate(appeal.createdAt);
        const truncatedReason = appeal.reason && appeal.reason.length > 80
          ? `${appeal.reason.slice(0, 77)}…`
          : (appeal.reason || '—');
        row.innerHTML = `
          <td>${appeal.lrn || '—'}</td>
          <td>${createdDate || '—'}</td>
          <td>${appeal.studentName || '—'}</td>
          <td>${appeal.section || '—'}</td>
          <td>${appeal.violation || '—'}</td>
          <td>${truncatedReason}</td>
          <td><span class="status ${statusClass}">${appeal.status || 'Pending'}</span></td>
          <td>
            <button class="action-btn view" data-action="view" data-id="${appeal.id}" title="View"><i class="fa fa-eye"></i></button>
            <button class="action-btn delete" data-action="delete" data-id="${appeal.id}" title="Delete"><i class="fa fa-trash"></i></button>
          </td>`;
        tableBody.appendChild(row);
      });
    }

    function applyFilter() {
      const query = (searchInput?.value || '').trim().toLowerCase();
      if (!query) {
        state.filtered = state.appeals.slice();
      } else {
        state.filtered = state.appeals.filter((appeal) =>
          [appeal.lrn, appeal.studentName, appeal.section, appeal.violation, appeal.reason, appeal.status]
            .map((v) => (v || '').toString().toLowerCase())
            .some((text) => text.includes(query))
        );
      }
      renderTable(state.filtered);
    }

    function openModal(appeal) {
      state.selected = appeal;
      if (!modal || !appeal) return;
      modalStudentName.textContent = appeal.studentName || '—';
      modalLRN.textContent = appeal.lrn || '—';
      modalSection.textContent = appeal.section || '—';
      modalViolation.textContent = appeal.violation || '—';
      modalReason.textContent = appeal.reason || '—';
      modalStatus.textContent = appeal.status || 'Pending';
      modalSubmitted.textContent = formatDate(appeal.createdAt) || '—';

      if (appeal.decisionNotes) {
        modalDecision.textContent = appeal.decisionNotes;
        decisionRow.style.display = '';
      } else {
        modalDecision.textContent = '';
        decisionRow.style.display = 'none';
      }

      const status = (appeal.status || '').toLowerCase();
      backToPendingBtn.style.display = status === 'pending' ? 'none' : '';
      modal.classList.add('is-open');
    }

    function closeModal() {
      state.selected = null;
      modal?.classList.remove('is-open');
    }

    async function loadAppeals() {
      try {
        const data = await api('/appeals');
        state.appeals = Array.isArray(data) ? data : [];
        applyFilter();
      } catch (err) {
        console.error('[appeals] load failed', err);
        alert(err.message || 'Failed to load appeals.');
      }
    }

    async function updateSelectedStatus(nextStatus) {
      if (!state.selected) return;
      try {
        const updated = await api(`/appeals/${encodeURIComponent(state.selected.id)}`, {
          method: 'PATCH',
          body: { status: nextStatus }
        });
        state.appeals = state.appeals.map((item) => (item.id === updated.id ? updated : item));
        applyFilter();
        const latest = state.appeals.find((item) => item.id === updated.id);
        if (latest) openModal(latest);
      } catch (err) {
        console.error('[appeals] status update failed', err);
        alert(err.message || 'Failed to update appeal status.');
      }
    }

    async function deleteAppeal(id) {
      if (!confirm('Delete this appeal? This action cannot be undone.')) return;
      try {
        await api(`/appeals/${encodeURIComponent(id)}`, { method: 'DELETE' });
        state.appeals = state.appeals.filter((appeal) => appeal.id !== id);
        applyFilter();
        if (state.selected?.id === id) closeModal();
      } catch (err) {
        console.error('[appeals] delete failed', err);
        alert(err.message || 'Failed to delete appeal.');
      }
    }

    tableBody?.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (!action || !id) return;
      const appeal = state.appeals.find((item) => item.id === id);
      if (action === 'view' && appeal) {
        openModal(appeal);
      } else if (action === 'delete') {
        deleteAppeal(id);
      }
    });

    modalClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    approveBtn?.addEventListener('click', () => updateSelectedStatus('Approved'));
    rejectBtn?.addEventListener('click', () => updateSelectedStatus('Rejected'));
    backToPendingBtn?.addEventListener('click', () => updateSelectedStatus('Pending'));

    searchInput?.addEventListener('keyup', () => applyFilter());
    searchButton?.addEventListener('click', () => applyFilter());

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });

    loadAppeals();
  });
})();
