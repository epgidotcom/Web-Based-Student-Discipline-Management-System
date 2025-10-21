// ======================================================
// MPNAG - Student Discipline Management System (Login JS)
// Integrated with Google reCAPTCHA v2 (Checkbox)
// Site Key: 6LdDo-ErAAAAAJ8MtdEBARCjMggez0rvHoC5LG6b
// ======================================================

// -----------------------------
// Temporary login credentials
// -----------------------------
const adminCredentials = {
  username: "admin",
  email: "admin@gmail.com",
  password: "adminpw123",
};

const studentCredentials = {
  username: "student",
  email: "student@gmail.com",
  password: "studentpw123",
};

// -----------------------------
// Elements
// -----------------------------
const form = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");
const loginBtn = document.getElementById("loginBtn");

// -----------------------------
// Login submission flow
// -----------------------------
form.addEventListener("submit", function (event) {
  event.preventDefault();
  errorMessage.textContent = "";

  const usernameInput = document.getElementById("username").value.trim();
  const passwordInput = document.getElementById("password").value.trim();

  // ✅ Step 1: Check Google reCAPTCHA v2 response
  const recaptchaResponse = grecaptcha.getResponse();
  if (!recaptchaResponse) {
    errorMessage.textContent = "Please verify that you're not a robot.";
    return;
  }

  // ✅ Step 2: Validate Admin Login
  if (
    (usernameInput === adminCredentials.username ||
      usernameInput === adminCredentials.email) &&
    passwordInput === adminCredentials.password
  ) {
    window.location.href = "dashboard.html"; // Redirect to Admin dashboard
    return;
  }

  // ✅ Step 3: Validate Student Login
  if (
    (usernameInput === studentCredentials.username ||
      usernameInput === studentCredentials.email) &&
    passwordInput === studentCredentials.password
  ) {
    window.location.href = "../MPNAG_student/student_dashboard.html"; // Redirect to Student dashboard
    return;
  }

  // ❌ Step 4: Invalid credentials
  errorMessage.textContent = "Invalid username/email or password!";
  grecaptcha.reset(); // Reset CAPTCHA after failed login
});
