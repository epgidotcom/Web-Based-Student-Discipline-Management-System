import { api } from './api.js';

const API_ORIGIN = (window.SDMS_CONFIG?.API_BASE || 'https://sdms-backend.onrender.com').replace(/\/+$/, '');
const APPEALS_BASE = `${API_ORIGIN}/api/appeals`;

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
loadAppeals();
appealRows?.addEventListener('click', handleAppealRowClick);
appealForm?.addEventListener('submit', submitAppeal);
messageForm?.addEventListener('submit', submitMessage);

