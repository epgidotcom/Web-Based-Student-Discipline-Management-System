// Generic API helper for student pages
// Relies on global window.API_BASE provided by ../js/config.js
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${window.API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit'
  });
  if (res.status === 401) {
    // Token invalid/expired
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '../index.html';
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
  const token = localStorage.getItem('token');
  if (!token) return null;
  const decoded = decodeJWT(token);
  return decoded && (decoded.student_id || decoded.id || decoded.sub || decoded.studentId) || null;
}
