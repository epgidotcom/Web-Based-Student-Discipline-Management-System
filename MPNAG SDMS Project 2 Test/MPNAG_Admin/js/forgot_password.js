document.getElementById("resetForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const newPass = document.getElementById("newPassword").value.trim();
  const confirmPass = document.getElementById("confirmPassword").value.trim();
  const message = document.getElementById("message");

  if (newPass.length < 6) {
    message.style.color = "red";
    message.textContent = "Password must be at least 6 characters.";
    return;
  }

  if (newPass !== confirmPass) {
    message.style.color = "red";
    message.textContent = "Passwords do not match.";
    return;
  }

  // Simulate success
  message.style.color = "green";
  message.textContent = "Password reset successfully! Redirecting...";

  // Delay 1.5 seconds then redirect to index.html
  setTimeout(() => {
    window.location.href = "index.html";
  }, 1500);
});
