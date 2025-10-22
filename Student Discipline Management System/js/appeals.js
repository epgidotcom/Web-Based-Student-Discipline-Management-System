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
    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      try {
        const mod = await import(/* webpackIgnore: true */ url);
        if (mod && mod.api) { api = mod.api; return; }
      } catch (e) {
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

