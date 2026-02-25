import { Router } from 'express';
import { query } from '../db.js';

function isMissingColumnError(err, column) {
  const msg = err?.message?.toLowerCase?.() || '';
  return msg.includes(`column "${column.toLowerCase()}"`) && msg.includes('does not exist');
}

function shouldFallbackLegacy(err) {
  if (!err) return false;
  const msg = err?.message?.toLowerCase?.() || '';
  return (
    /full_name|grade_level/.test(msg) && msg.includes('does not exist')
  ) || isMissingColumnError(err, 'age') || isMissingColumnError(err, 'last_name');
}

const router = Router();

// List students (paginated)
router.get('/', async (req, res) => {
  // Support quick lookup by LRN (used by frontend to find newly-created student)
  const lrnQuery = req.query.lrn;
  if (lrnQuery) {
    try {
      try {
        const { rows } = await query(
          `select id, lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, created_at from students where lrn = $1 and (active IS NULL OR active = TRUE) limit 1`,
          [lrnQuery]
        );
        if (rows.length === 0) return res.json([]);
        return res.json(rows);
      } catch (err) {
        if (!isMissingColumnError(err, 'age') && !isMissingColumnError(err, 'last_name')) throw err;
        if (isMissingColumnError(err, 'last_name')) {
          try {
            const { rows } = await query(
              `select id, lrn, first_name, middle_name, full_name, birthdate, age, address, grade, section, parent_contact, created_at from students where lrn = $1 and (active IS NULL OR active = TRUE) limit 1`,
              [lrnQuery]
            );
            if (rows.length === 0) return res.json([]);
            return res.json(rows);
          } catch (err2) {
            if (!isMissingColumnError(err2, 'age')) throw err2;
            const { rows } = await query(
              `select id, lrn, first_name, middle_name, full_name, birthdate, address, grade, section, parent_contact, created_at from students where lrn = $1 and (active IS NULL OR active = TRUE) limit 1`,
              [lrnQuery]
            );
            if (rows.length === 0) return res.json([]);
            return res.json([{ ...rows[0], age: null }]);
          }
        }
        const { rows } = await query(
          `select id, lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact, created_at from students where lrn = $1 and (active IS NULL OR active = TRUE) limit 1`,
          [lrnQuery]
        );
        if (rows.length === 0) return res.json([]);
        return res.json([{ ...rows[0], age: null }]);
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  const pageRaw = Number.parseInt(req.query.page, 10);
  const limitRaw = Number.parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 100;
  const offset = (page - 1) * limit;

  const selectWithAge    = `select id, lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, created_at from students where (active IS NULL OR active = TRUE) order by last_name asc, first_name asc limit $1 offset $2`;
  const selectWithoutAge = `select id, lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact, created_at from students where (active IS NULL OR active = TRUE) order by last_name asc, first_name asc limit $1 offset $2`;
  // Legacy fallbacks for schemas without the 'active' column
  const selectWithAgeLegacy    = `select id, lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, created_at from students order by last_name asc, first_name asc limit $1 offset $2`;
  const selectWithoutAgeLegacy = `select id, lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact, created_at from students order by last_name asc, first_name asc limit $1 offset $2`;
  // Fallbacks for schemas without the 'last_name' column (uses full_name instead)
  const selectWithAgeNoLast    = `select id, lrn, first_name, middle_name, full_name, birthdate, age, address, grade, section, parent_contact, created_at from students where (active IS NULL OR active = TRUE) order by full_name asc, first_name asc limit $1 offset $2`;
  const selectWithoutAgeNoLast = `select id, lrn, first_name, middle_name, full_name, birthdate, address, grade, section, parent_contact, created_at from students where (active IS NULL OR active = TRUE) order by full_name asc, first_name asc limit $1 offset $2`;
  const selectWithAgeNoLastLegacy    = `select id, lrn, first_name, middle_name, full_name, birthdate, age, address, grade, section, parent_contact, created_at from students order by full_name asc, first_name asc limit $1 offset $2`;
  const selectWithoutAgeNoLastLegacy = `select id, lrn, first_name, middle_name, full_name, birthdate, address, grade, section, parent_contact, created_at from students order by full_name asc, first_name asc limit $1 offset $2`;

  try {
    try {
      const listResult  = await query(selectWithAge, [limit, offset]);
      const countResult = await query('select count(*)::int as total from students where (active IS NULL OR active = TRUE)');
      const total = countResult.rows[0]?.total ?? 0;
      return res.json({
        data: listResult.rows,
        currentPage: page,
        limit,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      });
    } catch (err) {
      if (!isMissingColumnError(err, 'age') && !isMissingColumnError(err, 'active') && !isMissingColumnError(err, 'last_name')) throw err;
      if (isMissingColumnError(err, 'last_name')) {
        // 'last_name' column absent – use full_name variants
        try {
          const listResult  = await query(selectWithAgeNoLast, [limit, offset]);
          const countResult = await query('select count(*)::int as total from students where (active IS NULL OR active = TRUE)');
          const total = countResult.rows[0]?.total ?? 0;
          return res.json({
            data: listResult.rows,
            currentPage: page,
            limit,
            totalItems: total,
            totalPages: Math.max(1, Math.ceil(total / limit))
          });
        } catch (err2) {
          if (!isMissingColumnError(err2, 'age') && !isMissingColumnError(err2, 'active')) throw err2;
          if (isMissingColumnError(err2, 'active')) {
            try {
              const listResult  = await query(selectWithAgeNoLastLegacy, [limit, offset]);
              const countResult = await query('select count(*)::int as total from students');
              const total = countResult.rows[0]?.total ?? 0;
              return res.json({
                data: listResult.rows,
                currentPage: page,
                limit,
                totalItems: total,
                totalPages: Math.max(1, Math.ceil(total / limit))
              });
            } catch (err3) {
              if (!isMissingColumnError(err3, 'age')) throw err3;
              const listResult  = await query(selectWithoutAgeNoLastLegacy, [limit, offset]);
              const countResult = await query('select count(*)::int as total from students');
              const total = countResult.rows[0]?.total ?? 0;
              return res.json({
                data: listResult.rows.map(row => ({ ...row, age: null })),
                currentPage: page,
                limit,
                totalItems: total,
                totalPages: Math.max(1, Math.ceil(total / limit))
              });
            }
          }
          const listResult  = await query(selectWithoutAgeNoLast, [limit, offset]);
          const countResult = await query('select count(*)::int as total from students where (active IS NULL OR active = TRUE)');
          const total = countResult.rows[0]?.total ?? 0;
          return res.json({
            data: listResult.rows.map(row => ({ ...row, age: null })),
            currentPage: page,
            limit,
            totalItems: total,
            totalPages: Math.max(1, Math.ceil(total / limit))
          });
        }
      }
      if (isMissingColumnError(err, 'active')) {
        // 'active' column absent – fall back to unfiltered legacy queries
        try {
          const listResult  = await query(selectWithAgeLegacy, [limit, offset]);
          const countResult = await query('select count(*)::int as total from students');
          const total = countResult.rows[0]?.total ?? 0;
          return res.json({
            data: listResult.rows,
            currentPage: page,
            limit,
            totalItems: total,
            totalPages: Math.max(1, Math.ceil(total / limit))
          });
        } catch (err2) {
          if (!isMissingColumnError(err2, 'age')) throw err2;
          const listResult  = await query(selectWithoutAgeLegacy, [limit, offset]);
          const countResult = await query('select count(*)::int as total from students');
          const total = countResult.rows[0]?.total ?? 0;
          return res.json({
            data: listResult.rows.map(row => ({ ...row, age: null })),
            currentPage: page,
            limit,
            totalItems: total,
            totalPages: Math.max(1, Math.ceil(total / limit))
          });
        }
      }
      // 'age' column absent – use no-age variant but keep active filter
      const listResult  = await query(selectWithoutAge, [limit, offset]);
      const countResult = await query('select count(*)::int as total from students where (active IS NULL OR active = TRUE)');
      const total = countResult.rows[0]?.total ?? 0;
      return res.json({
        data: listResult.rows.map(row => ({ ...row, age: null })),
        currentPage: page,
        limit,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one student
router.get('/:id', async (req, res) => {
  try {
    try {
      const { rows } = await query(
        `select id, lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, created_at
           from students where id = $1`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      return res.json(rows[0]);
    } catch (err) {
      if (!isMissingColumnError(err, 'age') && !isMissingColumnError(err, 'last_name')) throw err;
      if (isMissingColumnError(err, 'last_name')) {
        try {
          const { rows } = await query(
            `select id, lrn, first_name, middle_name, full_name, birthdate, age, address, grade, section, parent_contact, created_at
               from students where id = $1`,
            [req.params.id]
          );
          if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
          return res.json(rows[0]);
        } catch (err2) {
          if (!isMissingColumnError(err2, 'age')) throw err2;
          const { rows } = await query(
            `select id, lrn, first_name, middle_name, full_name, birthdate, address, grade, section, parent_contact, created_at
               from students where id = $1`,
            [req.params.id]
          );
          if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
          return res.json({ ...rows[0], age: null });
        }
      }
    }

    const { rows } = await query(
      `select id, lrn, first_name, middle_name, last_name, birthdate, address, grade, section, parent_contact, created_at
         from students where id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...rows[0], age: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create student
router.post('/', async (req, res) => {
  const { lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact } = req.body ?? {};
  if (!first_name) return res.status(400).json({ error: 'first_name is required' });
  const cleanAge = age === undefined || age === null || age === '' ? null : Number(age);
  if (cleanAge !== null && !Number.isFinite(cleanAge)) {
    return res.status(400).json({ error: 'Invalid age' });
  }
  try {
    // Build legacy composite fields still enforced in the DB (full_name, grade_level) if they exist.
    const full_name = [first_name, middle_name, last_name].filter(Boolean).join(' ').trim() || null;
    const grade_level = grade ?? null; // mirror grade into legacy grade_level if present

    // Default "active" column to TRUE
    const isActive = true;
    
    // Try inserting with legacy columns; if they do not exist (future clean schema) fallback gracefully.
    let rows;
    try {
      ({ rows } = await query(
        `insert into students (lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, full_name, grade_level, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
  [lrn ?? null, first_name, middle_name ?? null, last_name, birthdate ?? null, cleanAge, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, full_name, grade_level, isActive]
      ));
    } catch (err) {
      // If error mentions unknown column (e.g., after we drop legacy columns) retry without them.
      if (shouldFallbackLegacy(err)) {
        ({ rows } = await query(
          `insert into students (lrn, first_name, middle_name, birthdate, address, grade, section, parent_contact, active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            returning *`,
          [lrn ?? null, first_name, middle_name ?? null, birthdate ?? null, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, isActive]
        ));
      } else {
        throw err;
      }
    }
    res.status(201).json(rows[0]);
  } catch (e) {
    // Unique violation for LRN (Postgres code 23505). Provide friendlier message & 409 Conflict.
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '') ) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Batch create students
router.post('/batch', async (req, res) => {
  const { students } = req.body ?? {};
  
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'students array is required and must not be empty' });
  }

  const results = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    details: []
  };

  // Process each student
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const { lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact } = student;

    // Validate required fields
    if (!first_name) {
      results.failed++;
      results.errors.push({ row: i + 1, lrn: lrn || 'unknown', error: 'first_name is required' });
      results.details.push({ row: i + 1, status: 'failed', lrn, reason: 'Missing required fields' });
      continue;
    }

    const cleanAge = age === undefined || age === null || age === '' ? null : Number(age);
    if (cleanAge !== null && !Number.isFinite(cleanAge)) {
      results.failed++;
      results.errors.push({ row: i + 1, lrn: lrn || 'unknown', error: 'Invalid age' });
      results.details.push({ row: i + 1, status: 'failed', lrn, reason: 'Invalid age' });
      continue;
    }

    try {
      const full_name = [first_name, middle_name, last_name].filter(Boolean).join(' ').trim() || null;
      const grade_level = grade ?? null;
      const isActive = true;

      let rows;
      try {
        ({ rows } = await query(
          `insert into students (lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact, full_name, grade_level, active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           returning *`,
          [lrn ?? null, first_name, middle_name ?? null, last_name, birthdate ?? null, cleanAge, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, full_name, grade_level, isActive]
        ));
      } catch (err) {
        if (shouldFallbackLegacy(err)) {
          ({ rows } = await query(
            `insert into students (lrn, first_name, middle_name, birthdate, address, grade, section, parent_contact, active)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             returning *`,
            [lrn ?? null, first_name, middle_name ?? null, birthdate ?? null, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, isActive]
          ));
        } else {
          throw err;
        }
      }

      results.inserted++;
      results.details.push({ row: i + 1, status: 'inserted', lrn, id: rows[0]?.id });
    } catch (e) {
      // Handle duplicate LRN - skip it
      if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
        results.skipped++;
        results.errors.push({ row: i + 1, lrn: lrn || 'unknown', error: 'LRN already exists (skipped)' });
        results.details.push({ row: i + 1, status: 'skipped', lrn, reason: 'Duplicate LRN' });
      } else {
        results.failed++;
        results.errors.push({ row: i + 1, lrn: lrn || 'unknown', error: e.message });
        results.details.push({ row: i + 1, status: 'failed', lrn, reason: e.message });
      }
    }
  }

  // Determine appropriate HTTP status code
  let statusCode;
  if (results.failed === students.length) {
    statusCode = 400; // All failed
  } else if (results.inserted === students.length) {
    statusCode = 201; // All succeeded
  } else {
    statusCode = 207; // Multi-Status: partial success
  }

  res.status(statusCode).json(results);
});

// Update student
router.put('/:id', async (req, res) => {
  const { lrn, first_name, middle_name, last_name, birthdate, age, address, grade, section, parent_contact } = req.body ?? {};
  const cleanAge = age === undefined || age === null || age === '' ? null : Number(age);
  if (cleanAge !== null && !Number.isFinite(cleanAge)) {
    return res.status(400).json({ error: 'Invalid age' });
  }
  try {
    // We may need to recompute full_name / grade_level if any related fields changed.
    // Fetch current row first (only if name or grade parts provided) to build new composite.
    let full_name = null;
    let grade_level = null;
    if (first_name || middle_name || last_name || grade) {
      try {
        const current = await query('select first_name, middle_name, last_name, full_name, grade from students where id = $1', [req.params.id]);
        if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const cur = current.rows[0];
        const newFirst = first_name ?? cur.first_name;
        const newMiddle = middle_name ?? cur.middle_name;
        const newLast = last_name ?? cur.last_name;
        const newGrade = grade ?? cur.grade;
        full_name = [newFirst, newMiddle, newLast].filter(Boolean).join(' ').trim() || cur.full_name || null;
        grade_level = newGrade ?? null;
      } catch (e) {
        // If select fails (e.g. last_name column absent) try without last_name
        try {
          const current = await query('select first_name, middle_name, full_name, grade from students where id = $1', [req.params.id]);
          if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
          const cur = current.rows[0];
          const newFirst = first_name ?? cur.first_name;
          const newMiddle = middle_name ?? cur.middle_name;
          const newGrade = grade ?? cur.grade;
          full_name = [newFirst, newMiddle].filter(Boolean).join(' ').trim() || cur.full_name || null;
          grade_level = newGrade ?? null;
        } catch (_e2) {
          // If select still fails we still proceed with basic update; error handled later if update fails.
        }
      }
    }

    let rows;
    try {
      ({ rows } = await query(
        `update students
            set lrn            = coalesce($1, lrn),
                first_name     = coalesce($2, first_name),
                middle_name    = coalesce($3, middle_name),
                last_name      = coalesce($4, last_name),
                birthdate      = coalesce($5, birthdate),
                age            = coalesce($6, age),
                address        = coalesce($7, address),
                grade          = coalesce($8, grade),
                section        = coalesce($9, section),
                parent_contact = coalesce($10, parent_contact),
                full_name      = coalesce($11, full_name),
                grade_level    = coalesce($12, grade_level)
          where id = $13
          returning *`,
  [lrn ?? null, first_name ?? null, middle_name ?? null, last_name ?? null, birthdate ?? null, cleanAge, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, full_name, grade_level, req.params.id]
      ));
    } catch (err) {
      if (shouldFallbackLegacy(err)) {
        ({ rows } = await query(
          `update students
              set lrn            = coalesce($1, lrn),
                  first_name     = coalesce($2, first_name),
                  middle_name    = coalesce($3, middle_name),
                  birthdate      = coalesce($4, birthdate),
                  address        = coalesce($5, address),
                  grade          = coalesce($6, grade),
                  section        = coalesce($7, section),
                  parent_contact = coalesce($8, parent_contact)
            where id = $9
            returning *`,
          [lrn ?? null, first_name ?? null, middle_name ?? null, birthdate ?? null, address ?? null, grade ?? null, section ?? null, parent_contact ?? null, req.params.id]
        ));
      } else {
        throw err;
      }
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    if (e && e.code === '23505' && /lrn/i.test(e.detail || '')) {
      return res.status(409).json({ error: 'LRN already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `UPDATE students
       SET active = FALSE
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });

    res.status(200).json({ message: 'Student deactivated successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
