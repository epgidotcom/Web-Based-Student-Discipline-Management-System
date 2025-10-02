// Moved from JAVA/main.js
// Handles logout linking and integrates with global SDMSAuth if available.
document.addEventListener('DOMContentLoaded', () => {
  const logoutLink = document.querySelector('.logout');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.SDMSAuth) {
        window.SDMSAuth.logout();
      } else {
        localStorage.removeItem('sdms_auth_v1');
        window.location.href = '../index.html';
      }
    });
  }
});
