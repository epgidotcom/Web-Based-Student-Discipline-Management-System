(function(){// Moved from JAVA/student_auth_guard.js

  function getAuth(){(function(){

    try { return JSON.parse(localStorage.getItem('sdms_auth_v1')||'null'); } catch(_) { return null; }  function getAuth(){

  }    try { return JSON.parse(localStorage.getItem('sdms_auth_v1')||'null'); } catch(_) { return null; }

  const auth = getAuth();  }

  const acct = auth?.account;  const auth = getAuth();

  if(!acct){  const acct = auth?.account;

    window.location.href = '../index.html';  if(!acct){

    return;    window.location.href = '../index.html';

  }    return;

  if(acct.role !== 'Student'){  }

    window.location.href = '../dashboard.html';  if(acct.role !== 'Student'){

  }    window.location.href = '../dashboard.html';

})();  }

})();
