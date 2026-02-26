import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudentUploadRow, validateStudentUploadRow, mapStudentUploadToColumns } from '../src/utils/studentUpload.js';

test('normalizeStudentUploadRow strips WebsiteContent wrappers and composes full_name from legacy name fields', () => {
  const row = normalizeStudentUploadRow({
    lrn: '<WebsiteContent_a>123456789012</WebsiteContent_a>',
    first_name: '<WebsiteContent_a>John</WebsiteContent_a>',
    middle_name: 'P.',
    last_name: '<WebsiteContent_a>Doe</WebsiteContent_a>',
    grade: '11',
    section: 'A',
    strand: 'STEM'
  });

  assert.equal(row.lrn, '123456789012');
  assert.equal(row.full_name, 'John P. Doe');
  assert.equal(row.grade, '11');
  assert.equal(row.section, 'A');
  assert.equal(row.strand, 'STEM');
});

test('normalizeStudentUploadRow preserves full_name and ignores invalid age values', () => {
  const row = normalizeStudentUploadRow({
    full_name: '<WebsiteContent_a>Jane Smith</WebsiteContent_a>',
    age: 'abc'
  });

  assert.equal(row.full_name, 'Jane Smith');
  assert.equal(row.age, null);
});

test('validateStudentUploadRow returns structured errors for invalid rows', () => {
  const errors = validateStudentUploadRow({
    lrn: 'ABC123',
    full_name: null,
    age: 200
  }, 4);

  assert.deepEqual(errors, [
    { row: 4, field: 'full_name', error: 'required' },
    { row: 4, field: 'lrn', error: 'invalid_format' },
    { row: 4, field: 'age', error: 'invalid_range' }
  ]);
});

test('validateStudentUploadRow flags optional email/phone/url format issues', () => {
  const errors = validateStudentUploadRow({
    full_name: 'Valid Name',
    email: 'invalid-email',
    phone: 'bad',
    profile_url: 'ftp://example.com'
  }, 2);

  assert.deepEqual(errors, [
    { row: 2, field: 'email', error: 'invalid_format' },
    { row: 2, field: 'phone', error: 'invalid_format' },
    { row: 2, field: 'profile_url', error: 'invalid_format' }
  ]);
});

test('mapStudentUploadToColumns maps grade/lrn to legacy column names', () => {
  const mapped = mapStudentUploadToColumns(
    { lrn: '123456789012', full_name: 'Jane Doe', grade: '11', section: 'A' },
    ['student_id', 'first_name', 'middle_name', 'grade_level', 'section']
  );

  assert.deepEqual(mapped.columns, ['student_id', 'first_name', 'middle_name', 'grade_level', 'section']);
  assert.deepEqual(mapped.values, ['123456789012', 'Jane', 'Doe', '11', 'A']);
});

test('mapStudentUploadToColumns preserves remaining name parts as middle_name', () => {
  const mapped = mapStudentUploadToColumns(
    { full_name: 'Jane Marie Doe' },
    ['first_name', 'middle_name']
  );

  assert.deepEqual(mapped.values, ['Jane', 'Marie Doe']);
});
