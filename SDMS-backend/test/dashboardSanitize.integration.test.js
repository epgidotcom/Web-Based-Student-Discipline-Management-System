import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('dashboard sanitize script cleans wrapped tab metadata for rendering', () => {
  const script = fs.readFileSync(new URL('../../Student Discipline Management System/js/url_sanitize.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, console, URL };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);

  const sanitized = sandbox.window.SDMSUrlSanitize.sanitizePageMetadata({
    pageTitle: '<WebsiteContent_title>  Student List  </WebsiteContent_title>',
    pageUrl: '<WebsiteContent_url>https://sdms.local/student_list.html</WebsiteContent_url>'
  });

  assert.equal(sanitized.pageTitle, 'Student List');
  assert.equal(sanitized.pageUrl, 'https://sdms.local/student_list.html');
});
