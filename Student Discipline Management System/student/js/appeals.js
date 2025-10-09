import { api } from './api.js';

const state = {
  appeals: [],
  selectedAppealId: null
};

const appealRows = document.getElementById('appealRows');
const appealForm = document.getElementById('appealForm');
const violationInput = document.getElementById('violationText');
const reasonInput = document.getElementById('appealReason');

const studentNameEl = document.getElementById('studentName');
const studentSectionEl = document.getElementById('studentSection');
const studentAvatarEl = document.getElementById('studentAvatar');

function getAuthUser() {
  return window.SDMSAuth?.getUser?.() || null;
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
    if (String(appeal.id) === state.selectedAppealId) {
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

function selectAppeal(appealId) {
  if (!appealId || state.selectedAppealId === appealId) return;
  const normalizedId = String(appealId);
  if (state.selectedAppealId === normalizedId) return;
  state.selectedAppealId = normalizedId;
  const appeal = state.appeals.find((a) => String(a.id) === normalizedId) || null;
  renderAppeals();
  if (!appeal) {
    return;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (violationInput) violationInput.value = appeal.violation || '';
  if (reasonInput) reasonInput.value = appeal.reason || '';
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
    const data = await api('/appeals?mine=1');
    state.appeals = Array.isArray(data) ? data : [];
    state.selectedAppealId = null;
    renderAppeals();
    if (state.appeals.length) selectAppeal(state.appeals[0].id);
  } catch (err) {
    console.error('[student appeals] load failed', err);
    state.appeals = [];
    if (appealRows) {
      appealRows.innerHTML = '';
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5" style="text-align:center;color:#e11d48;">Failed to load appeals.</td>';
      appealRows.appendChild(row);
    }
  }
}

async function sendAppealNotification({ violation, reason, appealId }) {
  const subject = violation ? `Appeal submitted: ${violation}` : 'New appeal submitted';
  const lines = [
    `A new appeal has been submitted${appealId ? ` (#${appealId})` : ''}.`,
    violation ? `Violation: ${violation}` : null,
    '',
    'Reason provided:',
    reason || '(no reason supplied)'
  ].filter(Boolean);

  return api('/messages', {
    method: 'POST',
    body: {
      subject,
      body: lines.join('\n')
    }
  });
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
    const created = await api('/appeals', { method: 'POST', body: payload });
    state.appeals.unshift(created);
    renderAppeals();
    appealForm?.reset();
    selectAppeal(created.id);
    let notified = false;
    let createdMessage = null;
    try {
      createdMessage = await sendAppealNotification({ violation, reason, appealId: created?.id });
      notified = true;
    } catch (notifyErr) {
      console.error('[student appeals] notification error', notifyErr);
    }

    if (createdMessage) {
      const idx = state.appeals.findIndex((item) => String(item.id) === String(created.id));
      if (idx !== -1) {
        state.appeals[idx] = {
          ...state.appeals[idx],
          latestMessage: {
            senderRole: createdMessage.senderRole,
            senderName: createdMessage.senderName || null,
            createdAt: createdMessage.createdAt,
            body: createdMessage.body
          }
        };
        renderAppeals();
      }
    }

    if (notified) {
      alert('Appeal submitted successfully.');
    } else {
      alert('Appeal submitted, but guidance could not be notified automatically.');
    }
  } catch (err) {
    console.error('[student appeals] submit failed', err);
    alert(err.message || 'Failed to submit appeal.');
  }
}

populateProfile();
loadAppeals();
appealRows?.addEventListener('click', handleAppealRowClick);
appealForm?.addEventListener('submit', submitAppeal);

