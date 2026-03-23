import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// ========== SANCTIONS ==========

// GET all sanctions
router.get('/sanctions', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, sanction, created_at, updated_at
       FROM norm_sanction
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch sanctions' });
  }
});

// POST create sanction
router.post('/sanctions', async (req, res) => {
  try {
    const { sanction } = req.body || {};
    if (!sanction) return res.status(400).json({ error: 'sanction is required' });

    const { rows } = await query(
      `INSERT INTO norm_sanction (sanction)
       VALUES ($1)
       RETURNING id, sanction, created_at, updated_at`,
      [String(sanction).trim()]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT update sanction
router.put('/sanctions/:id', async (req, res) => {
  try {
    const { sanction } = req.body || {};
    if (!sanction) return res.status(400).json({ error: 'sanction is required' });

    const { rows } = await query(
      `UPDATE norm_sanction
       SET sanction = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, sanction, created_at, updated_at`,
      [String(sanction).trim(), req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE sanction by id
router.delete('/sanctions/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM norm_sanction WHERE id = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ========== GRADES & SECTIONS ==========

// GET all grades and sections
router.get('/grades-sections', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, grade_level, section_name, strand, created_at, updated_at
       FROM norm_sections
       ORDER BY grade_level, section_name`
    );
    res.json(rows.map(r => ({
      id: r.id,
      grade: r.grade_level,
      section: r.section_name,
      strand: r.strand,
      created_at: r.created_at,
      updated_at: r.updated_at
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch grades and sections' });
  }
});

// POST create grade & section
router.post('/grades-sections', async (req, res) => {
  try {
    const { grade, section, strand } = req.body || {};
    if (!section) return res.status(400).json({ error: 'section is required' });

    const { rows } = await query(
      `INSERT INTO norm_sections (grade_level, section_name, strand)
       VALUES ($1, $2, $3)
       ON CONFLICT (section_name)
       DO UPDATE SET
         grade_level = COALESCE($1, norm_sections.grade_level),
         strand = COALESCE($3, norm_sections.strand)
       RETURNING id, grade_level, section_name, strand, created_at, updated_at`,
      [String(grade || '').trim() || null, String(section).trim(), String(strand || '').trim() || null]
    );

    res.status(201).json({
      id: rows[0].id,
      grade: rows[0].grade_level,
      section: rows[0].section_name,
      strand: rows[0].strand
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE grade & section by id
router.delete('/grades-sections/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM norm_sections WHERE id = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
