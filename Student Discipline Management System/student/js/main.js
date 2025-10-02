(function(){
  function attach(){
    const logoutLink = document.querySelector('.logout');
    if(!logoutLink) return;
    logoutLink.addEventListener('click', (e)=>{
      e.preventDefault();
      if(window.SDMSAuth){
        window.SDMSAuth.logout();
      } else {
        localStorage.removeItem('sdms_auth_v1');
        window.location.href = '../index.html';
      }
    }, { once: true });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
