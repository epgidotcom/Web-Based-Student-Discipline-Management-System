import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Helper: fetch student by id
async function fetchStudent(id) {
  if (!id) return null;
  const { rows } = await query(
    'SELECT id, first_name, middle_name, last_name, grade, section FROM students WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

function buildStudentDisplay(s) {
  if (!s) return null;
  const parts = [s.last_name, s.first_name];
  if (s.middle_name) {
    const m = s.middle_name.trim();
    if (m) parts.push(m[0] + '.');
  }
  return parts.filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
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

// === List with optional filters (student_id, q)
router.get('/', async (req, res) => {
  try {
    // Accept both snake_case and camelCase query parameter names
    const rawQuery = req.query || {};
    const student_id = rawQuery.student_id || rawQuery.studentId || rawQuery.studentId || null;
    const { offense_type, q, limit = 200 } = rawQuery;
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

    clauses.push(`s.active = TRUE`);
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    params.push(Math.min(Number(limit) || 200, 500));

    const sql = `
      SELECT
        v.id,
        v.student_id,
        v.student_name,
        v.grade_section,
        v.description AS violation_type,
        v.description, -- added original description here
        v.sanction, 
        v.incident_date,
        v.status,
        v.remarks,
        v.repeat_count_at_insert,
        v.evidence,
        v.created_at,
        v.updated_at,
        s.active
      FROM violations v
      INNER JOIN students s ON v.student_id = s.id
      ${where}
      ORDER BY v.incident_date DESC, v.created_at DESC
      LIMIT $${params.length};
    `;

    const { rows } = await query(sql, params);
    res.json(rows.map(r => ({ ...r, repeat_count: r.repeat_count_at_insert })));
  } catch (e) {
    console.error('Error fetching active violations:', e);
    res.status(500).json({ error: e.message });
  }
});

// === Stats endpoint
router.get('/stats', async (req, res) => {
  try {
    const totalQ = await query('SELECT COUNT(*)::int AS total FROM violations');
    const last30Q = await query(
      "SELECT COUNT(*)::int AS last30 FROM violations WHERE incident_date >= CURRENT_DATE - INTERVAL '29 days'"
    );
    const openQ = await query(
      "SELECT COUNT(*)::int AS open FROM violations WHERE status IN ('Pending','Ongoing')"
    );
    const repeatQ = await query(
      "SELECT COUNT(*)::int AS repeat_offenders_90 FROM (SELECT student_id, COUNT(*) AS c FROM violations WHERE incident_date >= CURRENT_DATE - INTERVAL '89 days' GROUP BY student_id HAVING COUNT(*) >= 3) t"
    );
    const topTypesQ = await query(
      "SELECT description AS violation_type, COUNT(*)::int AS count FROM violations WHERE incident_date >= CURRENT_DATE - INTERVAL '89 days' GROUP BY description ORDER BY count DESC LIMIT 5"
    );
    const weeklyTrendQ = await query(`
      SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start,
             COALESCE(COUNT(v.id),0)::int AS count
      FROM generate_series(CURRENT_DATE - INTERVAL '77 days', CURRENT_DATE, INTERVAL '7 days') AS week_start
      LEFT JOIN violations v
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
    const { rows } = await query(
      'SELECT id, student_id, student_name, grade_section, description AS violation_type, sanction, remarks, incident_date, status, repeat_count_at_insert, evidence, created_at, updated_at FROM violations WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const row = rows[0];
    row.repeat_count = row.repeat_count_at_insert;
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
    //if (!violationType || !violationType.trim()) return res.status(400).json({ error: 'violationType required' });

    const student = await fetchStudent(student_id);
    if (!student) return res.status(400).json({ error: 'Student not found' });
    const student_name = buildStudentDisplay(student);
    const gradeSectionFinal =
      grade_section || (student.grade && student.section ? `${student.grade}-${student.section}` : null);

    const normEvidence = normalizeEvidence(evidence);

      const insertSQL = `
        INSERT INTO violations (
      student_id, student_name, grade_section,
      offense_type, description, sanction, remarks,
      incident_date, status, evidence
       )
      VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE),COALESCE($9::violation_status_type,'Pending'),$10)
      RETURNING id, student_id, student_name, grade_section,
            offense_type, description, sanction, remarks, incident_date, status,
            repeat_count_at_insert, evidence, created_at, updated_at`;

      const params = [
        student_id,
        student_name,
        gradeSectionFinal,
        "NA",
        offense_type.trim(),
        sanction || null,
        remarks || null,
        incident_date || null,
        status || null,
        normEvidence
      ];
      // console.log(insertSQL, params);
    const { rows } = await query(insertSQL, params);
    const row = rows[0];
    row.repeat_count = row.repeat_count_at_insert;
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

    let student_name = null;
    let gradeSectionFinal = grade_section || null;
    if (student_id) {
      const student = await fetchStudent(student_id);
      if (!student) return res.status(400).json({ error: 'Student not found' });
      student_name = buildStudentDisplay(student);
      if (!gradeSectionFinal && student.grade && student.section)
        gradeSectionFinal = `${student.grade}-${student.section}`;
    }

    const normEvidence = normalizeEvidence(evidence);

      const updateSQL = `
        UPDATE violations SET
          student_id    = COALESCE($1, student_id),
          student_name  = COALESCE($2, student_name),
          grade_section = COALESCE($3, grade_section),
          offense_type  = COALESCE($4, offense_type),
          description   = COALESCE($5, description),
          sanction      = COALESCE($6, sanction),
          remarks       = COALESCE($7, remarks),
          incident_date = COALESCE($8::date, incident_date),
          status        = COALESCE($9::violation_status_type, status),
          evidence      = $10,
          updated_at    = NOW()
        WHERE id = $11
        RETURNING id, student_id, student_name, grade_section,
                  offense_type, description, sanction, remarks, incident_date, status,
                  repeat_count_at_insert, evidence, created_at, updated_at`;

      const params = [
        student_id || null,
        student_name,
        gradeSectionFinal,
        offense_type || null,
        description || null,
        sanction || null,
        remarks || null,
        incident_date || null,
        status || null,
        normEvidence,
        req.params.id
      ];

      const { rows } = await query(updateSQL, params);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const row = rows[0];
      row.repeat_count = row.repeat_count_at_insert;
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  // === PATCH violation status (Resolve/Appeal)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status required' });

    const allowed = ['Pending', 'Resolved', 'Appealed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    const { rows } = await query(
      `UPDATE violations 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, student_name, grade_section, status, updated_at`,
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
    const { rowCount } = await query('DELETE FROM violations WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
