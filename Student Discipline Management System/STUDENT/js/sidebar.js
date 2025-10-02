const sidebar = document.querySelector('.sidebar');// Moved from JAVA/js/sidebar.js

const toggleBtn = document.getElementById('sidebarToggle');const sidebar = document.querySelector('.sidebar');

if (sidebar && toggleBtn) {const toggleBtn = document.getElementById('sidebarToggle');

  toggleBtn.addEventListener('click', () => {if (sidebar && toggleBtn) {

    sidebar.classList.toggle('closed');  toggleBtn.addEventListener('click', () => {

  });    sidebar.classList.toggle('closed');

}  });

}
