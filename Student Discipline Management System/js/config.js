(function(){
  // Frontend config. Default to your Render backend base URL.
  // You can override at runtime by defining window.SDMS_API_BASE before this file loads.
  const RAW = window.SDMS_API_BASE || 'https://web-based-student-discipline-management.onrender.com';
  const API_BASE = String(RAW || '').replace(/\/+$/, ''); // remove trailing slashes

  window.SDMS_CONFIG = Object.freeze({
    API_BASE,
    USE_API: true
  });
})();
