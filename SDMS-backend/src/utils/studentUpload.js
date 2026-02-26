import { stripWebsiteContentTags, sanitizeRow } from './sanitizer.js';

const STRICT_UPLOAD_SCHEMA = process.env.SDMS_STRICT_UPLOAD_SCHEMA === 'true';

function sanitizeText(value) {
  if (value == null) return null;
  const cleaned = stripWebsiteContentTags(value);
  return cleaned === '' ? null : cleaned;
}

export function normalizeStudentUploadRow(student = {}) {
  const sanitizedStudent = sanitizeRow(student);
  const firstName = sanitizeText(sanitizedStudent.first_name ?? sanitizedStudent.FirstName ?? sanitizedStudent['First Name']);
  const middleName = sanitizeText(sanitizedStudent.middle_name ?? sanitizedStudent.MiddleName ?? sanitizedStudent['Middle Name']);
  const lastName = sanitizeText(sanitizedStudent.last_name ?? sanitizedStudent.LastName ?? sanitizedStudent['Last Name']);
  const fallbackFullName = sanitizeText(sanitizedStudent.full_name ?? sanitizedStudent.FullName ?? sanitizedStudent['Full Name']);
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || fallbackFullName;

  const ageValue = sanitizedStudent.age ?? sanitizedStudent.Age;
  const ageRaw = ageValue == null || ageValue === '' ? null : Number(ageValue);
  return {
    lrn: sanitizeText(sanitizedStudent.lrn ?? sanitizedStudent.LRN),
    full_name: fullName,
    grade: sanitizeText(sanitizedStudent.grade ?? sanitizedStudent.Grade),
    section: sanitizeText(sanitizedStudent.section ?? sanitizedStudent.Section),
    strand: sanitizeText(sanitizedStudent.strand ?? sanitizedStudent.Strand),
    email: sanitizeText(sanitizedStudent.email),
    phone: sanitizeText(sanitizedStudent.phone),
    profile_url: sanitizeText(sanitizedStudent.profile_url),
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
  if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) issues.push({ row, field: 'email', error: 'invalid_format' });
  if (student.phone && !/^\+?[0-9()\-\s]{7,20}$/.test(student.phone)) issues.push({ row, field: 'phone', error: 'invalid_format' });
  if (student.profile_url) {
    try {
      const parsed = new URL(student.profile_url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push({ row, field: 'profile_url', error: 'invalid_format' });
      }
    } catch {
      issues.push({ row, field: 'profile_url', error: 'invalid_format' });
    }
  }
  return issues;
}

export function mapStudentUploadToColumns(student = {}, availableColumns = []) {
  const columnsSet = new Set(availableColumns);
  const columns = [];
  const values = [];
  const add = (column, value) => {
    if (columnsSet.has(column)) {
      columns.push(column);
      values.push(value ?? null);
    }
  };

  const fullName = sanitizeText(student.full_name);
  const nameParts = (fullName || '').split(/\s+/).filter(Boolean);
  const firstName = sanitizeText(student.first_name) ?? nameParts[0] ?? null;
  const middleName = sanitizeText(student.middle_name) ?? (nameParts.length > 1 ? nameParts.slice(1).join(' ') : null);
  const grade = sanitizeText(student.grade);
  const lrn = sanitizeText(student.lrn);
  const age = Number.isFinite(student.age) ? student.age : null;

  add('lrn', lrn);
  add('full_name', fullName);
  add('first_name', firstName);
  add('middle_name', middleName);
  add('grade_level', grade);
  add('grade', grade);
  add('section', sanitizeText(student.section));
  add('strand', sanitizeText(student.strand));
  add('age', age);

  return { columns, values };
}

export async function processBatchStudents(students = [], insertStudent) {
  const results = { inserted: 0, skipped: 0, failed: 0, errors: [], warnings: [], details: [] };

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
      if (normalized.compat?.ignored_last_name) {
        results.warnings.push({ row, field: 'last_name', warning: 'ignored_legacy_field' });
      }
      const inserted = await insertStudent(normalized, row, students[i] ?? {});
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
