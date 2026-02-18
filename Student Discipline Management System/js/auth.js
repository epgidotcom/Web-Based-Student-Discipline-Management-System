// Simple auth helper using localStorage (browser-safe: removed ES module exports)
const AUTH_KEY = 'sdms_auth_v1';

function saveAuth(data){
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(data)); console.debug('[auth] saved auth payload'); } catch(_){}
}
function getAuth(){
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)||'null'); } catch(_) { return null; }
}
function getToken(){ 
  const token = getAuth()?.token;
  // Return null if token is missing, empty, or whitespace-only
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  return trimmed || null;
}
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
