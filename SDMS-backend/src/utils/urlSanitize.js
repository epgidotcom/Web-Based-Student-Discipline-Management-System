const WRAPPER_TAG_RE = /^\s*<WebsiteContent_[^>]+>|<\/WebsiteContent_[^>]+>\s*$/gi;

export function stripWebsiteContentTags(input) {
  if (input == null) return '';
  const original = String(input);
  const cleaned = original.replace(WRAPPER_TAG_RE, '').trim();
  if (cleaned !== original.trim()) {
    console.info('[urlSanitize] WebsiteContent tags stripped', {
      changed: true,
      originalLength: original.length,
      cleanedLength: cleaned.length
    });
  }
  return cleaned;
}

export function stripWebsiteContentWrappers(input) {
  return stripWebsiteContentTags(input);
}

export function toSafeHttpUrl(input) {
  const cleaned = stripWebsiteContentTags(input);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizePageMetadata({ pageTitle, pageUrl } = {}) {
  return {
    pageTitle: stripWebsiteContentTags(pageTitle) || 'Untitled',
    pageUrl: toSafeHttpUrl(pageUrl)
  };
}
