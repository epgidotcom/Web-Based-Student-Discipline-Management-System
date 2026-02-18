// Generic API helper for student pages
// Relies on global window.API_BASE provided by ../js/config.js
const rawBase = (() => {
  const configured = window.API_BASE || window.SDMS_CONFIG?.API_BASE || '';
  return configured.replace(/\/+$/, '');
})();

function getAuthPayload(){
  try {
    if (window.SDMSAuth?.getAuth) return window.SDMSAuth.getAuth();
    return JSON.parse(localStorage.getItem('sdms_auth_v1') || 'null');
  } catch (err) {
    console.warn('[api] Failed to parse auth payload', err);
    return null;
  }
}

function getStoredToken(){
  const auth = getAuthPayload();
  const token = auth?.token || auth?.accessToken;
  // Return null if token is missing, empty, or whitespace-only
  return (token && typeof token === 'string' && token.trim()) ? token.trim() : null;
}

function buildUrl(path){
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if(!rawBase){
    console.warn('[api] Missing API_BASE, defaulting to /api');
    return `/api${normalizedPath}`;
  }
  return `${rawBase}${normalizedPath}`;
}

function redirectToLogin(){
  if (window.__SDMS_REDIRECTING__) return;
  window.__SDMS_REDIRECTING__ = true;
  try {
    localStorage.removeItem('sdms_auth_v1');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
  } catch (_) {}
  const isStudentArea = window.location.pathname.includes('/student/');
  const target = isStudentArea ? '../index.html' : 'index.html';
  window.location.href = target;
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getStoredToken();
  const hasBody = body !== undefined && body !== null;
  const payload = hasBody && typeof body !== 'string' ? JSON.stringify(body) : body;

  const finalHeaders = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (hasBody && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(buildUrl(path), {
    method,
    headers: finalHeaders,
    body: payload,
    credentials: 'omit'
  });
  if (res.status === 401) {
    redirectToLogin();
    return Promise.reject(new Error('Unauthorized'));
  }
  if (!res.ok) {
  const text = await res.text();
  throw new Error(`API ${res.status}: ${text}`);
  }
  // Try JSON, fallback to text
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export function decodeJWT(token) {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
  } catch (e) { return null; }
}

export function getStudentId() {
  const token = getStoredToken();
  if (!token) return null;
  const decoded = decodeJWT(token);
  if (decoded) {
    return decoded.student_id || decoded.id || decoded.sub || decoded.studentId || null;
  }
  const auth = getAuthPayload();
  return auth?.account?.student_id || auth?.account?.id || null;
}
