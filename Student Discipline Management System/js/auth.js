// Simple auth helper using localStorage (browser-safe: removed ES module exports)
const AUTH_KEY = 'sdms_auth_v1';
const AUTH_LEGACY_KEYS = ['sdms_auth', 'sdms_auth_v0'];

function saveAuth(data){
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(data)); console.debug('[auth] saved auth payload'); } catch(_){}
}
function getAuth(){
  try {
    const primary = localStorage.getItem(AUTH_KEY);
    if (primary) return JSON.parse(primary);
    for (const key of AUTH_LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const parsed = JSON.parse(legacy);
      // promote legacy payload to current key for future reads
      try { localStorage.setItem(AUTH_KEY, JSON.stringify(parsed)); } catch (_) {}
      return parsed;
    }
    return null;
  } catch(_) { return null; }
}
function getToken(){ return getAuth()?.token || null; }
function getUser(){ return getAuth()?.account || null; }
function logout(){ localStorage.removeItem(AUTH_KEY); window.location.href='index.html'; }

function requireRole(roles){
  if (window.SDMS_CONFIG?.DEV_PREVIEW) {
    console.info('[auth] DEV_PREVIEW enabled — skipping role check');
    return true;
  }
  const user = getUser();
  if(!user){ window.location.href = 'index.html'; return false; }
  const role = (user.role||'').toLowerCase();
  const needed = (Array.isArray(roles)? roles: []).map(r=>r.toLowerCase());
  if(needed.length && !needed.includes(role)){
    if(role === 'student'){
      window.location.href = '/student/student_dashboard.html?v=2';
    } else {
      window.location.href = 'dashboard.html';
    }
    return false;
  }
  return true;
}

// Attach to window for other scripts
window.SDMSAuth = { saveAuth, getAuth, getToken, getUser, logout, requireRole };
