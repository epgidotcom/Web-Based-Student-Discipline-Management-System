(function () {
  const WRAPPER_TAG_RE = /^\s*<WebsiteContent_[^>]+>|<\/WebsiteContent_[^>]+>\s*$/gi;

  function stripWebsiteContentTags(input) {
    if (input == null) return '';
    const original = String(input);
    const cleaned = original.replace(WRAPPER_TAG_RE, '').trim();
    if (cleaned !== original.trim()) {
      console.info('[sanitize] stripped WebsiteContent wrapper tags', {
        changed: true,
        originalLength: original.length,
        cleanedLength: cleaned.length
      });
    }
    return cleaned;
  }

  function stripWebsiteContentWrappers(input) {
    return stripWebsiteContentTags(input);
  }

  function toSafeHttpUrl(input) {
    const cleaned = stripWebsiteContentTags(input);
    if (!cleaned) return null;
    try {
      const parsed = new URL(cleaned);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        console.warn('[sanitize] invalid URL protocol/host', { input: cleaned });
        return null;
      }
      return parsed.toString();
    } catch (err) {
      console.warn('[sanitize] Ignoring invalid URL metadata', { input: cleaned, error: err?.message || String(err) });
      return null;
    }
  }

  function sanitizePageMetadata(meta) {
    const source = meta || {};
    const cleanTitle = stripWebsiteContentTags(source.pageTitle || source.title || '');
    const cleanUrl = toSafeHttpUrl(source.pageUrl || source.url || '');
    return { pageTitle: cleanTitle || 'Untitled', pageUrl: cleanUrl };
  }

  window.SDMSUrlSanitize = {
    stripWebsiteContentTags,
    stripWebsiteContentWrappers,
    toSafeHttpUrl,
    sanitizePageMetadata
  };
})();
