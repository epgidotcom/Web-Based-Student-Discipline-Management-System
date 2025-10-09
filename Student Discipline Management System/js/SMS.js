document.addEventListener('DOMContentLoaded', () => {
  const auth = window.SDMSAuth;
  if (auth?.requireRole && auth.requireRole(['admin', 'teacher']) === false) {
    return;
  }

  const API_ROOT = (() => {
    const base = window.API_BASE || window.SDMS_CONFIG?.API_BASE;
    if (!base) return '';
    return String(base).replace(/\/+$/, '');
  })();

  const state = {
    students: [],
    filteredStudents: [],
    threads: new Map(),
    activeStudentId: null,
    activeStudent: null,
    messages: [],
  };

  const els = {
    studentSearch: document.getElementById('studentSearch'),
    studentSelect: document.getElementById('studentSelect'),
    recipientSummary: document.getElementById('recipientSummary'),
    conversationPlaceholder: document.getElementById('conversationPlaceholder'),
    conversationHeader: document.getElementById('conversationHeader'),
    conversationTitle: document.getElementById('conversationTitle'),
    conversationSubtitle: document.getElementById('conversationSubtitle'),
    messageHistory: document.getElementById('messageHistory'),
    reloadMessages: document.getElementById('reloadMessages'),
    messageForm: document.getElementById('messageForm'),
    subjectInput: document.getElementById('subjectInput'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    messageStatus: document.getElementById('messageStatus'),
    refreshStudents: document.getElementById('refreshStudents'),
    returnBtn: document.getElementById('returnBtn'),
    backToMessaging: document.getElementById('backToMessaging'),
    parentSmsForm: document.getElementById('parentSmsForm'),
    smsPhone: document.getElementById('smsPhone'),
    smsStudent: document.getElementById('smsStudent'),
    smsGrade: document.getElementById('smsGrade'),
    smsViolation: document.getElementById('smsViolation'),
    smsDate: document.getElementById('smsDate'),
    smsType: document.getElementById('smsType'),
    smsSanction: document.getElementById('smsSanction'),
    smsTeacher: document.getElementById('smsTeacher'),
    smsMessage: document.getElementById('smsMessage'),
    smsCharCount: document.getElementById('smsCharCount'),
    smsGenerate: document.getElementById('smsGenerate'),
    smsReset: document.getElementById('smsReset'),
    smsPreview: document.getElementById('smsPreview'),
    smsSend: document.getElementById('smsSend'),
    smsStatus: document.getElementById('smsStatus'),
  };

  const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const SHORT_DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

  let formBusy = false;
  let statusTimer = null;
  let smsBusy = false;
  let smsStatusTimer = null;

  function normalizeTerm(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function truncate(value, length = 80) {
    const str = String(value || '').trim();
    if (!str) return '';
    return str.length > length ? `${str.slice(0, length - 1)}…` : str;
  }

  function authHeaders() {
    const token = window.SDMSAuth?.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchJson(path, { method = 'GET', headers = {}, body, skipAuthRedirect = false } = {}) {
    if (!API_ROOT) throw new Error('API base URL is not configured');
    const url = path.startsWith('http') ? path : `${API_ROOT}${path}`;
    const init = {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...headers },
    };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : null;
    if (res.status === 401 && !skipAuthRedirect) {
      window.location.href = 'index.html';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const message = data?.error || data?.message || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function clearStatusTimer() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
  }

  function setMessageStatus(text, tone = 'info') {
    if (!els.messageStatus) return;
    clearStatusTimer();
    els.messageStatus.textContent = text || '';
    els.messageStatus.classList.remove('error', 'success');
    if (tone === 'error') {
      els.messageStatus.classList.add('error');
    } else if (tone === 'success') {
      els.messageStatus.classList.add('success');
      const cleanupText = text;
      statusTimer = window.setTimeout(() => {
        if (els.messageStatus.textContent === cleanupText) {
          els.messageStatus.textContent = '';
          els.messageStatus.classList.remove('success');
        }
      }, 4000);
    }
  }

  function clearSmsStatusTimer() {
    if (smsStatusTimer) {
      clearTimeout(smsStatusTimer);
      smsStatusTimer = null;
    }
  }

  function setSmsStatus(text, tone = 'info') {
    if (!els.smsStatus) return;
    clearSmsStatusTimer();
    els.smsStatus.textContent = text || '';
    els.smsStatus.classList.remove('error', 'success');
    if (tone === 'error') {
      els.smsStatus.classList.add('error');
    } else if (tone === 'success') {
      els.smsStatus.classList.add('success');
      const cleanupText = text;
      smsStatusTimer = window.setTimeout(() => {
        if (els.smsStatus.textContent === cleanupText) {
          els.smsStatus.textContent = '';
          els.smsStatus.classList.remove('success');
        }
      }, 4000);
    }
  }

  function setSmsBusy(busy) {
    smsBusy = Boolean(busy);
    const controls = [
      els.smsPhone,
      els.smsStudent,
      els.smsGrade,
      els.smsViolation,
      els.smsDate,
      els.smsType,
      els.smsSanction,
      els.smsTeacher,
      els.smsMessage,
      els.smsGenerate,
      els.smsReset,
      els.smsPreview,
      els.smsSend,
    ];
    controls.forEach((control) => {
      if (!control) return;
      control.disabled = smsBusy;
      if (smsBusy) {
        control.setAttribute('aria-disabled', 'true');
      } else {
        control.removeAttribute('aria-disabled');
      }
    });
    if (els.parentSmsForm) {
      els.parentSmsForm.classList.toggle('form-disabled', smsBusy);
    }
  }

  function sanitizePhone(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function formatIncidentDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function updateSmsCharacterCount() {
    if (!els.smsMessage || !els.smsCharCount) return;
    const message = els.smsMessage.value || '';
    const length = message.length;
    const segments = length === 0 ? 0 : Math.ceil(length / 160);
    const lengthLabel = `${length} character${length === 1 ? '' : 's'}`;
    const segmentLabel = `${segments} SMS segment${segments === 1 ? '' : 's'}`;
    els.smsCharCount.textContent = `${lengthLabel} · ${segmentLabel} (160 chars per SMS)`;
  }

  function buildSmsTemplate() {
    const studentName = (els.smsStudent?.value || '').trim();
    const gradeSection = (els.smsGrade?.value || '').trim();
    const violation = (els.smsViolation?.value || '').trim();
    const violationType = (els.smsType?.value || '').trim();
    const sanction = (els.smsSanction?.value || '').trim();
    const incidentDate = formatIncidentDate(els.smsDate?.value);
    const teacher = (els.smsTeacher?.value || '').trim();

    const subjectLine = studentName
      ? `Notice for ${studentName}${gradeSection ? ` (${gradeSection})` : ''}`
      : 'Notice regarding your child';
    const violationLine = violation ? ` due to ${violation}${violationType ? ` (${violationType})` : ''}` : '';
    const dateLine = incidentDate ? ` on ${incidentDate}` : '';
    const sanctionLine = sanction ? ` Sanction: ${sanction}.` : '';
    const teacherLine = teacher ? ` Please coordinate with ${teacher}.` : '';

    return `MPNAG Discipline: ${subjectLine}${violationLine}${dateLine}.` +
      `${sanctionLine}${teacherLine} Thank you.`;
  }

  function resetParentSmsForm() {
    if (!els.parentSmsForm) return;
    els.parentSmsForm.reset();
    updateSmsCharacterCount();
  }

  function previewParentSms() {
    if (!els.smsMessage) return;
    const message = (els.smsMessage.value || '').trim();
    if (!message) {
      setSmsStatus('Enter or generate a message before previewing.', 'error');
      els.smsMessage.focus();
      return;
    }
    window.alert(`SMS Preview:\n\n${message}`);
  }

  function ensurePhoneValid(rawPhone) {
    const phone = sanitizePhone(rawPhone);
    if (!/^09\d{9}$/.test(phone)) {
      throw new Error('Enter a valid 11-digit mobile number starting with 09.');
    }
    return phone;
  }

  async function sendParentSms(event) {
    event.preventDefault();
    if (!els.parentSmsForm) return;

    const rawPhone = els.smsPhone?.value || '';
    const message = (els.smsMessage?.value || '').trim();

    try {
      const phone = ensurePhoneValid(rawPhone);
      if (!message) {
        throw new Error('Message body is required.');
      }

      setSmsBusy(true);
      setSmsStatus('Sending SMS…');

      const payload = { phone, message };
      const metadata = {
        studentName: (els.smsStudent?.value || '').trim() || null,
        gradeSection: (els.smsGrade?.value || '').trim() || null,
        violation: (els.smsViolation?.value || '').trim() || null,
        violationType: (els.smsType?.value || '').trim() || null,
        incidentDate: els.smsDate?.value || null,
        sanction: (els.smsSanction?.value || '').trim() || null,
        teacher: (els.smsTeacher?.value || '').trim() || null,
      };
      const cleanedMetadata = Object.fromEntries(
        Object.entries(metadata).filter(([, v]) => v !== null && v !== '')
      );
      if (Object.keys(cleanedMetadata).length) {
        payload.metadata = cleanedMetadata;
      }

      const res = await fetchJson('/sms/sanctions/send', { method: 'POST', body: payload });
      console.info('[sms] sanction notification response', res);
      setSmsStatus('SMS sent successfully.', 'success');
      resetParentSmsForm();
    } catch (err) {
      console.error('[sms] failed to send sanction SMS', err);
      setSmsStatus(err.message || 'Failed to send SMS.', 'error');
      const message = err?.message || '';
      if (message.includes('11-digit')) {
        els.smsPhone?.focus();
      } else if (message.includes('Message body')) {
        els.smsMessage?.focus();
      } else {
        els.smsSend?.focus();
      }
    } finally {
      setSmsBusy(false);
    }
  }

  function resortStudents() {
    state.students.sort((a, b) => {
      const aTime = parseDate(a.lastMessage?.createdAt)?.getTime() || 0;
      const bTime = parseDate(b.lastMessage?.createdAt)?.getTime() || 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    });
  }

  function refreshFormState() {
    const disabled = formBusy || !state.activeStudent;
    [els.subjectInput, els.messageInput, els.sendBtn].forEach((el) => {
      if (!el) return;
      el.disabled = disabled;
      el.setAttribute('aria-disabled', String(disabled));
    });
    if (els.messageForm) {
      els.messageForm.classList.toggle('form-disabled', disabled);
    }
  }

  function setFormBusy(busy) {
    formBusy = Boolean(busy);
    refreshFormState();
  }

  function showHistoryState(text, variant = 'empty') {
    if (!els.messageHistory) return;
    els.messageHistory.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = `history-placeholder ${variant}`;
    wrap.textContent = text;
    els.messageHistory.appendChild(wrap);
  }

  function showConversationPlaceholder() {
    if (els.conversationPlaceholder) els.conversationPlaceholder.hidden = false;
    if (els.conversationHeader) els.conversationHeader.hidden = true;
    if (els.messageHistory) {
      els.messageHistory.innerHTML = '';
    }
    refreshFormState();
  }

  function hideConversationPlaceholder() {
    if (els.conversationPlaceholder) els.conversationPlaceholder.hidden = true;
    if (els.conversationHeader) els.conversationHeader.hidden = false;
    refreshFormState();
  }

  function updateRecipientSummary(student) {
    if (!els.recipientSummary) return;
    els.recipientSummary.innerHTML = '';
    if (!student) {
      const empty = document.createElement('p');
      empty.className = 'summary-empty';
      empty.textContent = 'Select a student to review their profile and history.';
      els.recipientSummary.appendChild(empty);
      return;
    }

    const name = document.createElement('div');
    name.className = 'summary-name';
    name.textContent = student.displayName;
    els.recipientSummary.appendChild(name);

    const list = document.createElement('ul');
    list.className = 'summary-list';

    const makeItem = (label, value) => {
      if (!value && value !== 0) return;
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = `${label}:`;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(` ${value}`));
      list.appendChild(li);
    };

    makeItem('Username', student.username ? `@${student.username}` : null);
    makeItem('Grade', student.grade ? `Grade ${student.grade}` : null);
    makeItem('Messages', student.messageCount || 0);

    const lastDate = parseDate(student.lastMessage?.createdAt);
    if (lastDate) {
      makeItem('Last activity', DATE_FMT.format(lastDate));
      const preview = truncate(student.lastMessage?.body, 120);
      if (preview) {
        makeItem('Recent note', preview);
      }
    }

    if (list.children.length) {
      els.recipientSummary.appendChild(list);
    }
  }

  function updateConversationHeader(student) {
    if (!student) {
      showConversationPlaceholder();
      return;
    }
    hideConversationPlaceholder();
    if (els.conversationTitle) {
      els.conversationTitle.textContent = student.displayName;
    }
    if (els.conversationSubtitle) {
      const parts = [];
      if (student.username) parts.push(`@${student.username}`);
      if (student.grade) parts.push(`Grade ${student.grade}`);
      if (student.messageCount) {
        parts.push(`${student.messageCount} message${student.messageCount > 1 ? 's' : ''}`);
      }
      els.conversationSubtitle.textContent = parts.join(' • ');
    }
  }

  function renderMessages(list) {
    if (!els.messageHistory) return;
    els.messageHistory.innerHTML = '';

    if (!list.length) {
      showHistoryState('No messages yet. Start the conversation below.', 'empty');
      return;
    }

    list.forEach((msg) => {
      const outgoing = (msg.senderRole || '').toLowerCase() !== 'student';
      const bubble = document.createElement('article');
      bubble.className = `message-bubble ${outgoing ? 'from-admin' : 'from-student'}`;

      if (msg.subject) {
        const subjectEl = document.createElement('div');
        subjectEl.className = 'subject';
        subjectEl.textContent = msg.subject;
        bubble.appendChild(subjectEl);
      }

      const bodyEl = document.createElement('p');
      bodyEl.className = 'body';
      bodyEl.textContent = msg.body || '';
      bubble.appendChild(bodyEl);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const author = document.createElement('span');
      author.textContent = outgoing ? (msg.senderName || msg.senderRole || 'Staff') : (state.activeStudent?.displayName || 'Student');
      const created = document.createElement('time');
      const stamp = parseDate(msg.createdAt);
      if (stamp) {
        created.dateTime = stamp.toISOString();
        created.textContent = DATE_FMT.format(stamp);
      } else {
        created.textContent = '';
      }
      meta.appendChild(author);
      meta.appendChild(created);
      bubble.appendChild(meta);

      els.messageHistory.appendChild(bubble);
    });

    els.messageHistory.scrollTop = els.messageHistory.scrollHeight;
  }

  function buildStudent(account, thread) {
    const displayName = (thread?.studentName || account.fullName || '').trim() || account.username || 'Student';
    const grade = account.grade ?? thread?.studentGrade ?? null;
    const messageCount = Number(thread?.messageCount || 0);
    const searchTerm = normalizeTerm([
      displayName,
      account.username,
      thread?.studentUsername,
      grade ? `grade ${grade}` : '',
    ].filter(Boolean).join(' '));

    return {
      id: account.id,
      displayName,
      username: account.username || '',
      grade: grade ? Number(grade) : null,
      messageCount,
      lastMessage: thread?.lastMessage || null,
      searchTerm,
    };
  }

  function renderStudentOptions(list) {
    if (!els.studentSelect) return;
    els.studentSelect.innerHTML = '';

    if (!list.length) {
      els.studentSelect.disabled = true;
      const opt = document.createElement('option');
      opt.textContent = 'No students found';
      opt.disabled = true;
      opt.selected = true;
      els.studentSelect.appendChild(opt);
      return;
    }

    els.studentSelect.disabled = false;
    list.forEach((student) => {
      const option = document.createElement('option');
      option.value = String(student.id);
      const details = [];
      if (student.grade) details.push(`G${student.grade}`);
      if (student.messageCount) details.push(`${student.messageCount} msg${student.messageCount > 1 ? 's' : ''}`);
      const lastDate = parseDate(student.lastMessage?.createdAt);
      if (lastDate) {
        details.push(SHORT_DATE_FMT.format(lastDate));
      }
      option.textContent = details.length
        ? `${student.displayName} • ${details.join(' • ')}`
        : student.displayName;
      if (student.id === state.activeStudentId) {
        option.selected = true;
      }
      els.studentSelect.appendChild(option);
    });
  }

  function applyFilter() {
    const term = normalizeTerm(els.studentSearch?.value || '');
    if (!term) {
      state.filteredStudents = [...state.students];
    } else {
      state.filteredStudents = state.students.filter((s) => s.searchTerm.includes(term));
    }
    renderStudentOptions(state.filteredStudents);
  }

  function setActiveStudent(studentId, { skipLoad = false } = {}) {
    const numericId = studentId ? Number(studentId) : null;
    if (numericId === state.activeStudentId && !skipLoad) {
      return;
    }

    state.activeStudentId = numericId;
    state.activeStudent = state.students.find((s) => s.id === numericId) || null;

    updateRecipientSummary(state.activeStudent);
    updateConversationHeader(state.activeStudent);
    refreshFormState();

    if (!state.activeStudent) {
      state.messages = [];
      showConversationPlaceholder();
      return;
    }

    if (!skipLoad) {
      loadMessages(state.activeStudent.id);
    }
  }

  function updateThreadMetadata(studentId, message) {
    if (!studentId || !message) return;
    const existing = state.threads.get(studentId) || { messageCount: 0, lastMessage: null };
    const updatedCount = (existing.messageCount || 0) + 1;
    const updatedLast = {
      subject: message.subject || null,
      body: message.body || '',
      createdAt: message.createdAt,
      senderRole: message.senderRole,
      senderName: message.senderName || null,
    };
    const updated = { ...existing, messageCount: updatedCount, lastMessage: updatedLast };
    state.threads.set(studentId, updated);

    const target = state.students.find((s) => s.id === studentId);
    if (target) {
      target.messageCount = updated.messageCount;
      target.lastMessage = updated.lastMessage;
    }
    resortStudents();
  }

  async function loadStudents({ quiet } = {}) {
    if (!API_ROOT) {
      setMessageStatus('API base URL is not configured.', 'error');
      showConversationPlaceholder();
      refreshFormState();
      return;
    }
    if (els.refreshStudents) {
      els.refreshStudents.disabled = true;
    }
    try {
      const [accounts, threads] = await Promise.all([
        fetchJson('/accounts/students'),
        fetchJson('/messages/threads').catch((err) => {
          console.warn('[messages] threads lookup failed', err);
          return [];
        }),
      ]);

      state.threads.clear();
      threads?.forEach((thread) => {
        if (!thread?.studentAccountId) return;
        state.threads.set(Number(thread.studentAccountId), thread);
      });

      const studentAccounts = Array.isArray(accounts) ? accounts : [];

      state.students = studentAccounts.map((acc) => {
        const thread = state.threads.get(Number(acc.id));
        return buildStudent(acc, thread);
      });

      resortStudents();
      applyFilter();

      if (state.activeStudentId) {
        const stillExists = state.students.some((s) => s.id === state.activeStudentId);
        if (!stillExists) {
          state.activeStudentId = null;
          state.activeStudent = null;
          showConversationPlaceholder();
          setMessageStatus('Previously selected student is no longer available.', 'error');
        } else {
          setActiveStudent(state.activeStudentId, { skipLoad: true });
        }
      }
      if (!quiet) {
        setMessageStatus(`Loaded ${state.students.length} student account${state.students.length === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      console.error('[messages] failed to load students', err);
      setMessageStatus(err.message || 'Failed to load students', 'error');
      state.students = [];
      applyFilter();
      showConversationPlaceholder();
    } finally {
      if (els.refreshStudents) {
        els.refreshStudents.disabled = false;
      }
    }
  }

  async function loadMessages(studentId, { silent } = {}) {
    if (!studentId) return;
    showHistoryState('Loading messages…', 'loading');
    try {
      const data = await fetchJson(`/messages?studentAccountId=${encodeURIComponent(studentId)}`);
      state.messages = Array.isArray(data) ? data : [];
      const thread = state.threads.get(studentId);
      if (thread) {
        thread.messageCount = state.messages.length;
        thread.lastMessage = state.messages.length ? state.messages[state.messages.length - 1] : null;
      }
      const target = state.students.find((s) => s.id === studentId);
      if (target) {
        target.messageCount = state.messages.length;
        target.lastMessage = state.messages.length ? state.messages[state.messages.length - 1] : null;
      }
      resortStudents();
      renderMessages(state.messages);
      applyFilter();
      if (!silent) {
        setMessageStatus(`Loaded ${state.messages.length} message${state.messages.length === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      console.error('[messages] failed to load conversation', err);
      showHistoryState(err.message || 'Unable to load messages.', 'error');
      setMessageStatus(err.message || 'Failed to load messages', 'error');
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    if (!state.activeStudent) {
      setMessageStatus('Select a student before sending a message.', 'error');
      return;
    }

    const body = (els.messageInput?.value || '').trim();
    const subjectRaw = (els.subjectInput?.value || '').trim();
    if (!body) {
      setMessageStatus('Message body is required.', 'error');
      els.messageInput?.focus();
      return;
    }

    setFormBusy(true);
    setMessageStatus('Sending message…');

    try {
      const payload = {
        studentAccountId: state.activeStudent.id,
        body,
        subject: subjectRaw ? subjectRaw : null,
      };
      const message = await fetchJson('/messages', { method: 'POST', body: payload });
      if (!message) throw new Error('Message API returned no data');

      els.messageInput.value = '';
      els.subjectInput.value = '';

      state.messages.push(message);
      renderMessages(state.messages);
      updateThreadMetadata(state.activeStudent.id, message);
      applyFilter();
      updateConversationHeader(state.activeStudent);
      setMessageStatus('Message sent successfully.', 'success');
      els.messageInput.focus();
    } catch (err) {
      console.error('[messages] failed to send', err);
      setMessageStatus(err.message || 'Failed to send message', 'error');
    } finally {
      setFormBusy(false);
    }
  }

  function bindEvents() {
    if (els.studentSearch) {
      els.studentSearch.addEventListener('input', applyFilter);
      els.studentSearch.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          els.studentSearch.value = '';
          applyFilter();
        }
      });
    }

    if (els.studentSelect) {
      els.studentSelect.addEventListener('change', (ev) => {
        const value = ev.target.value;
        setActiveStudent(value ? Number(value) : null);
      });
      els.studentSelect.addEventListener('dblclick', () => {
        if (!state.activeStudent && els.studentSelect?.value) {
          setActiveStudent(Number(els.studentSelect.value));
        }
        els.messageInput?.focus();
      });
    }

    if (els.refreshStudents) {
      els.refreshStudents.addEventListener('click', () => {
        loadStudents({ quiet: true });
      });
    }

    if (els.reloadMessages) {
      els.reloadMessages.addEventListener('click', () => {
        if (!state.activeStudentId) {
          setMessageStatus('Select a student to refresh messages.', 'error');
          return;
        }
        loadMessages(state.activeStudentId, { silent: true });
      });
    }

    if (els.messageForm) {
      els.messageForm.addEventListener('submit', handleSend);
    }

    if (els.returnBtn) {
      els.returnBtn.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
      });
    }

    if (els.backToMessaging) {
      els.backToMessaging.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (els.smsMessage) {
      els.smsMessage.addEventListener('input', updateSmsCharacterCount);
    }

    if (els.smsGenerate) {
      els.smsGenerate.addEventListener('click', () => {
        const template = buildSmsTemplate();
        if (els.smsMessage) {
          els.smsMessage.value = template;
          updateSmsCharacterCount();
        }
        setSmsStatus('Template message generated. Review before sending.');
      });
    }

    if (els.smsReset) {
      els.smsReset.addEventListener('click', () => {
        resetParentSmsForm();
        setSmsStatus('Form reset.');
      });
    }

    if (els.smsPreview) {
      els.smsPreview.addEventListener('click', () => {
        previewParentSms();
      });
    }

    if (els.parentSmsForm) {
      els.parentSmsForm.addEventListener('submit', sendParentSms);
    }
  }

  function init() {
    refreshFormState();
    showConversationPlaceholder();
    updateRecipientSummary(null);
    bindEvents();
    if (!API_ROOT) {
      setMessageStatus('API base URL is not configured.', 'error');
      return;
    }
    updateSmsCharacterCount();
    setSmsStatus('');
    loadStudents();
  }

  init();
});
