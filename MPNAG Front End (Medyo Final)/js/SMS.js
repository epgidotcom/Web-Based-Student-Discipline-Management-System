document.addEventListener('DOMContentLoaded', () => {
  const $ = (sel, root=document)=>root.querySelector(sel);
  const fmtDateUS = (iso)=>{
    try{
      const d = new Date(iso);
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    }catch{ return iso; }
  };

  // Clock only
  const clock = $('#welcomeClock');
  if (clock) clock.textContent = `Today · ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;

  function buildMessage(templateKey){
    const student   = $('#student').value.trim();
    const grade     = $('#grade').value.trim();
    const violation = $('#violation').value.trim();
    const sanction  = $('#sanction').value.trim();
    const date      = fmtDateUS($('#date').value);
    const teacher   = $('#teacher').value.trim();

    const base = `Parent/Guardian of ${student} (${grade}),`;
    let body = '';

    switch(templateKey){
      case 'minor':
        body = `${base} this is to inform you of a minor offense recorded on ${date}: ${violation}. The sanction is ${sanction}. Kindly remind ${student.split(' ')[0]} to follow school rules. Teacher-in-Charge: ${teacher}.`;
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

  function updateCounter(){
    const text = $('#message').value;
    const len = text.length;
    const seg = len === 0 ? 0 : Math.ceil(len / 160);
    $('#counter').textContent = `${len} characters • ${seg} SMS segments (160 chars per SMS)`;
  }
  $('#message').addEventListener('input', updateCounter);
  updateCounter();

  function validateRequired(){
    const ids = ['phone','student','grade','violation','sanction','date','teacher','template'];
    const missing = ids.filter(id => !$('#' + id).value || $('#' + id).value.trim() === '');
    if (missing.length){
      alert('Please complete all fields before generating the message.');
      return false;
    }
    return true;
  }

  $('#genBtn').addEventListener('click', () => {
    if (!validateRequired()) return;
    const text = buildMessage($('#template').value);
    $('#message').value = text;
    updateCounter();
  });

  function pushBubble(text, side='left'){
    const div = document.createElement('div');
    div.className = `msg ${side==='right' ? 'right' : ''}`;
    div.innerHTML = text.replace(/\n/g,'<br>');
    $('#chat').appendChild(div);
    $('#chat').scrollTop = $('#chat').scrollHeight;
  }

  $('#previewBtn').addEventListener('click', () => {
    const text = $('#message').value.trim();
    if (!text){ alert('Nothing to preview. Generate a message first.'); return; }
    pushBubble(text, 'right');
  });

  // -----------------------------
  // SEND BUTTON with phone check
  // -----------------------------
  $('#sendBtn').addEventListener('click', () => {
    const payload = {
      phone:    $('#phone').value.trim(),
      student:  $('#student').value.trim(),
      grade:    $('#grade').value.trim(),
      violation:$('#violation').value.trim(),
      sanction: $('#sanction').value.trim(),
      date:     $('#date').value,
      teacher:  $('#teacher').value.trim(),
      template: $('#template').value,
      message:  $('#message').value.trim()
    };

    // phone validation
    if (!payload.phone) {
      alert("Please enter parent's phone number.");
      return;
    }
    if (payload.phone.length !== 11) {
      alert("Phone number must be exactly 11 digits.");
      return;
    }

    if (!payload.message) {
      alert('Please generate or type a message.');
      return;
    }

    console.log('POST /api/sms/sanctions/send', payload);
    pushBubble(`✔️ Sent to ${payload.phone}:\n\n${payload.message}`, 'right');
    setTimeout(() => pushBubble('✅ Delivery accepted for processing by SMS gateway.'), 400);
  });

  // -----------------------------
  // PHONE LIMIT: only digits, max 11
  // -----------------------------
  const phoneInput = document.getElementById('phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      // remove any non-numeric characters
      phoneInput.value = phoneInput.value.replace(/\D/g, '');

      // limit length to 11
      if (phoneInput.value.length > 11) {
        phoneInput.value = phoneInput.value.slice(0, 11);
      }
    });
  }
});

// Reset Button Logic
const resetBtn = document.getElementById('resetBtn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    // clear all form inputs
    document.querySelectorAll('#formPanel input, #formPanel select, #formPanel textarea')
      .forEach(el => {
        if (el.tagName === 'SELECT') {
          el.selectedIndex = 0; // reset to first option
        } else {
          el.value = '';
        }
      });

    // reset counter
    const counter = document.getElementById('counter');
    if (counter) counter.textContent = '0 characters • 0 SMS segments (160 chars per SMS)';

    // reset chat preview 
    const chat = document.getElementById('chat');
    if (chat) {
      chat.innerHTML = `<div class="msg">Hello Parent/Guardian, you will receive important discipline updates here. Replies are not monitored.<br><small id="welcomeClock"></small></div>`;
      const clock = document.getElementById('welcomeClock');
      if (clock) clock.textContent = `Today · ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
    }
  });
}

const returnBtn = document.getElementById('returnBtn');
if (returnBtn) {
  returnBtn.addEventListener('click', () => {
    window.location.href = "dashboard.html";
  });
}
