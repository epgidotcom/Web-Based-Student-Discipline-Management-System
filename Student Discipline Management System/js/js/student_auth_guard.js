(function(){
  // Simple student-only page guard
  function loadAuth(){
    try { return JSON.parse(localStorage.getItem('sdms_auth_v1')||'null'); } catch(_) { return null; }
  }
  const auth = loadAuth();
  const acct = auth?.account;
  if(!acct){
    window.location.replace('../index.html');
    return;
  }
  if((acct.role||'').toLowerCase() !== 'student'){
    // Send non-students to the appropriate dashboard (root admin dashboard assumed)
    window.location.replace('../dashboard.html');
  }
})();
