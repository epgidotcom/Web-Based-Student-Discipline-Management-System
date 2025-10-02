// Credentials are now validated via backend /api/auth/login. No hardcoded values.

// -----------------------------
// Elements
// -----------------------------
const form = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");
const loginBtn = document.getElementById("loginBtn");

// CAPTCHA elements (modal)
const modal = document.getElementById("captchaModal");
const modalBackdrop = modal?.querySelector(".modal__backdrop");
const modalCloseBtn = document.getElementById("captchaClose");
const modalCancelBtn = document.getElementById("captchaCancel");

const captcha = document.getElementById("captcha");
const track = document.getElementById("captchaTrack");
const knob = document.getElementById("captchaKnob");
const progress = document.getElementById("captchaProgress");
const hint = document.getElementById("captchaHint");
const captchaTokenInput = document.getElementById("captchaToken");

// -----------------------------
// State
// -----------------------------
let captchaVerified = false;
let isDragging = false;
let startX = 0;
let startLeft = 0;
let lastFocusedEl = null;

// Helpers
function lockScroll(lock) {
  document.body.style.overflow = lock ? "hidden" : "";
}

function openModal() {
  if (!modal) return;
  lastFocusedEl = document.activeElement;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  lockScroll(true);
  resetCaptcha();
  setTimeout(() => track?.focus(), 0);
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  lockScroll(false);
  if (lastFocusedEl) lastFocusedEl.focus();
}

function getBounds() {
  const trackRect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();
  const maxX = trackRect.width - knobRect.width - 8;
  return { maxX };
}

function setKnobPosition(px) {
  const { maxX } = getBounds();
  const clamped = Math.max(4, Math.min(px, maxX + 4));
  knob.style.left = `${clamped}px`;

  const percent = Math.round(((clamped - 4) / maxX) * 100);
  progress.style.width = `${Math.max(0, Math.min(percent, 100))}%`;
  track.setAttribute("aria-valuenow", String(percent));
  return percent;
}

function completeCaptcha() {
  captchaVerified = true;
  captcha.classList.add("verified");
  hint.textContent = "Verified. Proceeding to login...";
  captchaTokenInput.value = `ok-${Date.now()}`;

  const { maxX } = getBounds();
  knob.style.left = `${maxX + 4}px`;
  progress.style.width = "100%";
  track.setAttribute("aria-valuenow", "100");

  setTimeout(() => {
    closeModal();
    // Trigger normal form submit flow
    form?.requestSubmit();
  }, 400);
}

function resetCaptcha() {
  captchaVerified = false;
  captcha.classList.remove("verified");
  hint.textContent = "Drag the handle all the way to the right.";
  captchaTokenInput.value = "";
  knob.style.left = "4px";
  progress.style.width = "0%";
  track.setAttribute("aria-valuenow", "0");
}

// Pointer handlers
function onStart(clientX) {
  if (captchaVerified) return;
  isDragging = true;
  startX = clientX;
  startLeft = parseFloat(getComputedStyle(knob).left);
}
function onMove(clientX) {
  if (!isDragging || captchaVerified) return;
  const delta = clientX - startX;
  const newLeft = startLeft + delta;
  const percent = setKnobPosition(newLeft);
  if (percent >= 98) {
    isDragging = false;
    completeCaptcha();
  }
}
function onEnd() {
  if (!isDragging || captchaVerified) return;
  resetCaptcha();
  isDragging = false;
}

// Attach events only if elements exist
if (knob) {
  // Mouse
  knob.addEventListener("mousedown", (e) => onStart(e.clientX));
  window.addEventListener("mousemove", (e) => onMove(e.clientX));
  window.addEventListener("mouseup", onEnd);

  // Touch
  knob.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    onStart(t.clientX);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    onMove(t.clientX);
  }, { passive: true });

  window.addEventListener("touchend", onEnd);
}

track?.addEventListener("keydown", (e) => {
  if (captchaVerified) return;
  let step = 0;
  if (e.key === "ArrowRight") step = 12;
  if (e.key === "ArrowLeft") step = -12;

  if (step !== 0) {
    e.preventDefault();
    const currentLeft = parseFloat(getComputedStyle(knob).left);
    const percent = setKnobPosition(currentLeft + step);
    if (percent >= 98) completeCaptcha();
  }

  if (e.key === "End") { e.preventDefault(); completeCaptcha(); }
  if (e.key === "Home") { e.preventDefault(); resetCaptcha(); }
});

// Modal close controls
modalBackdrop?.addEventListener("click", closeModal);
modalCloseBtn?.addEventListener("click", closeModal);
modalCancelBtn?.addEventListener("click", closeModal);

// -----------------------------
// Login submission flow
// -----------------------------
form?.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!form) return;
  if (errorMessage) errorMessage.textContent = "";

  const usernameInput = document.getElementById("username").value.trim();
  const passwordInput = document.getElementById("password").value.trim();

  if (!captchaVerified || !captchaTokenInput.value) {
    openModal();
    return;
  }

  try {
    const API_BASE = window.SDMS_CONFIG?.API_BASE || '';
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });
    if(!res.ok){
      if(res.status === 401) throw new Error('Invalid credentials');
      throw new Error('Login failed');
    }
    const data = await res.json();
    // Save auth using global helper if available, else minimal localStorage
    if(window.SDMSAuth && typeof window.SDMSAuth.saveAuth === 'function'){
      window.SDMSAuth.saveAuth(data);
    } else {
      localStorage.setItem('sdms_auth_v1', JSON.stringify(data));
    }
    const role = data?.account?.role;
    if(role === 'Student'){
      window.location.href = 'student_dashboard.html';
    } else {
      // Non-students redirect to admin dashboard (outside student folder)
      window.location.href = '../dashboard.html';
    }
  } catch(err){
    if(errorMessage) errorMessage.textContent = err.message || 'Login failed';
    resetCaptcha();
  }
});
