import { stripWebsiteContentTags } from './urlSanitize.js';

const STRICT_UPLOAD_SCHEMA = process.env.SDMS_STRICT_UPLOAD_SCHEMA === 'true';

function sanitizeText(value) {
  if (value == null) return null;
  const cleaned = stripWebsiteContentTags(value);
  return cleaned === '' ? null : cleaned;
}

export function normalizeStudentUploadRow(student = {}) {
  const firstName = sanitizeText(student.first_name);
  const middleName = sanitizeText(student.middle_name);
  const lastName = sanitizeText(student.last_name);
  const fallbackFullName = sanitizeText(student.full_name);
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || fallbackFullName;

  const ageRaw = student.age == null || student.age === '' ? null : Number(student.age);
  return {
    lrn: sanitizeText(student.lrn),
    full_name: fullName,
    grade: sanitizeText(student.grade),
    section: sanitizeText(student.section),
    strand: sanitizeText(student.strand),
    age: Number.isFinite(ageRaw) ? ageRaw : null,
    compat: {
      ignored_last_name: Boolean(lastName && fallbackFullName),
      strict_mode: STRICT_UPLOAD_SCHEMA
    }
  };
}

export function validateStudentUploadRow(student = {}, row = 1) {
  const issues = [];
  if (!student.full_name) issues.push({ row, field: 'full_name', error: 'required' });
  if (student.lrn && !/^\d{1,12}$/.test(student.lrn)) issues.push({ row, field: 'lrn', error: 'invalid_format' });
  if (student.age != null && (student.age < 0 || student.age > 120)) issues.push({ row, field: 'age', error: 'invalid_range' });
  return issues;
}

export async function processBatchStudents(students = [], insertStudent) {
  const results = { inserted: 0, skipped: 0, failed: 0, errors: [], details: [] };

  for (let i = 0; i < students.length; i++) {
    const row = i + 1;
    const normalized = normalizeStudentUploadRow(students[i] ?? {});
    const rowValidationErrors = validateStudentUploadRow(normalized, row);
    if (rowValidationErrors.length) {
      results.failed++;
      results.errors.push(...rowValidationErrors);
      results.details.push({ row, status: 'failed', lrn: normalized.lrn, reason: 'Validation failed' });
      continue;
    }

    try {
      const inserted = await insertStudent(normalized);
      results.inserted++;
      results.details.push({ row, status: 'inserted', lrn: normalized.lrn, id: inserted?.id ?? null });
    } catch (e) {
      if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
        results.skipped++;
        results.errors.push({ row, field: 'lrn', error: 'duplicate' });
        results.details.push({ row, status: 'skipped', lrn: normalized.lrn, reason: 'Duplicate LRN' });
      } else {
        results.failed++;
        results.errors.push({ row, field: 'row', error: e.message });
        results.details.push({ row, status: 'failed', lrn: normalized.lrn, reason: e.message });
      }
    }
  }

  return results;
}
