import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const ADMIN_ROLES = new Set(['Admin', 'Teacher']);

const isAdmin = (user) => Boolean(user && ADMIN_ROLES.has(user.role));

const mapAccount = (row) => ({
  id: row.id,
  name: row.full_name,
  role: row.role,
  grade: row.grade || null
});

const mapMessageRow = (row) => ({
  id: row.id,
  body: row.body,
  createdAt: row.created_at,
  sender: {
    id: row.sender_account_id,
    name: row.sender_name || null,
    role: row.sender_role || null
  },
  receiver: {
    id: row.receiver_account_id,
    name: row.receiver_name || null,
    role: row.receiver_role || null
  }
});

async function fetchAccount(accountId) {
  if (!accountId) return null;
  const { rows } = await query(
    'SELECT id, full_name, role, grade FROM accounts WHERE id = $1',
    [accountId]
  );
  return rows[0] || null;
}

async function resolveDefaultAdmin() {
  const { rows } = await query(
    `SELECT id, full_name, role, grade
       FROM accounts
      WHERE role IN ('Admin','Teacher')
      ORDER BY created_at ASC
      LIMIT 1`
  );
  return rows[0] || null;
}

router.use(requireAuth);

router.get('/participants', async (req, res) => {
  try {
    const user = req.user;
    const limit = Math.min(parseInt(req.query.limit ?? '200', 10) || 200, 500);

    if (isAdmin(user)) {
      const { rows } = await query(
        `SELECT id, full_name, role, grade
           FROM accounts
          WHERE role = 'Student'
          ORDER BY full_name ASC NULLS LAST
          LIMIT $1`,
        [limit]
      );
      res.json({ success: true, participants: rows.map(mapAccount) });
      return;
    }

    const { rows } = await query(
      `SELECT id, full_name, role, grade
         FROM accounts
        WHERE role IN ('Admin','Teacher')
        ORDER BY created_at ASC
        LIMIT $1`,
      [limit]
    );
    res.json({ success: true, participants: rows.map(mapAccount) });
  } catch (err) {
    console.error('[messages] participants failed', err);
    res.status(500).json({ success: false, error: 'Failed to load participants' });
  }
});

router.get('/', async (req, res) => {
  try {
    const user = req.user;
    const participantId = req.query.participantId || req.query.accountId || null;
    const before = req.query.before ? new Date(req.query.before) : null;
    const after = req.query.after ? new Date(req.query.after) : null;
    const limit = Math.min(parseInt(req.query.limit ?? '200', 10) || 200, 500);

    const params = [];
    const whereParts = [];

    const userParam = `$${params.push(user.id)}`;

    if (participantId) {
      const participant = await fetchAccount(participantId);
      if (!participant) {
        return res.status(404).json({ success: false, error: 'Participant not found' });
      }
      if (!isAdmin(user) && participant.role === 'Student' && participant.id !== user.id) {
        return res.status(403).json({ success: false, error: 'Students may only message school staff.' });
      }
      const participantParam = `$${params.push(participantId)}`;
      whereParts.push(
        `((m.sender_account_id = ${userParam} AND m.receiver_account_id = ${participantParam})
         OR (m.sender_account_id = ${participantParam} AND m.receiver_account_id = ${userParam}))`
      );
    } else if (!isAdmin(user)) {
      whereParts.push(`(m.sender_account_id = ${userParam} OR m.receiver_account_id = ${userParam})`);
    }

    if (after && !Number.isNaN(after.getTime())) {
      const p = `$${params.push(after.toISOString())}`;
      whereParts.push(`m.created_at >= ${p}`);
    }
    if (before && !Number.isNaN(before.getTime())) {
      const p = `$${params.push(before.toISOString())}`;
      whereParts.push(`m.created_at <= ${p}`);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const limitParam = `$${params.push(limit)}`;

    const sql = `
      SELECT m.*,
             sa.full_name AS sender_name, sa.role AS sender_role,
             ra.full_name AS receiver_name, ra.role AS receiver_role
        FROM messages m
        LEFT JOIN accounts sa ON sa.id = m.sender_account_id
        LEFT JOIN accounts ra ON ra.id = m.receiver_account_id
      ${whereClause}
        ORDER BY m.created_at ASC
        LIMIT ${limitParam}`;

    const { rows } = await query(sql, params);
    res.json({ success: true, messages: rows.map(mapMessageRow) });
  } catch (err) {
    console.error('[messages] list failed', err);
    res.status(500).json({ success: false, error: 'Failed to load messages' });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = req.user;
    let receiverId = req.body?.receiverId || req.body?.receiver_id || null;
    const content = (req.body?.content ?? req.body?.body ?? '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    const senderIsAdmin = isAdmin(user);

    if (!receiverId) {
      if (senderIsAdmin) {
        return res.status(400).json({ success: false, error: 'receiverId is required' });
      }
      const fallback = await resolveDefaultAdmin();
      if (!fallback) {
        return res.status(400).json({ success: false, error: 'No administrator available to receive messages.' });
      }
      receiverId = fallback.id;
    }

    if (receiverId === user.id) {
      return res.status(400).json({ success: false, error: 'Cannot send a message to yourself.' });
    }

    const receiver = await fetchAccount(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, error: 'Receiver not found' });
    }

    if (!senderIsAdmin && receiver.role === 'Student' && receiver.id !== user.id) {
      return res.status(403).json({ success: false, error: 'Students may only message administrators or teachers.' });
    }

    const { rows } = await query(
      `INSERT INTO messages (sender_account_id, receiver_account_id, body)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [user.id, receiver.id, content]
    );
    const inserted = rows[0];

    const { rows: hydrated } = await query(
      `SELECT m.*,
              sa.full_name AS sender_name, sa.role AS sender_role,
              ra.full_name AS receiver_name, ra.role AS receiver_role
         FROM messages m
         LEFT JOIN accounts sa ON sa.id = m.sender_account_id
         LEFT JOIN accounts ra ON ra.id = m.receiver_account_id
        WHERE m.id = $1`,
      [inserted.id]
    );

    res.status(201).json({ success: true, message: mapMessageRow(hydrated[0]) });
  } catch (err) {
    console.error('[messages] create failed', err);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

export default router;
