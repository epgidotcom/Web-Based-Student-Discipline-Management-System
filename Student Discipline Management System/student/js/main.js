(function(){
  function attach(){
    const logoutLink = document.querySelector('.logout');
    if(!logoutLink) return;
    logoutLink.addEventListener('click', (e)=>{
      e.preventDefault();
      try { localStorage.removeItem('sdms_auth_v1'); } catch (_){ /* ignore */ }
      try { sessionStorage.removeItem('sdms_auth_v1'); } catch (_){ /* ignore */ }
      window.location.href = '../index.html';
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
