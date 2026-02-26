import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRow, stripWebsiteContentTags } from '../src/utils/sanitizer.js';

test('stripWebsiteContentTags removes leading and trailing WebsiteContent wrappers', () => {
  assert.equal(
    stripWebsiteContentTags('<WebsiteContent_x>Hello</WebsiteContent_x>'),
    'Hello'
  );
});

test('sanitizeRow sanitizes all string fields while preserving non-string values', () => {
  const row = sanitizeRow({
    name: '<WebsiteContent_x>John</WebsiteContent_x>',
    age: 16,
    notes: null
  });

  assert.deepEqual(row, { name: 'John', age: 16, notes: null });
});
