import { Router } from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'node:stream';
import { query } from '../db.js';
import { processBatchStudents } from '../utils/studentUpload.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID_REGEX = /^\d+$/;

function parseDateOrNull(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitFullName(fullName) {
  const name = String(fullName ?? '').trim();
  if (!name) {
    return { firstName: null, middleName: null, lastName: null };
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: null, lastName: null };
  }

  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : null,
    lastName: parts[parts.length - 1]
  };
}

async function getNormStudentColumnSet() {
  const { rows } = await query(
    `SELECT a.attname AS column_name
       FROM pg_attribute a
      WHERE a.attrelid = to_regclass('norm_students')
        AND a.attnum > 0
        AND NOT a.attisdropped`
  );
  return new Set(rows.map((row) => row.column_name));
}

function getStudentSelectClause(columns) {
  const birthdateExpr = columns.has('birthdate') ? 's.birthdate' : 'NULL::date AS birthdate';
  const statusExpr = columns.has('active') ? 's.active AS status' : 'NULL::boolean AS status';
  const createdExpr = columns.has('created_at')
    ? 's.created_at'
    : (columns.has('added_date') ? 's.added_date AS created_at' : 'NULL::timestamp AS created_at');

  return `
    s.id,
    s.lrn,
    TRIM(CONCAT_WS(' ', s.first_name, s.middle_name, s.last_name)) AS full_name,
    ${birthdateExpr},
    s.parent_contact,
    sec.grade_level AS grade,
    sec.section_name AS section,
    sec.strand,
    ${statusExpr},
    ${createdExpr}
  `;
}

async function resolveSectionId(grade, section, strand) {
  const sectionName = String(section ?? '').trim();
  if (!sectionName) return null;

  const values = [sectionName];
  const whereParts = ['section_name = $1'];

  const gradeLevel = String(grade ?? '').trim();
  if (gradeLevel) {
    values.push(gradeLevel);
    whereParts.push(`grade_level = $${values.length}`);
  }

  const strandName = String(strand ?? '').trim();
  if (strandName) {
    values.push(strandName);
    whereParts.push(`strand = $${values.length}`);
  }

  const { rows } = await query(
    `SELECT id
       FROM norm_sections
      WHERE ${whereParts.join(' AND ')}
      ORDER BY id ASC
      LIMIT 1`,
    values
  );

  return rows[0]?.id ?? null;
}

async function fetchStudentByLookup(lookup) {
  const columns = await getNormStudentColumnSet();
  const selectClause = getStudentSelectClause(columns);
  const { rows } = await query(
    `SELECT ${selectClause}
       FROM norm_students s
       LEFT JOIN norm_sections sec ON s.section_id = sec.id
      WHERE s.${lookup.column} = $1
      LIMIT 1`,
    [lookup.value]
  );

  return rows[0] ?? null;
}
async function getOrCreateSectionId(grade, section, strand) {
  const sectionName = String(section ?? '').trim();
  if (!sectionName) return null;

  // Try to find existing section
  const existing = await resolveSectionId(grade, section, strand);
  if (existing) return existing;

  // Section not found, create it
  try {
    const gradeLevel = String(grade ?? '').trim() || null;
    const strandName = String(strand ?? '').trim() || null;
    const { rows } = await query(
      `INSERT INTO norm_sections (grade_level, section_name, strand)
       VALUES ($1, $2, $3)
       ON CONFLICT (section_name) DO UPDATE SET grade_level = COALESCE($1, grade_level), strand = COALESCE($3, strand)
       RETURNING id`,
      [gradeLevel, sectionName, strandName]
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    console.warn('[getOrCreateSectionId] failed to create section', {
      grade,
      section,
      strand,
      error: error.message
    });
    return null;
  }
}
export function getStudentLookup(rawId) {
  const id = String(rawId ?? '').trim();
  if (!id) return null;
  if (UUID_V4_REGEX.test(id)) return { column: 'id', value: id };
  if (NUMERIC_ID_REGEX.test(id)) return { column: 'id', value: Number.parseInt(id, 10) };
  return null;
}

async function hasStudentUniqueConstraint(columnName) {
  try {
    const { rows } = await query(
      `SELECT 1
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_attribute a
           ON a.attrelid = t.oid
          AND a.attnum = ANY (c.conkey)
        WHERE t.oid = to_regclass('norm_students')
          AND c.contype IN ('u', 'p')
          AND a.attname = $1
        LIMIT 1`,
      [columnName]
    );
    return rows.length > 0;
  } catch (error) {
    console.warn('[hasStudentUniqueConstraint] failed to verify unique constraint on column; duplicate entries may fail', {
      columnName,
      error: error.message
    });
    return false;
  }
}

async function insertNormStudentRow({
  columns,
  lrn,
  firstName,
  middleName,
  lastName,
  sectionId,
  birthdate,
  parent_contact,
  onConflictLrn = false,
  returningId = true
}) {
  const baseColumns = ['lrn', 'first_name', 'middle_name', 'last_name', 'section_id'];
  const baseValues = [lrn ?? null, firstName, middleName ?? null, lastName ?? null, sectionId];

  if (columns.has('birthdate')) {
    baseColumns.push('birthdate');
    baseValues.push(parseDateOrNull(birthdate));
  }

  if (columns.has('parent_contact')) {
    baseColumns.push('parent_contact');
    baseValues.push(parent_contact ?? null);
  }

  const conflictClause = onConflictLrn ? ' ON CONFLICT (lrn) DO NOTHING' : '';
  const returningClause = returningId ? ' RETURNING id' : '';

  const executeInsert = async (insertColumns, insertValues, client = null) => {
    const executor = client ?? { query };
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
    return executor.query(
      `INSERT INTO norm_students (${insertColumns.join(', ')})
       VALUES (${placeholders})${conflictClause}${returningClause}`,
      insertValues
    );
  };

  const isStudentIdDuplicate = (error) =>
    error?.code === '23505' && /norm_students_student_id_key/i.test(String(error?.constraint || error?.message || ''));

  const resyncStudentIdSequence = async (client = null) => {
    const executor = client ?? { query };
    const { rows } = await executor.query(
      `SELECT COALESCE(
          pg_get_serial_sequence('norm_students', 'student_id'),
          pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), 'student_id')
       ) AS seq_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.oid = to_regclass('norm_students')`     
    );
    const sequenceName = rows[0]?.seq_name;
    if (!sequenceName) return false;

    await executor.query(
      `SELECT setval($1, COALESCE((SELECT MAX(student_id) FROM norm_students), 0) + 1, false)`,
      [sequenceName]
    );
    return true;
  };

  // Keep the sequence aligned even when rows were imported manually.
  if (columns.has('student_id')) {
    await resyncStudentIdSequence();
  }

  try {
    return await executeInsert(baseColumns, baseValues);
  } catch (error) {
    if (!columns.has('student_id') || !isStudentIdDuplicate(error)) {
      throw error;
    }

    const fixed = await resyncStudentIdSequence();
    if (!fixed) {
      throw error;
    }

    return executeInsert(baseColumns, baseValues);
  }
}

// List students (paginated) and support LRN lookup.
router.get('/', async (req, res) => {
  const lrnQuery = String(req.query.lrn ?? '').trim();

  try {
    const columns = await getNormStudentColumnSet();
    const selectClause = getStudentSelectClause(columns);

    if (lrnQuery) {
      const { rows } = await query(
        `SELECT ${selectClause}
           FROM norm_students s
           LEFT JOIN norm_sections sec ON s.section_id = sec.id
          WHERE s.lrn = $1`,
        [lrnQuery]
      );
      return res.json(rows);
    }

    const pageRaw = Number.parseInt(req.query.page, 10);
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 100;
    const offset = (page - 1) * limit;

    const listResult = await query(
      `SELECT ${selectClause}
         FROM norm_students s
         LEFT JOIN norm_sections sec ON s.section_id = sec.id
        ORDER BY s.last_name ASC NULLS LAST, s.first_name ASC NULLS LAST
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countResult = await query('SELECT count(*)::int AS total FROM norm_students');
    const total = countResult.rows[0]?.total ?? 0;

    return res.json({
      data: listResult.rows,
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Create student
router.post('/', async (req, res) => {
  const { lrn, full_name, grade, section, strand, birthdate, parent_contact } = req.body ?? {};
  const { firstName, middleName, lastName } = splitFullName(full_name);

  if (!firstName) return res.status(400).json({ error: 'full_name is required' });

  try {
    const columns = await getNormStudentColumnSet();
    const sectionId = await getOrCreateSectionId(grade, section, strand);

    const { rows } = await insertNormStudentRow({
      columns,
      lrn,
      firstName,
      middleName,
      lastName,
      sectionId,
      birthdate,
      parent_contact,
      returningId: true
    });

    const created = await fetchStudentByLookup({ column: 'id', value: rows[0].id });
    return res.status(201).json(created);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    return res.status(500).json({ error: e.message });
  }
});

// Batch create students
router.post('/batch', async (req, res) => {
  const requestId = req.headers['x-request-id'] || `batch-${Date.now()}`;
  const { students } = req.body ?? {};

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'students array is required and must not be empty', requestId });
  }

  try {
    const columns = await getNormStudentColumnSet();

    const results = await processBatchStudents(students, async (student, rowNumber, rawStudent) => {
      const { firstName, middleName, lastName } = splitFullName(student.full_name);
      if (!firstName) {
        throw new Error('full_name is required');
      }

      try {
        const sectionId = await getOrCreateSectionId(student.grade, student.section, student.strand);
        const { rows } = await insertNormStudentRow({
          columns,
          lrn: student.lrn,
          firstName,
          middleName,
          lastName,
          sectionId,
          birthdate: student.birthdate,
          parent_contact: student.parent_contact || null,
          returningId: true
        });

        return rows[0];
      } catch (e) {
        console.error('[students.batch] row_insert_error', {
          requestId,
          row: rowNumber,
          raw: rawStudent,
          sanitized: student,
          error: e.message,
          time: new Date().toISOString()
        });
        throw e;
      }
    });

    let statusCode;
    if (results.failed === students.length) statusCode = 400;
    else if (results.inserted === students.length) statusCode = 201;
    else statusCode = 207;

    return res.status(statusCode).json({
      requestId,
      inserted: results.inserted,
      skipped: results.skipped,
      failed: results.failed,
      errors: results.errors,
      warnings: results.warnings,
      details: results.details
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Batch upload students from CSV
router.post('/batch-upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const rows = [];

  try {
    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer)
        .pipe(csv())
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    const columns = await getNormStudentColumnSet();
    const hasLrnUniqueConstraint = await hasStudentUniqueConstraint('lrn');
    let inserted = 0;

    for (const row of rows) {
      const lrn = row.LRN?.trim() || null;
      const fullName = row.FullName?.trim();
      const grade = row.Grade?.trim() || null;
      const section = row.Section?.trim() || null;
      const strand = row.Strand?.trim() || null;

      const { firstName, middleName, lastName } = splitFullName(fullName);
      if (!firstName) continue;

      const sectionId = await getOrCreateSectionId(grade, section, strand);
      const { rowCount } = await insertNormStudentRow({
        columns,
        lrn,
        firstName,
        middleName,
        lastName,
        sectionId,
        birthdate: row.Birthdate,
        parent_contact: row.ParentContact || null,
        onConflictLrn: hasLrnUniqueConstraint,
        returningId: false
      });
      inserted += rowCount;
    }

    return res.json({ success: true, inserted });
  } catch (error) {
    console.error('Error in /api/students/batch-upload:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get one student
router.get('/:id', async (req, res) => {
  const lookup = getStudentLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid student id format' });
  }

  try {
    const found = await fetchStudentByLookup(lookup);
    if (!found) return res.status(404).json({ error: 'Not found' });
    return res.json(found);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  const { lrn, full_name, grade, section, strand, birthdate, parent_contact } = req.body ?? {};
  const lookup = getStudentLookup(req.params.id);

  if (!lookup) {
    return res.status(400).json({ error: 'Invalid student id format' });
  }

  const hasNameUpdate = full_name != null && String(full_name).trim() !== '';
  const nameParts = hasNameUpdate ? splitFullName(full_name) : { firstName: null, middleName: null, lastName: null };

  try {
    const columns = await getNormStudentColumnSet();
    let nextSectionId = null;
    if (grade != null || section != null || strand != null) {
      nextSectionId = await getOrCreateSectionId(grade, section, strand);
    }

    const assignments = [
      'lrn = COALESCE($1, lrn)',
      'first_name = COALESCE($2, first_name)',
      'middle_name = COALESCE($3, middle_name)',
      'last_name = COALESCE($4, last_name)'
    ];
    const values = [
      lrn ?? null,
      hasNameUpdate ? nameParts.firstName : null,
      hasNameUpdate ? nameParts.middleName : null,
      hasNameUpdate ? nameParts.lastName : null
    ];

    if (columns.has('birthdate')) {
      assignments.push(`birthdate = COALESCE($${values.length + 1}, birthdate)`);
      values.push(parseDateOrNull(birthdate));
    }

    if (columns.has('parent_contact')) {
      assignments.push(`parent_contact = COALESCE($${values.length + 1}, parent_contact)`);
      values.push(parent_contact ?? null);
    }

    assignments.push(`section_id = COALESCE($${values.length + 1}, section_id)`);
    values.push((grade != null || section != null || strand != null) ? nextSectionId : null);
    values.push(lookup.value);

    const { rows } = await query(
      `UPDATE norm_students
          SET ${assignments.join(', ')}
        WHERE ${lookup.column} = $${values.length}
        RETURNING id`,
      values
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const updated = await fetchStudentByLookup({ column: 'id', value: rows[0].id });
    return res.json(updated);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    return res.status(500).json({ error: e.message });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  const lookup = getStudentLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid student id format' });
  }

  try {
    const { rowCount } = await query(`DELETE FROM norm_students WHERE ${lookup.column} = $1`, [lookup.value]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json({ message: 'Student deleted successfully.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
