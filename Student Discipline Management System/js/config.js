(function(){
  const { location } = window;
  const hostname = location?.hostname || '';
  const protocol = location?.protocol || '';
  const origin = location?.origin && location.origin !== 'null' ? location.origin : '';
  const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
  const LIVE_SERVER_PORTS = new Set(['5500', '5501', '5502']);
  const isFile = protocol === 'file:';

  const FALLBACK_REMOTE = 'https://sdms-backend.onrender.com';
  const LEGACY_BACKENDS = [
    'https://web-based-student-discipline-management.onrender.com',
    'https://web-based-student-discipline-management.onrender.com/api',
    'https://web-based-student-disciplines.onrender.com'
  ];
  const FALLBACK_LOCAL = 'http://localhost:3000';

  const metaBase = document.querySelector('meta[name="sdms-api-base"]')?.content;
  const storedBase = (() => {
    try { return localStorage.getItem('sdms:api-base') || ''; }
    catch (_) { return ''; }
  })();

  const normalize = (value) => String(value || '')
    .trim()
    .replace(/\/+$/, '');

  function isLegacyBackend(url){
    if (!url) return false;
    return LEGACY_BACKENDS.some((legacy) => url.startsWith(legacy));
  }

  function computeBase(raw){
    const cleaned = normalize(raw);
    const originIsLocal = isLocalHost || /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(origin || '');

    if (cleaned && !isLegacyBackend(cleaned)) {
      if (!originIsLocal && origin && !isLegacyBackend(origin) && cleaned === FALLBACK_REMOTE) {
        return origin.replace(/\/+$/, '');
      }
      return cleaned;
    }

    if (originIsLocal && origin) {
      if (LIVE_SERVER_PORTS.has(location?.port)) {
        return FALLBACK_LOCAL;
      }
      return origin.replace(/\/+$/, '');
    }
    if (isFile) return FALLBACK_REMOTE;
    if (origin && !originIsLocal && !isLegacyBackend(origin)) {
      return origin.replace(/\/+$/, '');
    }
    return FALLBACK_REMOTE;
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
