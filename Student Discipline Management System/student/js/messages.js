import { api } from './api.js';

const DATE_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium'
});

const els = {
  messageList: document.getElementById('messageList'),
  reloadMessages: document.getElementById('reloadMessages'),
  inboxHint: document.getElementById('inboxHint'),
  noticeList: document.getElementById('noticeList'),
  studentName: document.getElementById('studentName'),
  studentSection: document.getElementById('studentSection'),
  studentAvatar: document.getElementById('studentAvatar'),
  messageForm: document.getElementById('messageForm'),
  messageSubject: document.getElementById('messageSubject'),
  messageBody: document.getElementById('messageBody'),
  messageStatus: document.getElementById('messageStatus'),
  sendMessageBtn: document.getElementById('sendMessageBtn')
};

const state = {
  messages: [],
  loadingMessages: false,
  lastUpdated: null,
  sending: false
};

function getAuthUser() {
  return window.SDMSAuth?.getUser?.() || null;
}

function populateProfile() {
  const user = getAuthUser();
  if (!user) return;
  const displayName = user.fullName || user.username || 'Student';
  const gradeText = user.grade ? `Grade ${user.grade}` : '';
  if (els.studentName) els.studentName.textContent = displayName;
  if (els.studentSection) els.studentSection.textContent = gradeText;
  if (els.studentAvatar) {
    els.studentAvatar.alt = displayName;
    els.studentAvatar.dataset.initial = displayName.slice(0, 1).toUpperCase();
  }
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseDate(value);
  return date ? DATE_TIME_FMT.format(date) : '';
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? DATE_FMT.format(date) : '';
}

function renderMessages() {
  if (!els.messageList) return;
  els.messageList.innerHTML = '';

  if (state.loadingMessages) {
    els.messageList.innerHTML = '<p class="hint">Loading messages…</p>';
    return;
  }

  if (!state.messages.length) {
    els.messageList.innerHTML = '<p class="hint">No messages yet. Guidance will reach out here when needed.</p>';
    return;
  }

  state.messages.forEach((msg) => {
    const card = document.createElement('article');
    card.className = 'message-card';

    const header = document.createElement('header');
    header.className = 'message-card__header';
    const title = document.createElement('h4');
    title.textContent = msg.subject || 'Guidance Update';
    header.appendChild(title);
    const meta = document.createElement('span');
    meta.className = 'message-card__meta';
    meta.textContent = formatDateTime(msg.createdAt) || '';
    header.appendChild(meta);
    card.appendChild(header);

    const author = document.createElement('p');
    author.className = 'message-card__author';
    const mine = (msg.senderRole || '').toLowerCase() === 'student';
    author.textContent = mine ? 'You' : (msg.senderName || msg.senderRole || 'Guidance');
    card.appendChild(author);

    const body = document.createElement('p');
    body.className = 'message-card__body';
    body.innerHTML = (msg.body || '').replace(/\n/g, '<br>');
    card.appendChild(body);

    els.messageList.appendChild(card);
  });
}

function setMessageStatus(text, tone = 'info') {
  if (!els.messageStatus) return;
  els.messageStatus.textContent = text || '';
  els.messageStatus.classList.remove('error', 'success');
  if (tone === 'error') {
    els.messageStatus.classList.add('error');
  } else if (tone === 'success') {
    els.messageStatus.classList.add('success');
  }
}

function toggleFormDisabled(disabled) {
  const finalState = Boolean(disabled);
  [els.messageSubject, els.messageBody, els.sendMessageBtn].forEach((el) => {
    if (!el) return;
    el.disabled = finalState;
    el.setAttribute('aria-disabled', String(finalState));
  });
  if (els.messageForm) {
    els.messageForm.classList.toggle('form-disabled', finalState);
  }
}

async function loadMessages({ silent = false } = {}) {
  if (!els.messageList) return;
  state.loadingMessages = true;
  renderMessages();
  try {
    const data = await api('/messages');
    state.messages = Array.isArray(data) ? data : [];
    state.lastUpdated = new Date();
  } catch (err) {
    console.error('[student/messages] failed to load', err);
    state.messages = [];
    els.messageList.innerHTML = '<p class="hint" style="color:#e11d48;">Failed to fetch messages.</p>';
  } finally {
    state.loadingMessages = false;
  }
  renderMessages();
  if (els.inboxHint) {
    if (state.lastUpdated) {
      els.inboxHint.textContent = `Updated ${DATE_TIME_FMT.format(state.lastUpdated)} · ${state.messages.length} message${state.messages.length === 1 ? '' : 's'}`;
    } else {
      els.inboxHint.textContent = 'Messages will appear here once sent by the guidance team.';
    }
  }
  if (!silent && !state.messages.length) {
    els.messageList.innerHTML = '<p class="hint">No messages yet. Guidance will reach out here when needed.</p>';
  }
}

async function loadAnnouncements() {
  if (!els.noticeList) return;
  try {
    const data = await api('/sms/announcements');
    const rows = Array.isArray(data) ? data : (data?.rows || []);
    if (!rows.length) {
      els.noticeList.innerHTML = '<li class="notice">No announcements at this time.</li>';
      return;
    }
    els.noticeList.innerHTML = '';
    rows.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'notice';
      const title = item.title || 'Announcement';
      const message = item.message || item.body || '';
      const created = formatDate(item.created_at) || '';
      li.innerHTML = `
        <strong>${title}</strong>
        <span>${message}</span>
        <small>${created}</small>`;
      els.noticeList.appendChild(li);
    });
  } catch (err) {
    console.error('[student/messages] announcements failed', err);
    els.noticeList.innerHTML = '<li class="notice" style="color:#e11d48;">Failed to load announcements.</li>';
  }
}

function bindEvents() {
  if (els.reloadMessages) {
    els.reloadMessages.addEventListener('click', () => {
      loadMessages({ silent: true });
    });
  }
  if (els.messageForm) {
    els.messageForm.addEventListener('submit', handleMessageSubmit);
  }
  if (els.messageBody) {
    els.messageBody.addEventListener('input', () => {
      if (els.messageBody.value.trim().length) {
        setMessageStatus('');
      }
    });
  }
}

async function handleMessageSubmit(event) {
  event.preventDefault();
  if (!els.messageBody) return;
  const body = (els.messageBody.value || '').trim();
  const subject = (els.messageSubject?.value || '').trim();
  if (!body) {
    setMessageStatus('Please type a message before sending.', 'error');
    return;
  }

  try {
    state.sending = true;
    toggleFormDisabled(true);
    setMessageStatus('Sending…');
    const created = await api('/messages', {
      method: 'POST',
      body: {
        body,
        subject: subject || undefined
      }
    });
    if (created) {
      state.messages.push(created);
      renderMessages();
      els.messageBody.value = '';
      if (els.messageSubject) els.messageSubject.value = '';
      setMessageStatus('Message sent successfully.', 'success');
      state.lastUpdated = new Date(created.createdAt || Date.now());
      if (els.inboxHint) {
        els.inboxHint.textContent = `Updated ${DATE_TIME_FMT.format(state.lastUpdated)} · ${state.messages.length} message${state.messages.length === 1 ? '' : 's'}`;
      }
    }
  } catch (err) {
    console.error('[student/messages] send failed', err);
    setMessageStatus(err.message || 'Failed to send message.', 'error');
  } finally {
    state.sending = false;
    toggleFormDisabled(false);
  }
}

async function init() {
  populateProfile();
  bindEvents();
  toggleFormDisabled(false);
  await Promise.all([loadMessages(), loadAnnouncements()]);
}

init();
