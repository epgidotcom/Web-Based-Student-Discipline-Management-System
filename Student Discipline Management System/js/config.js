(function(){
  // Frontend config. Default base URL points to deployed backend.
  // For local development set: window.SDMS_API_BASE = 'http://localhost:4000'; BEFORE including this script.
  const RAW = window.SDMS_API_BASE || 'https://web-based-student-discipline-management.onrender.com';
  const API_BASE = String(RAW || '').replace(/\/+$/, ''); // remove trailing slashes

  const cfg = Object.freeze({
    API_BASE,
    USE_API: true
  });
  window.SDMS_CONFIG = cfg;
  // Provide legacy/global shortcut expected by new student integration code.
  window.API_BASE = cfg.API_BASE + '/api';
})();
