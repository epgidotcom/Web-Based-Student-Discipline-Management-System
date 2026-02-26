const TAG_RE_LEADING = /^<WebsiteContent_[^>]+>/;
const TAG_RE_TRAILING = /<\/WebsiteContent_[^>]+>$/;

export function stripWebsiteContentTags(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  return value.replace(TAG_RE_LEADING, '').replace(TAG_RE_TRAILING, '').trim();
}

export function sanitizeRow(row = {}) {
  return Object.keys(row).reduce((acc, key) => {
    acc[key] = stripWebsiteContentTags(row[key]);
    return acc;
  }, {});
}
