document.addEventListener('DOMContentLoaded', () => {// Moved from JAVA/main.js

  const logoutLink = document.querySelector('.logout');// Handles logout linking and integrates with global SDMSAuth if available.

  if (logoutLink) {document.addEventListener('DOMContentLoaded', () => {

    logoutLink.addEventListener('click', (e) => {  const logoutLink = document.querySelector('.logout');

      e.preventDefault();  if (logoutLink) {

      if (window.SDMSAuth) {    logoutLink.addEventListener('click', (e) => {

        window.SDMSAuth.logout();      e.preventDefault();

      } else {      if (window.SDMSAuth) {

        localStorage.removeItem('sdms_auth_v1');        window.SDMSAuth.logout();

        window.location.href = '../index.html';      } else {

      }        localStorage.removeItem('sdms_auth_v1');

    });        window.location.href = '../index.html';

  }      }

});    });

  }
});
