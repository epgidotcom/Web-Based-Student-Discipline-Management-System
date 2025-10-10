import { api } from '../student/js/api.js';

const contactListEl = document.getElementById('studentMessageContacts');
const searchInput = document.getElementById('studentMessageSearch');
const threadEl = document.getElementById('studentMessageThread');
const partnerName = document.getElementById('studentMessagePartner');
const partnerMeta = document.getElementById('studentMessageMeta');
const formEl = document.getElementById('studentMessageForm');
const textareaEl = document.getElementById('studentMessageInput');
const submitBtn = document.getElementById('studentMessageSubmit');

const state = {
  contacts: [],
  filter: '',
  activeContactId: null,
  messages: [],
  loading: false
};

function ensureAdmin() {
  if (window.SDMSAuth?.requireRole) {
    window.SDMSAuth.requireRole(['Admin', 'Teacher']);
  }
}

function getAuthUser() {
  return window.SDMSAuth?.getUser?.() || null;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function renderContacts() {
  if (!contactListEl) return;
  const list = state.contacts.filter((contact) => {
    if (!state.filter) return true;
    const term = state.filter.toLowerCase();
    return (
      (contact.name || '').toLowerCase().includes(term) ||
      (contact.grade || '').toLowerCase().includes(term)
    );
  });

  if (!list.length) {
    contactListEl.innerHTML = '<li class="empty">No students found.</li>';
    return;
  }

  contactListEl.innerHTML = '';
  list.forEach((contact) => {
    const li = document.createElement('li');
    li.dataset.id = contact.id;
    if (contact.id === state.activeContactId) li.classList.add('active');
    li.innerHTML = `
      <span class="contact-name">${contact.name || 'Student'}</span>
      <span class="contact-meta">${contact.grade ? contact.grade : 'Student'}</span>
    `;
    li.addEventListener('click', () => selectContact(contact.id));
    contactListEl.appendChild(li);
  });
}

function renderMessages() {
  if (!threadEl) return;
  threadEl.innerHTML = '';

  if (!state.activeContactId) {
    threadEl.innerHTML = '<p class="hint">Choose a student to view the conversation.</p>';
    submitBtn?.setAttribute('disabled', 'disabled');
    return;
  }

  if (state.loading) {
    threadEl.innerHTML = '<p class="hint">Loading messages…</p>';
    submitBtn?.setAttribute('disabled', 'disabled');
    return;
  }

  if (!state.messages.length) {
    threadEl.innerHTML = '<p class="hint">No messages yet. Start the conversation with a quick note.</p>';
    submitBtn?.removeAttribute('disabled');
    return;
  }

  const user = getAuthUser();
  const adminId = user?.id || user?.account?.id || null;

  state.messages.forEach((msg) => {
    const bubble = document.createElement('div');
    const isMine = msg.sender?.id === adminId;
    bubble.className = `message-bubble ${isMine ? 'me' : 'them'}`;
    bubble.innerHTML = `
      <div>${(msg.body || '').replace(/\n/g, '<br>')}</div>
      <div class="message-meta">
        <span>${isMine ? 'You' : (msg.sender?.name || 'Student')}</span>
        <span>${formatDateTime(msg.createdAt)}</span>
      </div>
    `;
    threadEl.appendChild(bubble);
  });

  submitBtn?.removeAttribute('disabled');
  threadEl.scrollTop = threadEl.scrollHeight;
}

async function loadContacts() {
  if (!contactListEl) return;
  contactListEl.innerHTML = '<li class="empty">Loading…</li>';
  try {
    const data = await api('/messages/participants');
    state.contacts = Array.isArray(data?.participants) ? data.participants : [];
    if (!state.contacts.length) {
      contactListEl.innerHTML = '<li class="empty">No student accounts available.</li>';
      partnerName.textContent = 'No students found';
      partnerMeta.textContent = 'Invite students to log in before messaging.';
      submitBtn?.setAttribute('disabled', 'disabled');
      return;
    }
    renderContacts();
    if (!state.activeContactId && state.contacts.length) {
      selectContact(state.contacts[0].id);
    }
  } catch (err) {
    console.error('[admin messages] participants failed', err);
    contactListEl.innerHTML = '<li class="empty" style="color:#e11d48;">Failed to load student list.</li>';
    partnerName.textContent = 'Unable to load students';
    partnerMeta.textContent = err.message || 'Please try again later.';
    submitBtn?.setAttribute('disabled', 'disabled');
  }
}

async function loadMessages() {
  if (!state.activeContactId) return;
  state.loading = true;
  renderMessages();
  try {
    const params = new URLSearchParams({ participantId: state.activeContactId });
    const data = await api(`/messages?${params.toString()}`);
    state.messages = Array.isArray(data?.messages) ? data.messages : [];
  } catch (err) {
    console.error('[admin messages] load failed', err);
    threadEl.innerHTML = `<p class="hint" style="color:#e11d48;">Failed to load conversation. ${err.message || ''}</p>`;
    submitBtn?.setAttribute('disabled', 'disabled');
    return;
  } finally {
    state.loading = false;
  }
  renderMessages();
}

function selectContact(contactId) {
  if (!contactId || state.activeContactId === contactId) return;
  state.activeContactId = contactId;
  const contact = state.contacts.find((c) => c.id === contactId) || null;
  partnerName.textContent = contact?.name || 'Student';
  partnerMeta.textContent = contact?.grade ? contact.grade : 'Student';
  renderContacts();
  loadMessages();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!state.activeContactId) return;
  const text = textareaEl.value.trim();
  if (!text) return;

  submitBtn?.setAttribute('disabled', 'disabled');
  try {
    const payload = { receiverId: state.activeContactId, content: text };
    const data = await api('/messages', { method: 'POST', body: payload });
    if (data?.message) {
      state.messages.push(data.message);
      renderMessages();
    }
    textareaEl.value = '';
  } catch (err) {
    console.error('[admin messages] send failed', err);
    alert(err.message || 'Failed to send message.');
  } finally {
    submitBtn?.removeAttribute('disabled');
    textareaEl.focus();
  }
}

ensureAdmin();

if (formEl) {
  formEl.addEventListener('submit', handleSubmit);
}

if (searchInput) {
  searchInput.addEventListener('input', (event) => {
    state.filter = event.target.value.trim();
    renderContacts();
  });
}

loadContacts();