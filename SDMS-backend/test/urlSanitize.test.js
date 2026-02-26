import test from 'node:test';
import assert from 'node:assert/strict';
import { stripWebsiteContentTags, stripWebsiteContentWrappers, toSafeHttpUrl, sanitizePageMetadata } from '../src/utils/urlSanitize.js';

test('stripWebsiteContentTags removes WebsiteContent wrappers', () => {
  const input = '<WebsiteContent_abc>https://example.com/x</WebsiteContent_abc>';
  assert.equal(stripWebsiteContentTags(input), 'https://example.com/x');
});

test('stripWebsiteContentWrappers remains backward compatible alias', () => {
  const input = '<WebsiteContent_abc> Admin Dashboard </WebsiteContent_abc>';
  assert.equal(stripWebsiteContentWrappers(input), 'Admin Dashboard');
});

test('toSafeHttpUrl accepts strict absolute http/https only', () => {
  assert.equal(toSafeHttpUrl('<WebsiteContent_x>https://example.com/path</WebsiteContent_x>'), 'https://example.com/path');
  assert.equal(toSafeHttpUrl('http://example.com/path?q=1'), 'http://example.com/path?q=1');
  assert.equal(toSafeHttpUrl('/relative/path'), null);
  assert.equal(toSafeHttpUrl('ftp://example.com/file'), null);
  assert.equal(toSafeHttpUrl('javascript:alert(1)'), null);
  assert.equal(toSafeHttpUrl('not-a-url'), null);
});

test('sanitizePageMetadata strips wrappers, validates URL, and falls back title', () => {
  const out = sanitizePageMetadata({
    pageTitle: '<WebsiteContent_t> Admin Dashboard </WebsiteContent_t>',
    pageUrl: '<WebsiteContent_u>https://sdms.local/student_list.html</WebsiteContent_u>'
  });
  assert.equal(out.pageTitle, 'Admin Dashboard');
  assert.equal(out.pageUrl, 'https://sdms.local/student_list.html');

  const invalid = sanitizePageMetadata({
    pageTitle: '<WebsiteContent_t></WebsiteContent_t>',
    pageUrl: '<WebsiteContent_u>javascript:alert(1)</WebsiteContent_u>'
  });
  assert.equal(invalid.pageTitle, 'Untitled');
  assert.equal(invalid.pageUrl, null);
});
