import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';

const router = Router();

router.get('/', authRequired, adminOnly, async (req,res) => {
  try {
    const { limit=100, user_id, action } = req.query;
    const clauses = []; const params=[];
    if (user_id){ params.push(user_id); clauses.push(`user_id = $${params.length}`); }
    if (action){ params.push(action); clauses.push(`action = $${params.length}`); }
    params.push(Math.min(Number(limit)||100, 500));
    const where = clauses.length ? 'WHERE '+clauses.join(' AND ') : '';
    const sql = `SELECT id, user_id, action, entity, entity_id, meta, created_at
                 FROM audit_logs
                 ${where}
                 ORDER BY id DESC
                 LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
