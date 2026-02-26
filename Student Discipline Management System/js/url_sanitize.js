(function () {
  const WRAPPER_TAG_RE = /<\/?WebsiteContent_[^>]*>/gi;

  function stripWebsiteContentWrappers(input) {
    if (input == null) return '';
    return String(input).replace(WRAPPER_TAG_RE, '').trim();
  }

  function toSafeHttpUrl(input) {
    const cleaned = stripWebsiteContentWrappers(input);
    if (!cleaned) return null;
    try {
      const parsed = new URL(cleaned, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      if (!parsed.hostname) return null;
      return parsed.toString();
    } catch (err) {
      console.warn('[sanitize] Ignoring invalid URL metadata', { input, error: err?.message || String(err) });
      return null;
    }
  }

  function sanitizePageMetadata(meta) {
    const source = meta || {};
    const cleanTitle = stripWebsiteContentWrappers(source.pageTitle || source.title || '');
    const cleanUrl = toSafeHttpUrl(source.pageUrl || source.url || '');
    return { pageTitle: cleanTitle, pageUrl: cleanUrl };
  }

  window.SDMSUrlSanitize = {
    stripWebsiteContentWrappers,
    toSafeHttpUrl,
    sanitizePageMetadata
  };
})();
