// LOGOUT
document.addEventListener("DOMContentLoaded", function () {
  const logoutLink = document.querySelector(".logout");

  if (logoutLink) {
    logoutLink.addEventListener("click", function (e) {
      e.preventDefault(); // stop the <a> from following href
      // Optional: clear any stored login info
      sessionStorage.removeItem("loggedInUser");

      // Redirect to Admin's login page
      window.location.href = "../MPNAG_Admin/index.html";
    });
  }
});
