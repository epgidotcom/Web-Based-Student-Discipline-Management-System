// js/sms.js — SMS compose/send (lowercase filename for case-sensitive hosts)

document.addEventListener('DOMContentLoaded', () => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const API_ORIGIN = (window.API_BASE || '').replace(/\/+$/, '')
    || `${(window.SDMS_CONFIG?.API_BASE || '').replace(/\/+$/, '')}/api`.replace(/\/+$/, '');
  const getToken = () => window.SDMSAuth?.getToken?.() || null;

  // --- Helpers ---------------------------------------------------------------
  const fmtDateUS = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  };

  const getVal = (id) => $(`#${id}`)?.value?.trim() ?? '';

  // Welcome clock (if present)
  const welcomeClock = $('#welcomeClock');
  if (welcomeClock) {
    welcomeClock.textContent = `Today · ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
  }

  // --- Message builder -------------------------------------------------------
  function buildMessage(templateKey) {
    const student   = getVal('student');
    const grade     = getVal('grade');
    const violation = getVal('violation');
    const sanction  = getVal('sanction');
    const date      = fmtDateUS($('#date')?.value ?? '');
    const teacher   = getVal('teacher');

    const firstName = (student.split(' ')[0] || 'your child');
    const base = `Parent/Guardian of ${student} (${grade}),`;
    let body;

    switch (templateKey) {
      case 'minor':
        body = `${base} this is to inform you of a minor offense recorded on ${date}: ${violation}. The sanction is ${sanction}. Kindly remind ${firstName} to follow school rules. Teacher-in-Charge: ${teacher}.`;
        break;
      case 'major':
        body = `${base} a major offense was recorded on ${date} for ${violation}. Sanction: ${sanction}. Please expect a follow-up from the Discipline Office. Teacher-in-Charge: ${teacher}.`;
        break;
      case 'suspension':
        body = `${base} due to ${violation} on ${date}, the sanction is ${sanction}. Please check your email for full details and next steps. TIC: ${teacher}.`;
        break;
      default:
        body = `${base} we wish to inform you that on ${date}, an incident of ${violation} was noted. Sanction: ${sanction}. This is a warning notice for your guidance. Teacher-in-Charge: ${teacher}.`;
    }

    return `School Discipline Notice:\n${body}\n\nThis is a one-way SMS. Replies are not monitored.`;
  }

  // --- Counter ---------------------------------------------------------------
  function updateCounter() {
    const msg = $('#message');
    const counter = $('#counter');
    if (!msg || !counter) return;
    const len = msg.value.length;
    const seg = len === 0 ? 0 : Math.ceil(len / 160);
    counter.textContent = `${len} characters • ${seg} SMS segments (160 chars per SMS)`;
  }
  $('#message')?.addEventListener('input', updateCounter);
  updateCounter();

  // --- Validation ------------------------------------------------------------
  function validateRequired() {
    // template is optional (defaults to 'default')
    const ids = ['phone','student','grade','violation','sanction','date','teacher'];
    const missing = ids.filter(id => !getVal(id) && !$('#' + id)?.value);
    if (missing.length) {
      alert('Please complete all fields before generating the message.');
      return false;
    }
    return true;
  }

  // --- Chat preview bubble ---------------------------------------------------
  function pushBubble(text, side = 'left') {
    const chat = $('#chat');
    if (!chat) return;
    const div = document.createElement('div');
    div.className = `msg ${side === 'right' ? 'right' : ''}`;
    div.innerHTML = (text || '').replace(/\n/g, '<br>');
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  // --- Form behaviour --------------------------------------------------------
  // Never allow native submit reloads
  $('#formPanel')?.addEventListener('submit', (e) => e.preventDefault());

  // Generate
  $('#genBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!validateRequired()) return;
    const templateKey = $('#template')?.value || 'default';
    const text = buildMessage(templateKey);
    const box = $('#message');
    if (box) { box.value = text; updateCounter(); box.focus(); }
  });

  // Preview
  $('#previewBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const text = getVal('message');
    if (!text) { alert('Nothing to preview. Generate a message first.'); return; }
    pushBubble(text, 'right');
  });

  // Send
  $('#sendBtn')?.addEventListener('click', (e) => {
    e.preventDefault();

    const phoneEl = $('#phone');
    const phone = (phoneEl?.value || '').replace(/\D/g, ''); // digits only
    const message = getVal('message');

    if (!phone) { alert("Please enter parent's phone number."); phoneEl?.focus(); return; }
    if (!/^\d{11}$/.test(phone)) { alert('Phone number must be exactly 11 digits.'); phoneEl?.focus(); return; }
    if (!message) { alert('Please generate or type a message.'); return; }

    const payload = {
      phone,
      student:   getVal('student'),
      grade:     getVal('grade'),
      violation: getVal('violation'),
      sanction:  getVal('sanction'),
      date:      $('#date')?.value || '',
      teacher:   getVal('teacher'),
      template:  $('#template')?.value || 'default',
      message
    };

    // Send to backend
    (async () => {
      const token = getToken();
      if (!token) {
        alert('Your session has expired. Please sign in again.');
        window.location.href = 'index.html';
        return;
      }
      try {
        const res = await fetch(`${API_ORIGIN}/sms/sanctions/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (res.status === 401) {
          alert('Session expired. Please log in again.');
          window.location.href = 'index.html';
          return;
        }
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const err = await res.json();
            if (err?.error) detail = err.error;
          } catch (_) {
            /* ignore JSON parse noise */
          }
          throw new Error(detail);
        }
        await res.json();
        pushBubble(`✔️ Sent to ${payload.phone}:\n\n${payload.message}`, 'right');
        setTimeout(() => pushBubble('✅ Delivery accepted for processing by SMS gateway.'), 300);
      } catch (err) {
        console.error('[sms] send failed', err);
        alert(`Failed to send SMS. ${err.message || ''}`.trim());
      }
    })();
  });

  // Phone input guard (digits only, max 11)
  $('#phone')?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
  });

  // Reset
  $('#resetBtn')?.addEventListener('click', (e) => {
    e.preventDefault();

    $$('#formPanel input, #formPanel select, #formPanel textarea').forEach(el => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });

    const chat = $('#chat');
    if (chat) {
      chat.innerHTML = `<div class="msg">Hello Parent/Guardian, you will receive important discipline updates here. Replies are not monitored.<br><small id="welcomeClock"></small></div>`;
      const clock = $('#welcomeClock');
      if (clock) clock.textContent = `Today · ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
    }

    updateCounter();
  });

  // Return
  $('#returnBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'dashboard.html';
  });

  // Logout
  $('#logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'index.html';
  });
});
