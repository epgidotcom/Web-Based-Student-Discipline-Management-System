const WRAPPER_TAG_RE = /<\/?WebsiteContent_[^>]*>/gi;

export function stripWebsiteContentWrappers(input) {
  if (input == null) return '';
  return String(input).replace(WRAPPER_TAG_RE, '').trim();
}

export function toSafeHttpUrl(input) {
  const cleaned = stripWebsiteContentWrappers(input);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizePageMetadata({ pageTitle, pageUrl } = {}) {
  return {
    pageTitle: stripWebsiteContentWrappers(pageTitle),
    pageUrl: toSafeHttpUrl(pageUrl)
  };
}
