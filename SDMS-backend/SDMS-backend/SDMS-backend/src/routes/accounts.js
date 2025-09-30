import { Router } from 'express';
import { query } from '../db.js';
import bcrypt from 'bcrypt';
import { authRequired, adminOnly } from '../middleware/auth.js';
import { audit } from '../util/audit.js';

const router = Router();

router.get('/', authRequired, adminOnly, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name AS "fullName", email, username, role, grade, created_at AS "createdAt"
       FROM accounts ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

router.post('/', authRequired, adminOnly, async (req, res) => {
  try {
    const { fullName, email, username, password, role, grade } = req.body;
    if (!fullName || !email || !username || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['Admin','Student','GuidanceCounselor'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO accounts (full_name, email, username, password_hash, role, grade)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, full_name AS "fullName", email, username, role, grade, created_at AS "createdAt"`,
      [
        fullName.trim(),
        email.toLowerCase().trim(),
        username.toLowerCase().trim(),
        hash,
        role,
        role === 'Student' ? (grade || null) : null
      ]
    );
  const created = rows[0];
  audit(req.user, 'create_account', 'account', created.id, { role: created.role });
  res.status(201).json(created);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email or username already exists' });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.delete('/:id', authRequired, adminOnly, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM accounts WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
  audit(req.user, 'delete_account', 'account', req.params.id, null);
  res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
