import { Router } from 'express';
import { query } from '../db.js';
import bcrypt from 'bcrypt';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Count privileged accounts (Admin/Teacher roles)
async function privilegedCount(){
  const { rows } = await query("SELECT COUNT(*)::int AS c FROM accounts WHERE role IN ('Admin','Teacher')");
  return rows[0]?.c || 0;
}

// List accounts (admin/guidance only)
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
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

router.get('/students', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id,
              full_name AS "fullName",
              username,
              grade,
              created_at AS "createdAt"
         FROM accounts
        WHERE role = 'Student'
        ORDER BY full_name ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch student accounts' });
  }
});

// Create account. If there are zero accounts, allow bootstrap without auth.
router.post('/', async (req, res) => {
  try {
    const { fullName, email, username, password, role, grade } = req.body;
    if (!fullName || !email || !username || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Count existing accounts
    const countQ = await query('SELECT COUNT(*)::int AS c FROM accounts');
    const existing = countQ.rows[0].c;
    if (existing > 0) {
      // must be authenticated admin
      // We'll perform lightweight auth check manually to avoid double hash on bootstrap path
      return withAdmin(req, res, async () => {
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
        res.status(201).json(rows[0]);
      });
    } else {
      // Bootstrap first admin if role not Student
      if (role === 'Student') {
        return res.status(400).json({ error: 'First account must be Admin/Teacher' });
      }
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await query(
        `INSERT INTO accounts (full_name, email, username, password_hash, role)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, full_name AS "fullName", email, username, role, grade, created_at AS "createdAt"`,
        [fullName.trim(), email.toLowerCase().trim(), username.toLowerCase().trim(), hash, role]
      );
      res.status(201).json({ ...rows[0], bootstrap: true });
    }
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email or username already exists' });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account (admin/teacher only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { fullName, email, username, role, grade, password } = req.body || {};
    const existingQ = await query('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
    if(!existingQ.rows.length) return res.status(404).json({ error: 'Not found' });
    const existing = existingQ.rows[0];

    // Prevent demoting last privileged account
    if(existing.role !== 'Student' && role && role === 'Student'){
      const count = await privilegedCount();
      if(count <= 1) return res.status(400).json({ error: 'Cannot demote the last privileged account' });
    }

    let password_hash = existing.password_hash;
    if(password){ password_hash = await bcrypt.hash(password, 12); }

    const { rows } = await query(`UPDATE accounts
      SET full_name = COALESCE($1, full_name),
          email = COALESCE($2, email),
          username = COALESCE($3, username),
          role = COALESCE($4, role),
          grade = CASE WHEN COALESCE($4, role) = 'Student' THEN COALESCE($5, grade) ELSE NULL END,
          password_hash = $6
      WHERE id = $7
      RETURNING id, full_name AS "fullName", email, username, role, grade, created_at AS "createdAt"`,
      [fullName ? fullName.trim() : null,
       email ? email.toLowerCase().trim() : null,
       username ? username.toLowerCase().trim() : null,
       role || null,
       grade || null,
       password_hash,
       req.params.id]);
    res.json(rows[0]);
  } catch(e){
    if(e.code === '23505') return res.status(409).json({ error: 'Email or username already exists' });
    console.error(e);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account (admin/guidance only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const acctQ = await query('SELECT role FROM accounts WHERE id = $1', [req.params.id]);
    if(!acctQ.rows.length) return res.status(404).json({ error: 'Not found' });
    const role = acctQ.rows[0].role;
    if(role === 'Admin' || role === 'Teacher'){
      const count = await privilegedCount();
      if(count <= 1) return res.status(400).json({ error: 'Cannot delete the last privileged account' });
    }
    const { rowCount } = await query('DELETE FROM accounts WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Helper wrapper to run code with admin requirement when we cannot attach middleware earlier (bootstrap logic path)
function withAdmin(req, res, fn){
  return new Promise(resolve => {
    requireAuth(req, res, () => {
      requireAdmin(req, res, () => {
        Promise.resolve(fn()).finally(resolve);
      });
    });
  });
}

export default router;
