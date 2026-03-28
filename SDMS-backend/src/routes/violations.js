import { Router } from 'express';
import { query } from '../db.js';
import { runAsyncPredictionForViolation } from '../services/predictive.js';

const router = Router();
const VIOLATIONS_TABLE = 'norm_violations';

// Helper: fetch student by id
async function fetchStudent(id) {
  if (!id) return null;
  const { rows } = await query(
    `SELECT s.id,
            TRIM(CONCAT_WS(' ', s.first_name, s.middle_name, s.last_name)) AS full_name,
            sec.grade_level AS grade,
            sec.section_name AS section,
            sec.strand
       FROM norm_students s
       LEFT JOIN norm_sections sec ON sec.id = s.section_id
      WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
}

function triggerPredictionAfterInsert(violationRow, studentRow) {
  setTimeout(async () => {
    try {
      await runAsyncPredictionForViolation({
        violationRow,
        studentRow: {
          ...studentRow,
          active: studentRow?.active ?? true,
        },
      });
    } catch (error) {
      console.error('[predictive] async inference failed', {
        violationId: violationRow?.id,
        error: error.message,
      });
    }
  }, 0);
}

function parseGradeSectionInput(rawValue) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return { grade: null, section: null };

  const compact = raw.replace(/\s+/g, ' ').trim();
  const withGradeLabel = compact.match(/^grade\s*(\d{1,2})\s*[-:|]?\s*(.*)$/i);
  if (withGradeLabel) {
    return {
      grade: withGradeLabel[1],
      section: (withGradeLabel[2] || '').trim() || null
    };
  }

  const numericLead = compact.match(/^(\d{1,2})\s*[-:|]?\s*(.*)$/);
  if (numericLead) {
    return {
      grade: numericLead[1],
      section: (numericLead[2] || '').trim() || null
    };
  }

  return { grade: null, section: compact };
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

async function getOrCreateSectionId(grade, section, strand) {
  const sectionName = String(section ?? '').trim();
  if (!sectionName) return null;

  const existing = await resolveSectionId(grade, section, strand);
  if (existing) return existing;

  const gradeLevel = String(grade ?? '').trim() || null;
  const strandName = String(strand ?? '').trim() || null;
  const { rows } = await query(
    `INSERT INTO norm_sections (grade_level, section_name, strand)
     VALUES ($1, $2, $3)
     ON CONFLICT (section_name)
     DO UPDATE SET
       grade_level = COALESCE($1, norm_sections.grade_level),
       strand = COALESCE($3, norm_sections.strand)
     RETURNING id`,
    [gradeLevel, sectionName, strandName]
  );
  return rows[0]?.id ?? null;
}

async function applyGradeSectionToStudent(studentId, gradeSectionValue) {
  if (!studentId || !gradeSectionValue) return;
  const student = await fetchStudent(studentId);
  if (!student) return;

  const { grade, section } = parseGradeSectionInput(gradeSectionValue);
  if (!section) return;

  const sectionId = await getOrCreateSectionId(grade, section, student.strand);
  if (!sectionId) return;

  await query(
    `UPDATE norm_students
        SET section_id = $1
      WHERE id = $2`,
    [sectionId, studentId]
  );
}

async function resolveOffense(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const { rows } = await query(
      `SELECT id, description
         FROM norm_offenses
        WHERE id = $1
        LIMIT 1`,
      [Number.parseInt(raw, 10)]
    );
    return rows[0] || null;
  }

  const { rows } = await query(
    `SELECT id, description
       FROM norm_offenses
      WHERE LOWER(description) = LOWER($1)
         OR LOWER(code) = LOWER($1)
      ORDER BY id ASC
      LIMIT 1`,
    [raw]
  );
  return rows[0] || null;
}

function violationSelectSql(whereClause, orderClause = '') {
  return `
    SELECT
      v.id,
      v.student_id,
      v.offense_id,
      TRIM(CONCAT_WS(' ', s.first_name, s.middle_name, s.last_name)) AS student_name,
      CASE
        WHEN sec.grade_level IS NOT NULL AND sec.section_name IS NOT NULL THEN sec.grade_level::text || '-' || sec.section_name
        WHEN sec.grade_level IS NOT NULL THEN sec.grade_level::text
        WHEN sec.section_name IS NOT NULL THEN sec.section_name
        ELSE NULL
      END AS grade_section,
      COALESCE(oi.category, od.category) AS offense_category,
      COALESCE(od.description, oi.description, v.description) AS violation_type,
      v.description,
      v.sanction,
      v.incident_date,
      v.status,
      v.remarks,
      v.repeat_count_at_insert,
      v.evidence,
      v.created_at,
      v.updated_at
    FROM ${VIOLATIONS_TABLE} v
    LEFT JOIN norm_students s ON s.id = v.student_id
    LEFT JOIN norm_sections sec ON sec.id = s.section_id
    LEFT JOIN norm_offenses oi ON oi.id = v.offense_id
    LEFT JOIN norm_offenses od ON LOWER(od.description) = LOWER(v.description)
    ${whereClause}
    ${orderClause}`;
}

async function fetchViolationById(id) {
  const { rows } = await query(
    violationSelectSql('WHERE v.id = $1', 'LIMIT 1'),
    [id]
  );
  if (!rows.length) return null;
  return { ...rows[0], repeat_count: rows[0].repeat_count_at_insert };
}

function normalizeEvidence(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.length ? { files: raw.slice(0, 3) } : null;
  if (typeof raw === 'object') {
    const obj = { ...raw };
    if (Array.isArray(obj.files)) obj.files = obj.files.slice(0, 3);
    return obj;
  }
  return { value: raw };
}

//VIOLATION TYPES
router.get('/type', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT category FROM norm_offenses ORDER BY category`
    );

    res.json(rows.map(r => r.category));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch offenses' });
  }
});

// get descriptions for specific violation category
router.get('/description/:category', async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const { rows } = await query(
      `SELECT id, code, description
       FROM norm_offenses
       WHERE LOWER(TRIM(category)) = LOWER(TRIM($1))
       ORDER BY code`,
      [category]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


// === List with optional filters (student_id, q)
router.get('/', async (req, res) => {
  try {
    // Accept both snake_case and camelCase query parameter names
    const rawQuery = req.query || {};
    const student_id = rawQuery.student_id || rawQuery.studentId || null;
    const { offense_type, q } = rawQuery;

    // pagination params
    const pageRaw = Number.parseInt(rawQuery.page, 10);
    const limitRaw = Number.parseInt(rawQuery.limit, 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const offset = (page - 1) * limit;

    const clauses = [];
    const params = [];

    // If the request is authenticated and the user is a Student, force scoping
    // so students can only see their own records.
    try {
      const { tryGetUser } = await import('../middleware/auth.js');
      const user = await tryGetUser(req);
      if (user && user.role && user.role.toLowerCase() === 'student') {
        // override or set student_id to this user's id
        if (user.id) {
          params.push(user.id);
          clauses.push(`v.student_id = $${params.length}`);
        }
      } else if (student_id) {
        // only apply provided filter for non-student (or unauthenticated) requests
        params.push(student_id);
        clauses.push(`v.student_id = $${params.length}`);
      }
    } catch (e) {
      // Fallback: if tryGetUser import fails or errors, honor incoming student_id if present
      if (student_id) {
        params.push(student_id);
        clauses.push(`v.student_id = $${params.length}`);
      }
    }

    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      clauses.push(`(
        LOWER(v.description) LIKE $${params.length} OR
        LOWER(v.sanction) LIKE $${params.length}
      )`);
    }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    // Count total matching rows (for accurate pagination metadata)
    const countSql = `SELECT COUNT(*)::int AS total FROM ${VIOLATIONS_TABLE} v ${where}`;
    const countRes = await query(countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    // fetch page
    const pageParams = params.slice();
    pageParams.push(limit);
    pageParams.push(offset);

    const sql = `${violationSelectSql(where, 'ORDER BY v.incident_date DESC, v.created_at DESC')}
      LIMIT $${pageParams.length - 1}
      OFFSET $${pageParams.length};`;

    const { rows } = await query(sql, pageParams);
    const data = rows.map(r => ({ ...r, repeat_count: r.repeat_count_at_insert }));
    return res.json({
      data,
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (e) {
    console.error('Error fetching active violations:', e);
    res.status(500).json({ error: e.message });
  }
});

// === Stats endpoint
router.get('/stats', async (req, res) => {
  try {
    const totalQ = await query(`SELECT COUNT(*)::int AS total FROM ${VIOLATIONS_TABLE}`);
    const last30Q = await query(
      `SELECT COUNT(*)::int AS last30 FROM ${VIOLATIONS_TABLE} WHERE incident_date >= CURRENT_DATE - INTERVAL '29 days'`
    );
    const openQ = await query(
      `SELECT COUNT(*)::int AS open FROM ${VIOLATIONS_TABLE} WHERE status IN ('Pending','Ongoing')`
    );
    const repeatQ = await query(
      `SELECT COUNT(*)::int AS repeat_offenders_90 FROM (SELECT student_id, COUNT(*) AS c FROM ${VIOLATIONS_TABLE} WHERE incident_date >= CURRENT_DATE - INTERVAL '89 days' GROUP BY student_id HAVING COUNT(*) >= 3) t`
    );
    const topTypesQ = await query(
      `SELECT COALESCE(od.description, oi.description, v.description) AS violation_type,
              COUNT(*)::int AS count
         FROM ${VIOLATIONS_TABLE} v
         LEFT JOIN norm_offenses oi ON oi.id = v.offense_id
         LEFT JOIN norm_offenses od ON LOWER(od.description) = LOWER(v.description)
        WHERE v.incident_date >= CURRENT_DATE - INTERVAL '89 days'
        GROUP BY COALESCE(od.description, oi.description, v.description)
        ORDER BY count DESC
        LIMIT 5`
    );
    const weeklyTrendQ = await query(`
      SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start,
             COALESCE(COUNT(v.id),0)::int AS count
      FROM generate_series(CURRENT_DATE - INTERVAL '77 days', CURRENT_DATE, INTERVAL '7 days') AS week_start
      LEFT JOIN ${VIOLATIONS_TABLE} v
        ON v.incident_date >= week_start
       AND v.incident_date < (week_start + INTERVAL '7 days')
      GROUP BY week_start
      ORDER BY week_start;
    `);

    res.json({
      total: totalQ.rows[0].total,
      last30: last30Q.rows[0].last30,
      open_cases: openQ.rows[0].open,
      repeat_offenders_90: repeatQ.rows[0].repeat_offenders_90,
      top_violation_types: topTypesQ.rows,
      weekly_trend: weeklyTrendQ.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === GET single violation
router.get('/:id', async (req, res) => {
  try {
    const row = await fetchViolationById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === CREATE violation
router.post('/', async (req, res) => {
  try {
    const { student_id, grade_section, offense_type, sanction, remarks, incident_date, status, evidence } = req.body || {};
    if (!student_id) return res.status(400).json({ error: 'student_id required' });
    if (!offense_type) return res.status(400).json({ error: 'offense_type required' });

    const student = await fetchStudent(student_id);
    if (!student) return res.status(400).json({ error: 'Student not found' });
    if (grade_section) {
      await applyGradeSectionToStudent(student_id, grade_section);
    }
    const offense = await resolveOffense(offense_type);
    if (!offense) return res.status(400).json({ error: 'Invalid offense_type' });

    const normEvidence = normalizeEvidence(evidence);

      const insertSQL = `
          INSERT INTO ${VIOLATIONS_TABLE} (
          student_id, offense_id, description, sanction, remarks,
          incident_date, status, evidence, active, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),COALESCE($7,'Pending'),$8,TRUE,NOW(),NOW())
          RETURNING id`;

      const params = [
        student_id,
        offense.id,
        offense.description,
        sanction || null,
        remarks || null,
        incident_date || null,
        status || null,
        normEvidence
      ];
    const { rows } = await query(insertSQL, params);
    const row = await fetchViolationById(rows[0].id);

      // Keep insert path fast: run predictive inference asynchronously.
      triggerPredictionAfterInsert(row, student);

    res.status(201).json(row);
  } catch (e) {
    console.error('Error inserting violation:', e);
    res.status(500).json({ error: e.message });
  }
});

  // Update
  router.put('/:id', async (req, res) => {
    try {
      const { student_id, grade_section, offense_type, description, sanction, remarks, incident_date, status, evidence } = req.body || {};
      const hasRemarksField = Object.prototype.hasOwnProperty.call(req.body || {}, 'remarks');
      const normalizedRemarks = typeof remarks === 'string' ? remarks.trim() : remarks;

    const existingViolationResult = await query(
      `SELECT student_id FROM ${VIOLATIONS_TABLE} WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    const existingViolation = existingViolationResult.rows[0] || null;
    if (!existingViolation) return res.status(404).json({ error: 'Not found' });

    const effectiveStudentId = student_id || existingViolation.student_id;

    if (student_id) {
      const student = await fetchStudent(student_id);
      if (!student) return res.status(400).json({ error: 'Student not found' });
    }

    if (grade_section && effectiveStudentId) {
      await applyGradeSectionToStudent(effectiveStudentId, grade_section);
    }

    let nextOffenseId = null;
    let nextDescription = null;
    if (offense_type != null && String(offense_type).trim() !== '') {
      const offense = await resolveOffense(offense_type);
      if (!offense) return res.status(400).json({ error: 'Invalid offense_type' });
      nextOffenseId = offense.id;
      nextDescription = offense.description;
    }

    const normEvidence = normalizeEvidence(evidence);

      const updateSQL = `
        UPDATE ${VIOLATIONS_TABLE} SET
          student_id    = COALESCE($1, student_id),
          offense_id    = COALESCE($2, offense_id),
          description   = COALESCE($3, description, $4),
          sanction      = COALESCE($5, sanction),
          remarks       = CASE WHEN $11 THEN $6 ELSE remarks END,
          incident_date = COALESCE($7::date, incident_date),
          status        = COALESCE($8, status),
          evidence      = $9,
          updated_at    = NOW()
        WHERE id = $10
        RETURNING id`;

      const params = [
        student_id || null,
        nextOffenseId,
        nextDescription,
        description || null,
        sanction || null,
        normalizedRemarks === '' ? null : (normalizedRemarks ?? null),
        incident_date || null,
        status || null,
        normEvidence,
        req.params.id,
        hasRemarksField
      ];

    const { rows } = await query(updateSQL, params);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const row = await fetchViolationById(rows[0].id);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status required' });

    const allowed = ['Pending', 'Resolved', 'Appealed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    const { rows } = await query(
      `UPDATE ${VIOLATIONS_TABLE} 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, student_id, status, updated_at`,
      [status, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: `Violation status updated to ${status}`, violation: rows[0] });
  } catch (e) {
    console.error('Error updating violation status:', e);
    res.status(500).json({ error: e.message });
  }
});

// === DELETE violation
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(`DELETE FROM ${VIOLATIONS_TABLE} WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



export default router;