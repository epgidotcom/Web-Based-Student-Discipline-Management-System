// temporary login credentials
const validUsername = "admin";
const validEmail = "admin@gmail.com";
const validPassword = "adminpw123";

const form = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");

form.addEventListener("submit", function (event) {
  event.preventDefault();

  const usernameInput = document.getElementById("username").value.trim();
  const passwordInput = document.getElementById("password").value.trim();

  if (
    (usernameInput === validUsername || usernameInput === validEmail) &&
    passwordInput === validPassword
  ) {
    // Redirect to dashboard
    window.location.href = "dashboard.html";
  } else {
    errorMessage.textContent = "Invalid username/email or password!";
  }
});
