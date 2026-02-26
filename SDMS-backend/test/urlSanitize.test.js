import test from 'node:test';
import assert from 'node:assert/strict';
import { stripWebsiteContentWrappers, toSafeHttpUrl, sanitizePageMetadata } from '../src/utils/urlSanitize.js';

test('stripWebsiteContentWrappers removes WebsiteContent wrappers', () => {
  const input = '<WebsiteContent_abc>https://example.com/x</WebsiteContent_abc>';
  assert.equal(stripWebsiteContentWrappers(input), 'https://example.com/x');
});

test('toSafeHttpUrl accepts http/https only', () => {
  assert.equal(toSafeHttpUrl('<WebsiteContent_x>https://example.com/path</WebsiteContent_x>'), 'https://example.com/path');
  assert.equal(toSafeHttpUrl('ftp://example.com/file'), null);
  assert.equal(toSafeHttpUrl('javascript:alert(1)'), null);
  assert.equal(toSafeHttpUrl('not-a-url'), null);
});

test('sanitizePageMetadata strips wrappers and validates URL', () => {
  const out = sanitizePageMetadata({
    pageTitle: '<WebsiteContent_t> Admin Dashboard </WebsiteContent_t>',
    pageUrl: '<WebsiteContent_u>https://sdms.local/student_list.html</WebsiteContent_u>'
  });
  assert.equal(out.pageTitle, 'Admin Dashboard');
  assert.equal(out.pageUrl, 'https://sdms.local/student_list.html');
});
