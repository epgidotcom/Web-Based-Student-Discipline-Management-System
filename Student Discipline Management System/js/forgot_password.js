const formEl = document.getElementById('resetForm');
const msgEl = document.getElementById('message');
const API_BASE = window.SDMS_CONFIG?.API_BASE || '';

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const emailParam = params.get('email');

if(token){
  // In reset mode: email input becomes readonly
  const emailInput = document.getElementById('email');
  emailInput.value = emailParam || '';
  emailInput.readOnly = true;
} else {
  // Request mode: hide password fields until token present? We'll allow request by ignoring password fields (they'll be validated only when token present)
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEl.textContent = '';

  const email = document.getElementById('email').value.trim();
  const newPass = document.getElementById('newPassword').value.trim();
  const confirmPass = document.getElementById('confirmPassword').value.trim();

  if(token){
    if (newPass.length < 6) { return showErr('Password must be at least 6 characters.'); }
    if (newPass !== confirmPass) { return showErr('Passwords do not match.'); }
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password: newPass })
      });
      if(!res.ok) throw new Error((await res.json()).error || 'Reset failed');
      showOk('Password reset successfully! Redirecting...');
      setTimeout(()=> window.location.href='index.html', 1500);
    } catch(err){
      showErr(err.message);
    }
  } else {
    if(!email){ return showErr('Enter your email.'); }
    try {
      const res = await fetch(`${API_BASE}/api/auth/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if(!res.ok) throw new Error('Request failed');
      showOk('If the email exists, a reset link has been sent. Check your inbox.');
    } catch(err){
      showErr(err.message);
    }
  }
});

function showErr(t){ msgEl.style.color='red'; msgEl.textContent=t; }
function showOk(t){ msgEl.style.color='green'; msgEl.textContent=t; }
