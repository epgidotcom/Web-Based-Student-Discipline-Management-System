(async function () {
  // Acquire an `api` helper at runtime. We avoid a static `import` so this file can be loaded
  // as a classic script (admin page) or as a module (student page). Resolve import paths
  // relative to the current script to handle different include locations.
  let api = window.api || null;
  const scriptSrc = (document.currentScript && document.currentScript.src) || window.location.href;
  const scriptBase = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);

  async function tryImportApi() {
    const candidates = [
      new URL('api.js', scriptBase).href,
      new URL('js/api.js', window.location.origin + '/').href,
      new URL('Student Discipline Management System/js/api.js', window.location.origin + '/').href
    ];
    console.debug('[appeals] tryImportApi candidates:', candidates);
    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      try {
        const mod = await import(/* webpackIgnore: true */ url);
        if (mod && mod.api) { api = mod.api; return; }
      } catch (e) {
        console.debug('[appeals] import failed for', url, e && e.message);
        // try next
      }
    }
  }

  try {
    if (!api) await tryImportApi();
  } catch (e) {
    console.warn('[appeals] dynamic import of api failed, falling back to window.api', e);
    api = window.api || null;
  }

  const API_ORIGIN = ((window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || 'https://sdms-backend.onrender.com').replace(/\/+$/, '');
  const API_ROOT = (window.API_BASE || (API_ORIGIN + '/api')).replace(/\/+$/, '');
  const APPEALS_BASE = API_ROOT + '/appeals';

  const state = {
    appeals: [],
    selectedAppealId: null,
    messages: [],
    loadingMessages: false
  };

  const appealRows = document.getElementById('appealRows');
  const appealForm = document.getElementById('appealForm');
  const violationInput = document.getElementById('violationText');
  const reasonInput = document.getElementById('appealReason');

  // ADMIN MODE: if the admin table exists on this page, run admin-only UI and API logic
  if (document.getElementById('appealsTable')) {
    (function () {
      const PRIVILEGE_ROLES = ['Admin', 'Teacher'];
      // check role if available
      if (typeof window.SDMSAuth === 'object' && typeof window.SDMSAuth.requireRole === 'function') {
        const allowed = window.SDMSAuth.requireRole(PRIVILEGE_ROLES);
        if (!allowed) return;
      }

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

      const adminState = { appeals: [], filtered: [], selected: null };

      function getApiBaseFromMeta() {
        const meta = document.querySelector('meta[name="sdms-api-base"]');
        return (meta && meta.content) || (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '';
      }

      const ADMIN_API_ORIGIN = getApiBaseFromMeta().replace(/\/\/+$/, '');
      const ADMIN_API_ROOT = (window.API_BASE || (ADMIN_API_ORIGIN ? ADMIN_API_ORIGIN + '/api' : API_ROOT)).replace(/\/\/+$/, '');

      // Diagnostic logging to help debug deployed path / auth issues
      try {
        console.debug('[admin appeals] ADMIN_API_ORIGIN=', ADMIN_API_ORIGIN, 'ADMIN_API_ROOT=', ADMIN_API_ROOT, 'fallback API_ROOT=', API_ROOT);
        const tokenPresent = !!((window.SDMSAuth && typeof window.SDMSAuth.getToken === 'function') && window.SDMSAuth.getToken());
        console.debug('[admin appeals] auth token present?', tokenPresent);
      } catch (e) {
        console.debug('[admin appeals] diagnostics failed', e && e.message);
      }

      function authHeaders() {
        const token = (window.SDMSAuth && typeof window.SDMSAuth.getToken === 'function') ? window.SDMSAuth.getToken() : null;
        return token ? { Authorization: 'Bearer ' + token } : {};
      }

      async function adminApi(path, options = {}) {
        const init = { method: options.method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(), options.headers || {}) };
        if (options.body !== undefined) init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        const fullUrl = ADMIN_API_ROOT + path;
        try { console.debug('[admin appeals] fetch', init.method, fullUrl, 'hasAuth=', !!(init.headers && init.headers.Authorization)); } catch (e) {}
        const res = await fetch(fullUrl, init);
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || ('Request failed (' + res.status + ')'));
        }
        if (res.status === 204) return null;
        const ct = res.headers.get('content-type') || '';
        return ct.indexOf('application/json') !== -1 ? res.json() : res.text();
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
        if (!list || !list.length) {
          const row = document.createElement('tr');
          row.dataset.placeholder = 'empty';
          row.innerHTML = '<td colspan="8">No appeals found.</td>';
          tableBody.appendChild(row);
          return;
        }
        list.forEach(function (appeal) {
          const row = document.createElement('tr');
          const statusClass = (appeal.status || '').toLowerCase();
          const createdDate = formatDate(appeal.createdAt);
          const truncatedReason = appeal.reason && appeal.reason.length > 80 ? appeal.reason.slice(0, 77) + '...' : (appeal.reason || '—');
          row.innerHTML = '\n            <td>' + (appeal.lrn || '—') + '</td>\n            <td>' + (createdDate || '—') + '</td>\n            <td>' + (appeal.studentName || '—') + '</td>\n            <td>' + (appeal.section || '—') + '</td>\n            <td>' + (appeal.violation || '—') + '</td>\n            <td>' + truncatedReason + '</td>\n            <td><span class="status ' + statusClass + '">' + (appeal.status || 'Pending') + '</span></td>\n            <td>\n              <button class="action-btn view" data-action="view" data-id="' + appeal.id + '" title="View"><i class="fa fa-eye"></i></button>\n              <button class="action-btn delete" data-action="delete" data-id="' + appeal.id + '" title="Delete"><i class="fa fa-trash"></i></button>\n            </td>';
          tableBody.appendChild(row);
        });
      }

      function applyFilter() {
        const query = (searchInput && searchInput.value ? searchInput.value.trim().toLowerCase() : '');
        if (!query) {
          adminState.filtered = adminState.appeals.slice();
        } else {
          adminState.filtered = adminState.appeals.filter(function (appeal) {
            return [appeal.lrn, appeal.studentName, appeal.section, appeal.violation, appeal.reason, appeal.status].map(function (v) { return (v || '').toString().toLowerCase(); }).some(function (text) { return text.indexOf(query) !== -1; });
          });
        }
        renderTable(adminState.filtered);
      }

      function openModal(appeal) {
        adminState.selected = appeal;
        if (!modal || !appeal) return;
        modalStudentName.textContent = appeal.studentName || '—';
        modalLRN.textContent = appeal.lrn || '—';
        modalSection.textContent = appeal.section || '—';
        modalViolation.textContent = appeal.violation || '—';
        modalReason.textContent = appeal.reason || '—';
        modalStatus.textContent = appeal.status || 'Pending';
        modalSubmitted.textContent = formatDate(appeal.createdAt) || '—';
        if (appeal.decisionNotes) { modalDecision.textContent = appeal.decisionNotes; decisionRow.style.display = ''; } else { modalDecision.textContent = ''; decisionRow.style.display = 'none'; }
        const status = (appeal.status || '').toLowerCase();
        backToPendingBtn.style.display = status === 'pending' ? 'none' : '';
        modal.classList.add('is-open');
      }

      function closeModal() { adminState.selected = null; modal && modal.classList.remove('is-open'); }

      async function loadAppeals() {
        try {
          const data = await adminApi('/appeals');
          adminState.appeals = Array.isArray(data) ? data : [];
          applyFilter();
        } catch (err) {
          console.error('[admin appeals] load failed', err);
          var row = document.createElement('tr'); row.innerHTML = '<td colspan="8" style="text-align:center;color:#e11d48;">Failed to load appeals.</td>'; tableBody.innerHTML = ''; tableBody.appendChild(row);
        }
      }

      async function updateSelectedStatus(nextStatus) {
        if (!adminState.selected) return;
        try {
          const updated = await adminApi('/appeals/' + encodeURIComponent(adminState.selected.id), { method: 'PATCH', body: { status: nextStatus } });
          adminState.appeals = adminState.appeals.map(function (item) { return item.id === updated.id ? updated : item; });
          applyFilter();
          const latest = adminState.appeals.find(function (item) { return item.id === updated.id; });
          if (latest) openModal(latest);
        } catch (err) { console.error('[admin appeals] status update failed', err); alert(err && err.message ? err.message : 'Failed to update appeal status.'); }
      }

      async function deleteAppeal(id) {
        if (!confirm('Delete this appeal? This action cannot be undone.')) return;
        try {
          await adminApi('/appeals/' + encodeURIComponent(id), { method: 'DELETE' });
          adminState.appeals = adminState.appeals.filter(function (appeal) { return appeal.id !== id; });
          applyFilter();
          if (adminState.selected && adminState.selected.id === id) closeModal();
        } catch (err) { console.error('[admin appeals] delete failed', err); alert(err && err.message ? err.message : 'Failed to delete appeal.'); }
      }

      tableBody && tableBody.addEventListener('click', function (event) {
        var btn = event.target.closest && event.target.closest('button[data-action]');
        if (!btn) return;
        var action = btn.dataset.action, id = btn.dataset.id;
        if (!action || !id) return;
        var appeal = adminState.appeals.find(function (item) { return item.id === id; });
        if (action === 'view' && appeal) openModal(appeal);
        else if (action === 'delete') deleteAppeal(id);
      });

      modalClose && modalClose.addEventListener('click', closeModal);
      modal && modal.addEventListener('click', function (event) { if (event.target === modal) closeModal(); });
      approveBtn && approveBtn.addEventListener('click', function () { updateSelectedStatus('Approved'); });
      rejectBtn && rejectBtn.addEventListener('click', function () { updateSelectedStatus('Rejected'); });
      backToPendingBtn && backToPendingBtn.addEventListener('click', function () { updateSelectedStatus('Pending'); });

      searchInput && searchInput.addEventListener('keyup', applyFilter);
      searchButton && searchButton.addEventListener('click', applyFilter);

      window.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeModal(); });

      loadAppeals();
    })();
    // stop further (student) initialization on admin page
    return;
  }

// Violation picker elements
const violationToggle = document.getElementById('violationToggle');
const violationDropdown = document.getElementById('violationDropdown');
const violationListEl = document.getElementById('violationList');
const violationSearch = document.getElementById('violationSearch');

let violationsCatalog = [];
// Resolve asset URLs in a way that works for both module and classic script contexts
function assetUrl(path) {
  // Try several plausible locations for the asset without referencing import.meta (invalid in classic scripts)
  var candidates = [];
  var cs = document.currentScript && document.currentScript.src;
  if (cs) {
    candidates.push(new URL(path, cs).href);
  }
  // relative to page
  candidates.push(new URL(path, window.location.href).href);
  // common JS folder fallbacks
  candidates.push(window.location.origin + '/js/' + path.replace(/^\/+/, ''));
  candidates.push(window.location.origin + '/Student Discipline Management System/js/' + path.replace(/^\/+/, ''));

  return candidates[0]; // we will attempt fetches in loadViolationsCatalog using these candidates sequentially
}

async function loadViolationsCatalog(){
  try {
    // try candidate URLs until one succeeds
    var candidates = [];
    var cs = document.currentScript && document.currentScript.src;
    if (cs) candidates.push(new URL('./school_violations.json', cs).href);
    candidates.push(new URL('./school_violations.json', window.location.href).href);
    candidates.push(window.location.origin + '/js/school_violations.json');
    candidates.push(window.location.origin + '/Student Discipline Management System/js/school_violations.json');

    var res = null;
    for (var i = 0; i < candidates.length; i++) {
      try {
        res = await fetch(candidates[i], { cache: 'no-store' });
        if (res.ok) break;
      } catch (e) {
        res = null;
      }
    }
    if (!res || !res.ok) throw new Error('Failed to load violations catalog');
    const payload = await res.json();
    const categories = payload?.school_policy?.categories || [];
    // flatten into id + description entries
    violationsCatalog = categories.reduce((acc, cat) => {
      const items = Array.isArray(cat.items) ? cat.items : [];
      items.forEach(it => acc.push({ id: it.id, description: it.description, category: cat.category }));
      return acc;
    }, []);
  } catch (e) {
    console.warn('[appeals] could not load violations catalog', e);
    violationsCatalog = [];
  }
  renderViolationsList(violationsCatalog);
}

function renderViolationsList(list){
  if (!violationListEl) return;
  violationListEl.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No violations available';
    violationListEl.appendChild(li);
    return;
  }
  // group by category for readability
  const byCat = list.reduce((m, it) => { (m[it.category] = m[it.category] || []).push(it); return m; }, {});
  Object.keys(byCat).forEach(cat => {
    const header = document.createElement('li');
    header.className = 'violation-cat';
    header.textContent = cat;
    violationListEl.appendChild(header);
    byCat[cat].forEach(item => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.className = 'violation-item';
      li.dataset.id = item.id;
      li.dataset.desc = item.description;
      li.innerHTML = `<strong>${item.id}</strong> — <span class="desc">${item.description}</span>`;
      li.addEventListener('click', () => {
        violationInput.value = `${item.id} — ${item.description}`;
        closeViolationDropdown();
      });
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
      violationListEl.appendChild(li);
    });
  });
}

function openViolationDropdown(){
  if (!violationDropdown) return;
  violationDropdown.hidden = false;
  violationToggle?.setAttribute('aria-expanded', 'true');
  violationSearch?.focus();
}

function closeViolationDropdown(){
  if (!violationDropdown) return;
  violationDropdown.hidden = true;
  violationToggle?.setAttribute('aria-expanded', 'false');
}

async function toggleViolationDropdown(){
  if (!violationDropdown) return violationToggle?.focus();
  if (violationDropdown.hidden) {
    // ensure catalog is loaded
    if (!violationsCatalog.length) await loadViolationsCatalog();
    // clear any previous search so user sees full list on click
    if (violationSearch) { violationSearch.value = ''; }
    renderViolationsList(violationsCatalog);
    openViolationDropdown();
  } else {
    closeViolationDropdown();
  }
}

function filterViolations(query){
  const q = String(query || '').trim().toLowerCase();
  if (!q) return renderViolationsList(violationsCatalog);
  const filtered = violationsCatalog.filter(v => (`${v.id} ${v.description} ${v.category}`).toLowerCase().includes(q));
  renderViolationsList(filtered);
}

document.addEventListener('click', (e) => {
  if (!violationDropdown) return;
  if (violationDropdown.hidden) return;
  if (e.target === violationToggle || violationToggle?.contains(e.target) || violationDropdown.contains(e.target)) return;
  closeViolationDropdown();
});

violationToggle?.addEventListener('click', toggleViolationDropdown);
violationSearch?.addEventListener('input', (e) => filterViolations(e.target.value));


const conversationSection = document.getElementById('appealConversation');
const conversationMeta = document.getElementById('conversationAppealMeta');
const conversationStatus = document.getElementById('conversationStatus');
const messageThread = document.getElementById('messageThread');
const messageForm = document.getElementById('appealMessageForm');
const messageInput = document.getElementById('appealMessageInput');
const messageSubmit = document.getElementById('appealMessageSubmit');
const studentNameEl = document.getElementById('studentName');
const studentSectionEl = document.getElementById('studentSection');
const studentAvatarEl = document.getElementById('studentAvatar');

function getAuthUser() {
  return window.SDMSAuth?.getUser?.() || null;
}

function getSenderRole() {
  const user = getAuthUser();
  if (!user) return 'Student';
  if (user.role === 'Admin' || user.role === 'Teacher') return user.role;
  return 'Student';
}

function populateProfile() {
  const user = getAuthUser();
  if (!user) return;
  const displayName = user.fullName || user.username || 'Student';
  studentNameEl.textContent = displayName;
  studentSectionEl.textContent = user.grade ? `Grade ${user.grade}` : '';
  if (studentAvatarEl) {
    studentAvatarEl.alt = displayName;
    studentAvatarEl.setAttribute('data-initial', displayName.slice(0, 1).toUpperCase());
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function truncate(text, max = 80) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderAppeals() {
  if (!appealRows) return;
  appealRows.innerHTML = '';
  if (!state.appeals.length) {
    const row = document.createElement('tr');
    row.dataset.placeholder = 'empty';
    row.innerHTML = '<td colspan="5" style="text-align:center; color:#888;">No appeals found.</td>';
    appealRows.appendChild(row);
    if (conversationSection) {
      conversationSection.hidden = true;
      messageSubmit?.setAttribute('disabled', 'disabled');
    }
    return;
  }

  state.appeals.forEach((appeal) => {
    const row = document.createElement('tr');
    row.dataset.id = String(appeal.id);
    const statusClass = (appeal.status || 'pending').toLowerCase();
    const latest = appeal.latestMessage;
    const lastPreview = latest
      ? `<div>${truncate(latest.body || '')}</div><small class="hint">${formatDateTime(latest.createdAt)}</small>`
      : '<span class="hint">No messages yet</span>';
    if (appeal.id === state.selectedAppealId) {
      row.classList.add('is-selected');
    }
    row.innerHTML = `
      <td>${formatDate(appeal.createdAt) || '—'}</td>
      <td>${appeal.violation || '—'}</td>
      <td>${appeal.reason || '—'}</td>
      <td><span class="status ${statusClass}">${appeal.status || 'Pending'}</span></td>
      <td>${lastPreview}</td>`;
    appealRows.appendChild(row);
  });
}

function updateConversationHeader(appeal) {
  if (!conversationSection) return;
  if (!appeal) {
    conversationSection.hidden = true;
    messageSubmit?.setAttribute('disabled', 'disabled');
    if (messageThread) {
      messageThread.innerHTML = '<p class="hint">Select an appeal to view messages.</p>';
    }
    return;
  }

  conversationSection.hidden = false;
  messageSubmit?.removeAttribute('disabled');
  if (conversationMeta) {
    conversationMeta.textContent = `${appeal.violation || 'Appeal'} • Submitted ${formatDateTime(appeal.createdAt)}`;
  }
  if (conversationStatus) {
    conversationStatus.textContent = appeal.status || 'Pending';
  }
}

function renderMessages() {
  if (!messageThread) return;
  messageThread.innerHTML = '';
  if (state.loadingMessages) {
    messageThread.innerHTML = '<p class="hint">Loading messages...</p>';
    return;
  }
  if (!state.messages.length) {
    messageThread.innerHTML = '<p class="hint">No messages yet. Start the conversation by sending the first reply.</p>';
    return;
  }

  const userRole = getSenderRole();
  state.messages.forEach((msg) => {
    const wrapper = document.createElement('div');
    const isMe = msg.senderRole === userRole;
    wrapper.className = `message-bubble ${isMe ? 'me' : 'them'}`;
    const bodyHtml = (msg.body || '').replace(/\n/g, '<br>');
    wrapper.innerHTML = `
      <div>${bodyHtml}</div>
      <div class="message-meta">
        <span>${isMe ? 'You' : (msg.senderRole || 'Admin')}</span>
        <span>${formatDateTime(msg.createdAt)}</span>
      </div>`;
    messageThread.appendChild(wrapper);
  });

  messageThread.scrollTop = messageThread.scrollHeight;
}

async function loadMessages(appealId) {
  if (!appealId) return;
  state.loadingMessages = true;
  renderMessages();
  try {
    const data = await api(`${APPEALS_BASE}/${appealId}/messages`);
    state.messages = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[student appeals] messages load failed', err);
    state.messages = [];
    if (messageThread) {
      messageThread.innerHTML = '<p class="hint" style="color:#e11d48;">Failed to load messages.</p>';
    }
    return;
  } finally {
    state.loadingMessages = false;
  }
  renderMessages();
}

function selectAppeal(appealId) {
  if (!appealId || state.selectedAppealId === appealId) return;
  const normalizedId = String(appealId);
  if (state.selectedAppealId === normalizedId) return;
  state.selectedAppealId = normalizedId;
  const appeal = state.appeals.find((a) => String(a.id) === normalizedId) || null;
  updateConversationHeader(appeal);
  renderAppeals();
  state.messages = [];
  renderMessages();
  loadMessages(normalizedId);
}

function handleAppealRowClick(event) {
  const row = event.target.closest('tr');
  if (!row || row.dataset.placeholder === 'empty' || !row.dataset.id) return;
  selectAppeal(row.dataset.id);
}

function guessLrn(user) {
  if (!user) return null;
  const candidate = user.username || '';
  return /^\d{6,}$/.test(candidate) ? candidate : null;
}

async function loadAppeals() {
  try {
    const data = await api(`${APPEALS_BASE}?mine=1`);
    state.appeals = Array.isArray(data) ? data : [];
    renderAppeals();
    if (state.appeals.length) {
      selectAppeal(state.appeals[0].id);
    } else {
      updateConversationHeader(null);
    }
  } catch (err) {
    console.error('[student appeals] load failed', err);
    state.appeals = [];
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" style="text-align:center;color:#e11d48;">Failed to load appeals.</td>';
    appealRows.innerHTML = '';
    appealRows.appendChild(row);
    updateConversationHeader(null);
  }
}

async function submitAppeal(event) {
  event.preventDefault();
  const violation = violationInput.value.trim();
  const reason = reasonInput.value.trim();
  if (!violation || !reason) {
    alert('Please fill in both the violation and your reason.');
    return;
  }

  const user = getAuthUser();
  const payload = {
    violation,
    reason,
    section: user?.grade || null,
    studentName: user?.fullName || null,
    lrn: guessLrn(user)
  };

  try {
    const created = await api(APPEALS_BASE, { method: 'POST', body: payload });
    state.appeals.unshift(created);
    renderAppeals();
    appealForm?.reset();
    selectAppeal(created.id);
    alert('Appeal submitted successfully.');
  } catch (err) {
    console.error('[student appeals] submit failed', err);
    alert(err.message || 'Failed to submit appeal.');
  }
}

async function submitMessage(event) {
  event.preventDefault();
  if (!state.selectedAppealId) return;
  const body = messageInput.value.trim();
  if (!body) return;

  messageSubmit?.setAttribute('disabled', 'disabled');
  try {
    const created = await api(`${APPEALS_BASE}/${state.selectedAppealId}/messages`, {
      method: 'POST',
      body: { body }
    });
    state.messages.push(created);
    renderMessages();
    messageInput.value = '';
    const appeal = state.appeals.find((a) => String(a.id) === state.selectedAppealId);
    if (appeal) {
      appeal.latestMessage = created;
      renderAppeals();
    }
  } catch (err) {
    console.error('[student appeals] message send failed', err);
    alert(err.message || 'Failed to send message.');
  } finally {
    messageSubmit?.removeAttribute('disabled');
  }
}

populateProfile();
// preload violations catalog (best-effort)
loadViolationsCatalog().catch(()=>{});
loadAppeals();
appealRows?.addEventListener('click', handleAppealRowClick);
appealForm?.addEventListener('submit', submitAppeal);
messageForm?.addEventListener('submit', submitMessage);

})();

