// Shared authentication utilities
// Include this early (after config.js) on protected pages.
(function(){
  function readUser(){
    try { return JSON.parse(sessionStorage.getItem('sdmsUser')||'null'); } catch { return null; }
  }
  function readToken(){
    return sessionStorage.getItem('sdmsToken') || null;
  }
  function requireLogin(){
    const u = readUser();
    if(!u){ window.location.href = 'index.html'; return null; }
    return u;
  }
  function showUser(){
    const u = readUser(); if(!u) return;
    const nameEl = document.getElementById('userName');
    const avEl = document.getElementById('userAvatar');
    if(nameEl) nameEl.textContent = u.fullName || u.username;
    if(avEl) avEl.textContent = (u.fullName || u.username || '?').charAt(0).toUpperCase();
  }
  function authHeaders(extra){
    const token = readToken();
    return { 'Content-Type':'application/json', ...(token ? { Authorization: 'Bearer '+token } : {}), ...(extra||{}) };
  }
  window.SDMSAuth = { readUser, readToken, requireLogin, showUser, authHeaders };
  // Lightweight fetch wrapper: if a response is 401/403, clear session & redirect.
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(resource, init){
    const resp = await origFetch(resource, init);
    if (resp && (resp.status === 401 || resp.status === 403)) {
      try { sessionStorage.removeItem('sdmsUser'); sessionStorage.removeItem('sdmsToken'); } catch {}
      if (!/index\.html$/i.test(location.pathname)) {
        setTimeout(()=> window.location.href = 'index.html', 50);
      }
    }
    return resp;
  };
})();
