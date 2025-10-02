(function(){
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const backdrop = document.getElementById('sidebarBackdrop');

  function open(){
    sidebar?.classList.add('open');
    backdrop?.classList.add('active');
  }
  function close(){
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('active');
  }
  function toggle(){
    if(sidebar?.classList.contains('open')) close(); else open();
  }

  // Ensure hidden by default if JS loads after initial paint
  close();

  toggleBtn?.addEventListener('click', toggle);
  backdrop?.addEventListener('click', close);
})();
