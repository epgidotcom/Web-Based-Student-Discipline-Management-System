// Login script using backend auth API with Google reCAPTCHA v2
// Requires config.js and auth.js loaded earlier

const form = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");
const loginBtn = document.getElementById("loginBtn");
const captchaTokenInput = document.getElementById("captchaToken");

function getRecaptchaToken() {
  if (window.grecaptcha && typeof window.grecaptcha.getResponse === "function") {
    return window.grecaptcha.getResponse() || "";
  }
  return "";
}

function resetRecaptcha() {
  captchaTokenInput.value = "";
  if (window.grecaptcha && typeof window.grecaptcha.reset === "function") {
    window.grecaptcha.reset();
  }
}

function setSubmittingState(isSubmitting) {
  if (!loginBtn) return;
  loginBtn.disabled = isSubmitting;
  loginBtn.classList.toggle("is-loading", isSubmitting);
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  errorMessage.textContent = "";

  const usernameInput = document.getElementById("username").value.trim();
  const passwordInput = document.getElementById("password").value.trim();

  if (!usernameInput || !passwordInput) {
    errorMessage.textContent = "Please fill in your username/email and password.";
    return;
  }

  const token = getRecaptchaToken();
  if (!token) {
    errorMessage.textContent = "Please complete the reCAPTCHA challenge.";
    return;
  }
  captchaTokenInput.value = token;

  try {
    setSubmittingState(true);

    const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
    const API_ROOT = window.API_BASE || `${API_BASE.replace(/\/+$/, '')}/api`;
    if (!API_ROOT) throw new Error('API base URL is not configured');

    const res = await fetch(`${API_ROOT}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: usernameInput,
        password: passwordInput,
        recaptchaToken: token
      })
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('Invalid credentials');
      throw new Error('Login failed');
    }

    const data = await res.json();
    window.SDMSAuth?.saveAuth(data);
    const role = (data?.account?.role || '').toLowerCase();
    if (role === 'student') {
      const target = '/student/student_dashboard.html?v=2';
      console.log('Redirecting student to', target);
      window.location.assign(target);
    } else {
      window.location.assign('dashboard.html');
    }
  } catch (err) {
    let message = err?.message || 'Login failed';
    if ((err instanceof TypeError) || /failed to fetch/i.test(message)) {
      message = 'Unable to reach the server. Please verify your internet connection or API base URL.';
    }
    errorMessage.textContent = message;
    resetRecaptcha();
  } finally {
    setSubmittingState(false);
  }
});




