// Simple auth helper using localStorage
const AUTH_KEY = 'sdms_auth_v1';

export function saveAuth(data){
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(data)); } catch(_){}
}
export function getAuth(){
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)||'null'); } catch(_) { return null; }
}
export function getToken(){ return getAuth()?.token || null; }
export function getUser(){ return getAuth()?.account || null; }
export function logout(){ localStorage.removeItem(AUTH_KEY); window.location.href='index.html'; }

export function requireRole(roles){
  const user = getUser();
  if(!user){ window.location.href = 'index.html'; return false; }
  if(Array.isArray(roles) && roles.length && !roles.includes(user.role)){
    // redirect student to their dashboard if trying to access admin page
    if(user.role === 'Student'){
      window.location.href = 'MPNAG STUDENT/student_dashboard.html';
    } else {
      window.location.href = 'dashboard.html';
    }
    return false;
  }
  return true;
}

// Attach to window for non-module scripts
window.SDMSAuth = { saveAuth, getAuth, getToken, getUser, logout, requireRole };
