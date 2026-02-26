import test from 'node:test';
import assert from 'node:assert/strict';
import { processBatchStudents } from '../src/utils/studentUpload.js';

test('processBatchStudents keeps valid rows and reports structured errors for invalid rows', async () => {
  const rows = [
    { lrn: '123456789012', full_name: 'Valid Student', grade: '11' },
    { lrn: 'BAD-LRN', full_name: 'Invalid LRN' },
    { lrn: '999', full_name: '' },
    { lrn: '123456789012', full_name: 'Duplicate LRN' }
  ];

  const seen = new Set();
  const result = await processBatchStudents(rows, async (student) => {
    if (seen.has(student.lrn)) {
      const error = new Error('duplicate key value violates unique constraint');
      error.code = '23505';
      error.detail = 'Key (lrn)=(123456789012) already exists.';
      throw error;
    }
    seen.add(student.lrn);
    return { id: seen.size };
  });

  assert.equal(result.inserted, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 2);
  assert.deepEqual(result.errors, [
    { row: 2, field: 'lrn', error: 'invalid_format' },
    { row: 3, field: 'full_name', error: 'required' },
    { row: 4, field: 'lrn', error: 'duplicate' }
  ]);
});
