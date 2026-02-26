import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

function isMissingColumnError(err, column) {
  const msg = err?.message?.toLowerCase?.() || '';
  return msg.includes(`column "${column.toLowerCase()}"`) && msg.includes('does not exist');
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function buildFullName(body = {}) {
  const direct = (body.full_name || '').trim();
  if (direct) return direct;
  return [body.first_name, body.middle_name].filter(Boolean).join(' ').trim() || null;
}

async function runFirstSuccess(candidates, params) {
  let lastErr;
  for (const c of candidates) {
    try {
      const result = await query(c.sql, params);
      return { rows: result.rows, addNullAge: !!c.addNullAge, addNullStrand: !!c.addNullStrand };
    } catch (err) {
      const allowed = ['active', 'age', 'strand'];
      const isKnownMissing = allowed.some(col => isMissingColumnError(err, col));
      if (!isKnownMissing) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

function normalizeRow(row, { addNullAge = false, addNullStrand = false } = {}) {
  const next = { ...row };
  if (addNullAge && next.age === undefined) next.age = null;
  if (addNullStrand && next.strand === undefined) next.strand = null;
  return next;
}

const colsWithAgeAndStrand = "id, lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, strand, parent_contact, to_jsonb(students)->>'created_at' as created_at";
const colsWithAgeNoStrand = "id, lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, parent_contact, to_jsonb(students)->>'created_at' as created_at";
const colsNoAgeWithStrand = "id, lrn, full_name, first_name, middle_name, birthdate, address, grade, section, strand, parent_contact, to_jsonb(students)->>'created_at' as created_at";
const colsNoAgeNoStrand = "id, lrn, full_name, first_name, middle_name, birthdate, address, grade, section, parent_contact, to_jsonb(students)->>'created_at' as created_at";

function listCandidates({ activeFiltered = true, byLrn = false }) {
  const whereBase = byLrn
    ? (activeFiltered ? 'where lrn = $1 and (active IS NULL OR active = TRUE)' : 'where lrn = $1')
    : (activeFiltered ? 'where (active IS NULL OR active = TRUE)' : '');
  const order = byLrn ? 'limit 1' : 'order by full_name asc, first_name asc limit $1 offset $2';
  return [
    { sql: `select ${colsWithAgeAndStrand} from students ${whereBase} ${order}` },
    { sql: `select ${colsWithAgeNoStrand} from students ${whereBase} ${order}`, addNullStrand: true },
    { sql: `select ${colsNoAgeWithStrand} from students ${whereBase} ${order}`, addNullAge: true },
    { sql: `select ${colsNoAgeNoStrand} from students ${whereBase} ${order}`, addNullAge: true, addNullStrand: true }
  ];
}

function countCandidates(activeFiltered = true) {
  return activeFiltered
    ? ['select count(*)::int as total from students where (active IS NULL OR active = TRUE)', 'select count(*)::int as total from students']
    : ['select count(*)::int as total from students'];
}

async function fetchCount(activeFiltered = true) {
  for (const sql of countCandidates(activeFiltered)) {
    try {
      const { rows } = await query(sql);
      return rows[0]?.total ?? 0;
    } catch (err) {
      if (!isMissingColumnError(err, 'active')) throw err;
    }
  }
  return 0;
}

// List students (paginated)
router.get('/', async (req, res) => {
  const lrnQuery = req.query.lrn;

  if (lrnQuery) {
    try {
      let result;
      try {
        result = await runFirstSuccess(listCandidates({ activeFiltered: true, byLrn: true }), [lrnQuery]);
      } catch (err) {
        if (!isMissingColumnError(err, 'active')) throw err;
        result = await runFirstSuccess(listCandidates({ activeFiltered: false, byLrn: true }), [lrnQuery]);
      }
      if (!result.rows.length) return res.json([]);
      return res.json(result.rows.map(row => normalizeRow(row, result)));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const pageRaw = Number.parseInt(req.query.page, 10);
  const limitRaw = Number.parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 100;
  const offset = (page - 1) * limit;

  try {
    let result;
    let total;
    try {
      result = await runFirstSuccess(listCandidates({ activeFiltered: true }), [limit, offset]);
      total = await fetchCount(true);
    } catch (err) {
      if (!isMissingColumnError(err, 'active')) throw err;
      result = await runFirstSuccess(listCandidates({ activeFiltered: false }), [limit, offset]);
      total = await fetchCount(false);
    }

    return res.json({
      data: result.rows.map(row => normalizeRow(row, result)),
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Get one student
router.get('/:id', async (req, res) => {
  const byIdCandidates = [
    { sql: `select ${colsWithAgeAndStrand} from students where id = $1` },
    { sql: `select ${colsWithAgeNoStrand} from students where id = $1`, addNullStrand: true },
    { sql: `select ${colsNoAgeWithStrand} from students where id = $1`, addNullAge: true },
    { sql: `select ${colsNoAgeNoStrand} from students where id = $1`, addNullAge: true, addNullStrand: true }
  ];

  try {
    const result = await runFirstSuccess(byIdCandidates, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(normalizeRow(result.rows[0], result));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Create student
router.post('/', async (req, res) => {
  const {
    lrn,
    full_name: fullNameInput,
    first_name,
    middle_name,
    birthdate,
    age,
    address,
    grade,
    section,
    strand,
    parent_contact
  } = req.body ?? {};

  const full_name = (fullNameInput || buildFullName(req.body))?.trim() || null;
  if (!full_name && !first_name) return res.status(400).json({ error: 'full_name or first_name is required' });

  const cleanAge = toNumberOrNull(age);
  if (Number.isNaN(cleanAge)) return res.status(400).json({ error: 'Invalid age' });

  try {
    const grade_level = grade ?? null;
    const isActive = true;

    let rows;
    try {
      ({ rows } = await query(
        `insert into students (lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, strand, parent_contact, grade_level, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          lrn ?? null,
          full_name,
          first_name ?? null,
          middle_name ?? null,
          birthdate ?? null,
          cleanAge,
          address ?? null,
          grade ?? null,
          section ?? null,
          strand ?? null,
          parent_contact ?? null,
          grade_level,
          isActive
        ]
      ));
    } catch (err) {
      const msg = err?.message?.toLowerCase?.() || '';
      if (!/grade_level|active|strand/.test(msg) || !msg.includes('does not exist')) throw err;

      try {
        ({ rows } = await query(
          `insert into students (lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, strand, parent_contact)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           returning *`,
          [
            lrn ?? null,
            full_name,
            first_name ?? null,
            middle_name ?? null,
            birthdate ?? null,
            cleanAge,
            address ?? null,
            grade ?? null,
            section ?? null,
            strand ?? null,
            parent_contact ?? null
          ]
        ));
      } catch (err2) {
        if (!isMissingColumnError(err2, 'strand')) throw err2;
        ({ rows } = await query(
          `insert into students (lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, parent_contact)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           returning *`,
          [
            lrn ?? null,
            full_name,
            first_name ?? null,
            middle_name ?? null,
            birthdate ?? null,
            cleanAge,
            address ?? null,
            grade ?? null,
            section ?? null,
            parent_contact ?? null
          ]
        ));
      }
    }

    return res.status(201).json(rows[0]);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    return res.status(500).json({ error: e.message });
  }
});

// Batch create students
router.post('/batch', async (req, res) => {
  const students = Array.isArray(req.body?.students) ? req.body.students : null;
  if (!students || students.length === 0) {
    return res.status(400).json({ error: 'students array is required' });
  }

  const results = {
    total: students.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    details: []
  };

  for (let i = 0; i < students.length; i += 1) {
    const student = students[i] || {};
    const {
      lrn,
      full_name: fullNameInput,
      first_name,
      middle_name,
      birthdate,
      age,
      address,
      grade,
      section,
      strand,
      parent_contact
    } = student;

    const full_name = (fullNameInput || buildFullName(student))?.trim() || null;
    const cleanAge = toNumberOrNull(age);

    if ((!full_name && !first_name) || Number.isNaN(cleanAge)) {
      results.failed += 1;
      results.errors.push({ row: i + 1, lrn: lrn || 'unknown', error: 'Missing full_name/first_name or invalid age' });
      results.details.push({ row: i + 1, status: 'failed', lrn, reason: 'Validation failed' });
      continue;
    }

    try {
      const grade_level = grade ?? null;
      const isActive = true;
      let rows;

      try {
        ({ rows } = await query(
          `insert into students (lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, strand, parent_contact, grade_level, active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           returning *`,
          [
            lrn ?? null,
            full_name,
            first_name ?? null,
            middle_name ?? null,
            birthdate ?? null,
            cleanAge,
            address ?? null,
            grade ?? null,
            section ?? null,
            strand ?? null,
            parent_contact ?? null,
            grade_level,
            isActive
          ]
        ));
      } catch (err) {
        const msg = err?.message?.toLowerCase?.() || '';
        if (!/grade_level|active|strand/.test(msg) || !msg.includes('does not exist')) throw err;
        try {
          ({ rows } = await query(
            `insert into students (lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, strand, parent_contact)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             returning *`,
            [
              lrn ?? null,
              full_name,
              first_name ?? null,
              middle_name ?? null,
              birthdate ?? null,
              cleanAge,
              address ?? null,
              grade ?? null,
              section ?? null,
              strand ?? null,
              parent_contact ?? null
            ]
          ));
        } catch (err2) {
          if (!isMissingColumnError(err2, 'strand')) throw err2;
          ({ rows } = await query(
            `insert into students (lrn, full_name, first_name, middle_name, birthdate, age, address, grade, section, parent_contact)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             returning *`,
            [
              lrn ?? null,
              full_name,
              first_name ?? null,
              middle_name ?? null,
              birthdate ?? null,
              cleanAge,
              address ?? null,
              grade ?? null,
              section ?? null,
              parent_contact ?? null
            ]
          ));
        }
      }

      results.inserted += 1;
      results.details.push({ row: i + 1, status: 'inserted', lrn, id: rows[0]?.id });
    } catch (e) {
      if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
        results.skipped += 1;
        results.errors.push({ row: i + 1, lrn: lrn || 'unknown', error: 'LRN already exists (skipped)' });
        results.details.push({ row: i + 1, status: 'skipped', lrn, reason: 'Duplicate LRN' });
      } else {
        results.failed += 1;
        results.errors.push({ row: i + 1, lrn: lrn || 'unknown', error: e.message });
        results.details.push({ row: i + 1, status: 'failed', lrn, reason: e.message });
      }
    }
  }

  let statusCode;
  if (results.failed === students.length) statusCode = 400;
  else if (results.inserted === students.length) statusCode = 201;
  else statusCode = 207;

  return res.status(statusCode).json(results);
});

// Update student
router.put('/:id', async (req, res) => {
  const {
    lrn,
    full_name: fullNameInput,
    first_name,
    middle_name,
    birthdate,
    age,
    address,
    grade,
    section,
    strand,
    parent_contact
  } = req.body ?? {};

  const cleanAge = toNumberOrNull(age);
  if (Number.isNaN(cleanAge)) return res.status(400).json({ error: 'Invalid age' });

  try {
    let full_name = fullNameInput ?? null;
    if (full_name === null && (first_name !== undefined || middle_name !== undefined)) {
      try {
        const current = await query('select first_name, middle_name, full_name from students where id = $1', [req.params.id]);
        if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const cur = current.rows[0];
        const newFirst = first_name ?? cur.first_name;
        const newMiddle = middle_name ?? cur.middle_name;
        full_name = [newFirst, newMiddle].filter(Boolean).join(' ').trim() || cur.full_name || null;
      } catch (_err) {
        // proceed without computed full_name fallback
      }
    }

    const grade_level = grade ?? null;

    let rows;
    try {
      ({ rows } = await query(
        `update students
            set lrn            = coalesce($1, lrn),
                full_name      = coalesce($2, full_name),
                first_name     = coalesce($3, first_name),
                middle_name    = coalesce($4, middle_name),
                birthdate      = coalesce($5, birthdate),
                age            = coalesce($6, age),
                address        = coalesce($7, address),
                grade          = coalesce($8, grade),
                section        = coalesce($9, section),
                strand         = coalesce($10, strand),
                parent_contact = coalesce($11, parent_contact),
                grade_level    = coalesce($12, grade_level)
          where id = $13
          returning *`,
        [
          lrn ?? null,
          full_name,
          first_name ?? null,
          middle_name ?? null,
          birthdate ?? null,
          cleanAge,
          address ?? null,
          grade ?? null,
          section ?? null,
          strand ?? null,
          parent_contact ?? null,
          grade_level,
          req.params.id
        ]
      ));
    } catch (err) {
      const msg = err?.message?.toLowerCase?.() || '';
      if (!/grade_level|strand/.test(msg) || !msg.includes('does not exist')) throw err;
      ({ rows } = await query(
        `update students
            set lrn            = coalesce($1, lrn),
                full_name      = coalesce($2, full_name),
                first_name     = coalesce($3, first_name),
                middle_name    = coalesce($4, middle_name),
                birthdate      = coalesce($5, birthdate),
                age            = coalesce($6, age),
                address        = coalesce($7, address),
                grade          = coalesce($8, grade),
                section        = coalesce($9, section),
                parent_contact = coalesce($10, parent_contact)
          where id = $11
          returning *`,
        [
          lrn ?? null,
          full_name,
          first_name ?? null,
          middle_name ?? null,
          birthdate ?? null,
          cleanAge,
          address ?? null,
          grade ?? null,
          section ?? null,
          parent_contact ?? null,
          req.params.id
        ]
      ));
    }

    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    try {
      const { rowCount } = await query(
        `UPDATE students
         SET active = FALSE
         WHERE id = $1
         RETURNING *`,
        [req.params.id]
      );

      if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ message: 'Student deactivated successfully.' });
    } catch (err) {
      if (!isMissingColumnError(err, 'active')) throw err;
      const { rowCount } = await query('DELETE FROM students WHERE id = $1 RETURNING *', [req.params.id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ message: 'Student deleted successfully.' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
