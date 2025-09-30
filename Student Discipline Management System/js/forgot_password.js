document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = (window.SDMS_CONFIG && window.SDMS_CONFIG.API_BASE) || '';
  const requestForm = document.getElementById('requestForm');
  const resetForm = document.getElementById('resetForm');
  const stepRequest = document.getElementById('stepRequest');
  const stepReset = document.getElementById('stepReset');
  const msg = document.getElementById('message');

  function setMsg(t, ok=false){
    msg.style.color = ok ? 'green' : 'red';
    msg.textContent = t;
  }

  requestForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('Processing...', true);
    const email = document.getElementById('reqEmail').value.trim();
    try{
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method:'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      stepRequest.style.display = 'none';
      stepReset.style.display = 'block';
      if (data.token){
        setMsg(`Reset token (dev only, copy it): ${data.token}`, true);
      } else {
        setMsg('If the email exists, a reset link was sent.', true);
      }
    }catch(err){
      console.error(err);
      setMsg('Request failed');
    }
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('resetToken').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    if (newPassword.length < 6) return setMsg('Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return setMsg('Passwords do not match');
    setMsg('Resetting...', true);
    try{
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ token, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMsg('Password reset! Redirecting to login...', true);
      setTimeout(()=> window.location.href = 'index.html', 1400);
    }catch(err){
      console.error(err);
      setMsg('Reset failed');
    }
  });
});
