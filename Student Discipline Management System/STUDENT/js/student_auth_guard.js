// Moved from JAVA/student_auth_guard.js
(function(){
  function getAuth(){
    try { return JSON.parse(localStorage.getItem('sdms_auth_v1')||'null'); } catch(_) { return null; }
  }
  const auth = getAuth();
  const acct = auth?.account;
  if(!acct){
    window.location.href = '../index.html';
    return;
  }
  if(acct.role !== 'Student'){
    window.location.href = '../dashboard.html';
  }
})();
