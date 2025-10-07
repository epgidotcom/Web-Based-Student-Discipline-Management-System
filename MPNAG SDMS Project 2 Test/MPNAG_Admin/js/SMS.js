document.addEventListener('DOMContentLoaded', () => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --- Helpers ---------------------------------------------------------------
  const fmtDateUS = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  };

  const getVal = (id) => $(`#${id}`)?.value?.trim() ?? '';

  // Welcome clock (if present in the HTML)
  const welcomeClock = $('#welcomeClock');
  if (welcomeClock) {
    welcomeClock.textContent = `Today · ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
  }

  // --- Message builder -------------------------------------------------------
  function buildMessage(templateKey) {
    const student   = getVal('student');
    const gradeVal  = getVal('grade');    // "7".."12"
    const section   = getVal('section');
    const violation = getVal('violation'); // text input
    const sanction  = getVal('sanction');
    const date      = fmtDateUS($('#date')?.value ?? '');
    const teacher   = getVal('teacher');

    const gradeLabel = gradeVal ? `Grade ${gradeVal}` : '';
    const classStr = [gradeLabel, section].filter(Boolean).join(' – '); // "Grade 7 – Section A"

    const firstName = (student.split(' ')[0] || 'your child');
    const base = `Parent/Guardian of ${student}${classStr ? ` (${classStr})` : ''},`;
    let body;

    switch (templateKey) {
      case 'first':
        body = `${base} this is to inform you of a first offense recorded on ${date}: ${violation}. The sanction is ${sanction}. Kindly remind ${firstName} to follow school rules. Teacher-in-Charge: ${teacher}.`;
        break;
      case 'second':
        body = `${base} a second offense was recorded on ${date} for ${violation}. Sanction: ${sanction}. Please expect a follow-up from the Discipline Office. Teacher-in-Charge: ${teacher}.`;
        break;
      case 'third':
        body = `${base} a third offense was recorded on ${date} due to ${violation}. Sanction: ${sanction}. Please check your email for full details and next steps. TIC: ${teacher}.`;
        break;
      default:
        body = `${base} we wish to inform you that on ${date}, an incident of ${violation} was noted. Sanction: ${sanction}. This is a notice for your guidance. Teacher-in-Charge: ${teacher}.`;
    }

    return `School Discipline Notice:\n${body}\n\nThis is a one-way SMS. Replies are not monitored.`;
  }

  // --- Counter (no parenthetical) -------------------------------------------
  function updateCounter() {
    const msg = $('#message');
    const counter = $('#counter');
    if (!msg || !counter) return;
    const len = msg.value.length;
    const seg = len === 0 ? 0 : Math.ceil(len / 160);
    counter.textContent = `${len} characters • ${seg} SMS segments`;
  }
  $('#message')?.addEventListener('input', updateCounter);
  updateCounter();

  // --- Validation ------------------------------------------------------------
  function validateRequired() {
    // template optional
    const ids = ['phone','student','grade','section','violation','sanction','date','teacher'];
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
  // Prevent native submit reloads
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

  // (No Preview button in this HTML, so no handler)

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
      section:   getVal('section'),
      violation: getVal('violation'),
      sanction:  getVal('sanction'),
      date:      $('#date')?.value || '',
      teacher:   getVal('teacher'),
      template:  $('#template')?.value || 'default',
      message
    };

    // Replace with real POST when ready
    console.log('POST /api/sms/sanctions/send', payload);

    pushBubble(`✔️ Sent to ${payload.phone}:\n\n${payload.message}`, 'right');
    setTimeout(() => pushBubble('✅ Delivery accepted for processing by SMS gateway.'), 400);
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
      chat.innerHTML = `Hello Parent/Guardian, you will receive important discipline updates here. Replies are not monitored.<br><small id="welcomeClock"></small>`;
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
