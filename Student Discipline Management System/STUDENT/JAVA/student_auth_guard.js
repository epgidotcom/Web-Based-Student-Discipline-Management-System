// Ensures only logged-in students can view student pages.
(function(){
  function getAuth(){
    try { return JSON.parse(localStorage.getItem('sdms_auth_v1')||'null'); } catch(_) { return null; }
  }
  const auth = getAuth();
  const acct = auth?.account;
  if(!acct){
    // Not logged in
    window.location.href = '../index.html';
    return;
  }
  if(acct.role !== 'Student'){
    // Send non-students to admin dashboard
    window.location.href = '../dashboard.html';
  }
})();
