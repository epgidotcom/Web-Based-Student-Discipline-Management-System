(function(){
  const { location } = window;
  const hostname = location?.hostname || '';
  const protocol = location?.protocol || '';
  const origin = location?.origin && location.origin !== 'null' ? location.origin : '';
  const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
  const LIVE_SERVER_PORTS = new Set(['5500', '5501', '5502']);
  const isFile = protocol === 'file:';

  const FALLBACK_REMOTE = 'https://web-based-student-discipline-management.onrender.com';
  const FALLBACK_LOCAL = 'http://localhost:3000';

  const metaBase = document.querySelector('meta[name="sdms-api-base"]')?.content;
  const storedBase = (() => {
    try { return localStorage.getItem('sdms:api-base') || ''; }
    catch (_) { return ''; }
  })();

  const normalize = (value) => String(value || '')
    .trim()
    .replace(/\/+$/, '');

  function computeBase(raw){
    const cleaned = normalize(raw);
    if (cleaned) return cleaned;

    const isLocalOrigin = isLocalHost || /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(origin || '');

    if (isLocalOrigin && origin) {
      if (LIVE_SERVER_PORTS.has(location?.port)) {
        return FALLBACK_LOCAL;
      }
      return origin.replace(/\/+$/, '');
    }
    if (isFile) return FALLBACK_REMOTE;
    if (origin && !isLocalOrigin) return FALLBACK_REMOTE;
    return FALLBACK_LOCAL;
  }

  function deriveConfig(raw){
    const base = computeBase(raw) || FALLBACK_REMOTE;
    const devPreview = Boolean(isFile || isLocalHost);
    const cfg = Object.freeze({
      API_BASE: base,
      USE_API: true,
      DEV_PREVIEW: devPreview
    });
    window.SDMS_CONFIG = cfg;
  const normalizedBase = base.replace(/\/+$/, '');
  window.API_BASE = `${normalizedBase}/api`;
    return cfg;
  }

  const initial = window.SDMS_API_BASE || metaBase || storedBase;
  deriveConfig(initial);

  function setApiBase(next){
    const cfg = deriveConfig(next);
    try { localStorage.setItem('sdms:api-base', cfg.API_BASE); }
    catch(_){}
    return cfg;
  }

  window.SDMS = window.SDMS || {};
  window.SDMS.setApiBase = setApiBase;
  window.setSDMSApiBase = setApiBase; // legacy helper if scripts expect global function

  if (!Object.getOwnPropertyDescriptor(window, 'SDMS_API_BASE')?.set) {
    Object.defineProperty(window, 'SDMS_API_BASE', {
      configurable: true,
      get(){ return window.SDMS_CONFIG?.API_BASE; },
      set(value){ setApiBase(value); }
    });
  }
})();
