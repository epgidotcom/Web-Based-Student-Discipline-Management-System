// js/sms.js — SMS compose/send (lowercase filename for case-sensitive hosts)

document.addEventListener('DOMContentLoaded', () => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Determine API origin - use direct backend URL to avoid Vercel rewrite issues with auth headers
  const getApiOrigin = () => {
    const configBase = (window.SDMS_CONFIG?.API_BASE || '').replace(/\/+$/, '');
    const apiBase = (window.API_BASE || '').replace(/\/+$/, '');
    
    // Use the configured base, preferring API_BASE if set
    let base = apiBase || (configBase ? `${configBase}/api` : '');
    
    // If on Vercel production and using relative /api path,
    // switch to direct backend URL to preserve Authorization headers
    // (Vercel rewrites strip auth headers)
    const hostname = window.location.hostname || '';
    if (hostname.endsWith('.vercel.app') && base.startsWith('/')) {
      // Use configured backend URL if available, otherwise fallback to default
      const backendUrl = window.SDMS_CONFIG?.BACKEND_URL || 'https://sdms-backend.onrender.com';
      base = `${backendUrl}/api`.replace(/\/+$/, '');
    }
    
    return base.replace(/\/+$/, '');
  };
  
  const API_ORIGIN = getApiOrigin();
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

    const isBlastMode = $('#blastModeToggle')?.checked || false;
    const phoneEl = $('#phone');
    const phonesEl = $('#phones');
    const message = getVal('message');

    if (!message) { alert('Please generate or type a message.'); return; }

    let payload;
    let validPhones;
    let invalidPhones = [];

    if (isBlastMode) {
      // Multiple phone numbers mode
      const phonesText = phonesEl?.value || '';
      if (!phonesText.trim()) {
        alert('Please enter at least one phone number.');
        phonesEl?.focus();
        return;
      }

      const parsed = parsePhoneNumbers(phonesText);
      validPhones = parsed.valid;
      invalidPhones = parsed.invalid;

      if (validPhones.length === 0) {
        alert('No valid phone numbers found. Please check the format (11 digits each).');
        phonesEl?.focus();
        return;
      }

      payload = {
        phones: validPhones,
        student:   getVal('student'),
        grade:     getVal('grade'),
        violation: getVal('violation'),
        sanction:  getVal('sanction'),
        date:      $('#date')?.value || '',
        teacher:   getVal('teacher'),
        template:  $('#template')?.value || 'default',
        message
      };
    } else {
      // Single phone number mode
      const phone = (phoneEl?.value || '').replace(/\D/g, '');
      
      if (!phone) { 
        alert("Please enter parent's phone number."); 
        phoneEl?.focus(); 
        return; 
      }
      if (!/^\d{11}$/.test(phone)) { 
        alert('Phone number must be exactly 11 digits.'); 
        phoneEl?.focus(); 
        return; 
      }

      payload = {
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
    }

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
        
        const result = await res.json();
        
        if (isBlastMode) {
          // Show batch result
          const sent = result.sent || 0;
          const failed = result.failed || 0;
          const invalid = invalidPhones.length;
          
          let summaryMsg = `Text Blast Complete!\n\n`;
          summaryMsg += `✓ Sent: ${sent}\n`;
          if (failed > 0) summaryMsg += `✗ Failed: ${failed}\n`;
          if (invalid > 0) summaryMsg += `⚠ Invalid: ${invalid}\n`;
          
          pushBubble(summaryMsg, 'right');
          
          // Show details if there are failures
          if (result.failures && result.failures.length > 0) {
            const failureDetails = result.failures.map(f => 
              `${f.phone}: ${f.error}`
            ).join('\n');
            pushBubble(`Failed numbers:\n${failureDetails}`, 'right');
          }
          
          if (invalid > 0) {
            pushBubble(`Invalid numbers: ${invalidPhones.join(', ')}`, 'right');
          }
          
          // Clear textarea on success
          if (sent > 0 && phonesEl) {
            phonesEl.value = '';
            const feedback = $('#phoneValidationFeedback');
            if (feedback) feedback.innerHTML = '';
          }
          
          setTimeout(() => pushBubble('✅ Batch delivery accepted for processing by SMS gateway.'), 300);
        } else {
          // Single phone number response
          pushBubble(`✔️ Sent to ${payload.phone}:\n\n${payload.message}`, 'right');
          setTimeout(() => pushBubble('✅ Delivery accepted for processing by SMS gateway.'), 300);
        }
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

  // --- Text Blast Mode Toggle ------------------------------------------------
  const blastModeToggle = $('#blastModeToggle');
  const singlePhoneContainer = $('#singlePhoneContainer');
  const multiplePhoneContainer = $('#multiplePhoneContainer');

  if (blastModeToggle && singlePhoneContainer && multiplePhoneContainer) {
    blastModeToggle.addEventListener('change', (e) => {
      const isBlastMode = e.target.checked;
      if (isBlastMode) {
        singlePhoneContainer.style.display = 'none';
        multiplePhoneContainer.style.display = 'block';
      } else {
        singlePhoneContainer.style.display = 'block';
        multiplePhoneContainer.style.display = 'none';
      }
    });
  }

  // --- Parse and validate phone numbers -------------------------------------
  function parsePhoneNumbers(text) {
    if (!text) return { valid: [], invalid: [] };
    
    // Split by comma or whitespace (including newlines)
    const parts = text.split(/[\s,]+/).map(p => p.trim()).filter(p => p);
    
    const valid = [];
    const invalid = [];
    
    parts.forEach(part => {
      const digits = part.replace(/\D/g, '');
      if (/^\d{11}$/.test(digits)) {
        valid.push(digits);
      } else if (digits) {
        invalid.push(part);
      }
    });
    
    return { valid, invalid };
  }

  // Update validation feedback in real-time
  const phonesTextarea = $('#phones');
  if (phonesTextarea) {
    let validationTimeout;
    phonesTextarea.addEventListener('input', (e) => {
      clearTimeout(validationTimeout);
      validationTimeout = setTimeout(() => {
        const feedback = $('#phoneValidationFeedback');
        if (!feedback) return;
        
        const text = e.target.value.trim();
        if (!text) {
          feedback.innerHTML = '';
          return;
        }
        
        const { valid, invalid } = parsePhoneNumbers(text);
        
        let html = '';
        if (valid.length > 0) {
          html += `<div style="color: #059669;" role="status" aria-live="polite">✓ ${valid.length} valid number${valid.length !== 1 ? 's' : ''}</div>`;
        }
        if (invalid.length > 0) {
          html += `<div style="color: #dc2626;" role="alert" aria-live="assertive">✗ ${invalid.length} invalid number${invalid.length !== 1 ? 's' : ''}: ${invalid.join(', ')}</div>`;
        }
        
        feedback.innerHTML = html;
      }, 300);
    });
  }

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

  // --- Populate violation select from school_violations.json -----------------
  async function loadViolationsIntoSMS() {
    const select = $('#violation');
    if (!select) return;

    const candidate = [
      'student/js/school_violations.json',
      'js/school_violations.json',
      'student/school_violations.json'
    ];

    let payload = null;
    for (const p of candidate) {
      try {
        const res = await fetch(p, { cache: 'no-store' });
        if (!res.ok) continue;
        payload = await res.json();
        break;
      } catch (err) {
        // try next
      }
    }

    if (!payload || !payload.school_policy || !Array.isArray(payload.school_policy.categories)) return;

    const existing = new Set(Array.from(select.options).map(o => (o.value || o.textContent || '').trim()));

    // Add items (use description text as option value/label)
    const frag = document.createDocumentFragment();
    payload.school_policy.categories.forEach(cat => {
      if (!Array.isArray(cat.items)) return;
      cat.items.forEach(it => {
        const text = (it.description || '').trim();
        if (!text) return;
        if (existing.has(text)) return;
        const opt = document.createElement('option');
        opt.value = text;
        opt.textContent = text;
        frag.appendChild(opt);
        existing.add(text);
      });
    });

    if (frag.childNodes.length) select.appendChild(frag);
  }

  // attempt to load violations (non-blocking)
  loadViolationsIntoSMS().catch(() => {});

  // --- Floating centered select picker for SMS page -------------------------
  let __smsFloatingSelectEl = null;
  let __smsFloatingBackdrop = null;

  function createSmsFloatingSelectElements() {
    if (__smsFloatingSelectEl && __smsFloatingBackdrop) return;
    __smsFloatingBackdrop = document.createElement('div');
    __smsFloatingBackdrop.className = 'sdms-floating-select-backdrop';

    __smsFloatingSelectEl = document.createElement('div');
    __smsFloatingSelectEl.className = 'sdms-floating-select';
    __smsFloatingSelectEl.setAttribute('role', 'dialog');
    __smsFloatingSelectEl.setAttribute('aria-modal', 'true');

    const header = document.createElement('div');
    header.className = 'sdms-floating-select-header';
    header.textContent = 'Select an option';
    __smsFloatingSelectEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'sdms-floating-select-list';
    __smsFloatingSelectEl.appendChild(list);

    document.body.appendChild(__smsFloatingBackdrop);
    document.body.appendChild(__smsFloatingSelectEl);

    if (!document.getElementById('sdms-floating-select-styles')) {
      const st = document.createElement('style');
      st.id = 'sdms-floating-select-styles';
      st.textContent = `
        .sdms-floating-select-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index:100050; }
        .sdms-floating-select { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(880px, 92%); max-height: 72vh; overflow: hidden; background: #fff; border-radius:8px; box-shadow: 0 10px 30px rgba(2,6,23,0.2); z-index:100051; display:none; font-family:inherit; }
        .sdms-floating-select-header { padding: 12px 16px; border-bottom: 1px solid #eee; font-weight:600; }
        .sdms-floating-select-list { max-height: calc(72vh - 52px); overflow: auto; padding: 8px 12px; }
        .sdms-floating-select-item { padding:10px 12px; border-radius:6px; cursor:pointer; color:#111827; }
        .sdms-floating-select-item:hover { background:#f3f4f6; }
        .sdms-floating-select-item.current { background:#e6f4ea; }
        @media (max-width:420px){ .sdms-floating-select { width: 96%; } }
      `;
      document.head.appendChild(st);
    }

    __smsFloatingBackdrop.addEventListener('click', () => hideSmsFloatingSelect());
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideSmsFloatingSelect(); });
  }

  function showSmsFloatingSelectFor(selectEl) {
    if (!selectEl) return;
    createSmsFloatingSelectElements();
    const list = __smsFloatingSelectEl.querySelector('.sdms-floating-select-list');
    list.innerHTML = '';
    const opts = Array.from(selectEl.options || []);
    opts.forEach(o => {
      const item = document.createElement('div');
      item.className = 'sdms-floating-select-item';
      item.tabIndex = 0;
      item.textContent = o.textContent || o.value || '';
      item.dataset.value = o.value;
      if (o.disabled) item.classList.add('disabled');
      if ((selectEl.value || '') === (o.value || '')) item.classList.add('current');
      item.addEventListener('click', () => {
        selectEl.value = item.dataset.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        hideSmsFloatingSelect();
      });
      item.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') item.click(); });
      list.appendChild(item);
    });

    __smsFloatingBackdrop.style.display = '';
    __smsFloatingSelectEl.style.display = 'block';
    setTimeout(() => { const first = list.querySelector('.sdms-floating-select-item:not(.disabled)'); first && first.focus(); }, 10);
  }

  function hideSmsFloatingSelect() {
    if (__smsFloatingSelectEl) __smsFloatingSelectEl.style.display = 'none';
    if (__smsFloatingBackdrop) __smsFloatingBackdrop.style.display = 'none';
  }

  // Wire the SMS violation select to the floating picker
  const smsViolationSelect = $('#violation');
  if (smsViolationSelect) {
    smsViolationSelect.addEventListener('mousedown', (ev) => { ev.preventDefault(); showSmsFloatingSelectFor(smsViolationSelect); });
    smsViolationSelect.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); showSmsFloatingSelectFor(smsViolationSelect); } });
  }
});
