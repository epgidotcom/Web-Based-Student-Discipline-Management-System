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
      `SELECT a.id, a.full_name AS "fullName", a.email, a.username, a.role,
              s.grade, s.lrn, s.section, s.age AS age, a.created_at AS "createdAt"
       FROM accounts a
       LEFT JOIN students s ON a.id = s.id
       ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Create account. If there are zero accounts, allow bootstrap without auth.
router.post('/', async (req, res) => {
  try {
    console.log("Received body:", req.body)
    const { fullName, email, username, password, role, grade, lrn, section, age } = req.body;
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
        // If creating a student, require lrn, section, and age
        if (role === 'Student' && (!lrn || !section || (age === undefined || age === null))) {
          return res.status(400).json({ error: 'Student accounts require LRN, section and age' });
        }

        const hash = await bcrypt.hash(password, 12);
        await query('BEGIN');
        try {
          const { rows } = await query(
            `INSERT INTO accounts (full_name, email, username, password_hash, role)
             VALUES ($1,$2,$3,$4)
             RETURNING id, full_name AS "fullName", email, username, role, created_at AS "createdAt"`,
            [
              fullName.trim(),
              email.toLowerCase().trim(),
              username.toLowerCase().trim(),
              hash,
              role
            ]
          );
          const acct = rows[0];

          if (role === 'Student') {
            // Insert into students table 
            await query(
              `INSERT INTO students (account_id, full_name, lrn, section, grade, age, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [acct.id, fullName.trim(), lrn || null, section || null, grade || null, age || null, acct.createdAt]
            );
          }

          await query('COMMIT');

          const result = { ...acct, age: role === 'Student' ? (age || null) : null };
          res.status(201).json(result);
        } catch (err) {
          await query('ROLLBACK');
          throw err;
        }
      });
    } else {

      if (role === 'Student') {
        return res.status(400).json({ error: 'First account must be Admin/Teacher' });
      }
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await query(
        `INSERT INTO accounts (full_name, email, username, password_hash, role)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, full_name AS "fullName", email, username, role, created_at AS "createdAt"`,
        [fullName.trim(), email.toLowerCase().trim(), username.toLowerCase().trim(), hash, role]
      );
      res.status(201).json({ ...rows[0], age: null, bootstrap: true });
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
    const { fullName, email, username, role, grade, lrn, section, age, password } = req.body || {};
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

    // Perform accounts update and student upsert/delete in a transaction for consistency
    await query('BEGIN');
    try {
      await query(`UPDATE accounts
        SET full_name = COALESCE($1, full_name),
            email = COALESCE($2, email),
            username = COALESCE($3, username),
            role = COALESCE($4, role),
            grade = CASE WHEN COALESCE($4, role) = 'Student' THEN COALESCE($5, grade) ELSE NULL END,
            lrn = CASE WHEN COALESCE($4, role) = 'Student' THEN COALESCE($6, lrn) ELSE NULL END,
            section = CASE WHEN COALESCE($4, role) = 'Student' THEN COALESCE($7, section) ELSE NULL END,
            password_hash = $8
        WHERE id = $9`,
        [fullName ? fullName.trim() : null,
         email ? email.toLowerCase().trim() : null,
         username ? username.toLowerCase().trim() : null,
         role || null,
         grade || null,
         lrn || null,
         section || null,
         password_hash,
         req.params.id]);

      // If resulting role is Student, upsert into students; otherwise remove students row
      if ((role || existing.role) === 'Student') {
        // require age when role is student and age provided is undefined only when trying to set to Student
        if ((role && role === 'Student') && (age === undefined || age === null)) {
          // if age not provided in this update but student already existed, we allow keeping existing age;
          // if no students row exists and age missing, error
          const sCheck = await query('SELECT 1 FROM students WHERE account_id = $1', [req.params.id]);
          if (!sCheck.rows.length) {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'Student accounts require age' });
          }
        }
        await query(
          `INSERT INTO students (account_id, full_name, lrn, section, grade, age)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (account_id) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 lrn = EXCLUDED.lrn,
                 section = EXCLUDED.section,
                 grade = EXCLUDED.grade,
                 age = EXCLUDED.age`,
          [req.params.id,
           fullName ? fullName.trim() : existing.full_name,
           lrn || null,
           section || null,
           ((role || existing.role) === 'Student') ? (grade || null) : null,
           age || null]
        );
      } else {
        // not a student anymore -> remove students entry
        await query('DELETE FROM students WHERE account_id = $1', [req.params.id]);
      }

      // Return the combined account + student record
      const { rows } = await query(
        `SELECT a.id, a.full_name AS "fullName", a.email, a.username, a.role,
                a.grade, a.lrn, a.section, s.age AS age, a.created_at AS "createdAt"
         FROM accounts a
         LEFT JOIN students s ON a.id = s.account_id
         WHERE a.id = $1`,
        [req.params.id]
      );

      await query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
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
