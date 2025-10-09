import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const PRIVILEGED_ROLES = new Set(['Admin', 'Teacher']);

function isPrivileged(user) {
  return Boolean(user && PRIVILEGED_ROLES.has(user.role));
}

function mapMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentAccountId: row.student_account_id,
    senderAccountId: row.sender_account_id,
    senderRole: row.sender_role,
    senderName: row.sender_name || null,
    subject: row.subject || null,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at
  };
}

function mapThreadRow(row) {
  if (!row) return null;
  return {
    studentAccountId: row.student_account_id,
    studentName: row.student_name,
    studentUsername: row.student_username,
    studentGrade: row.student_grade,
    lastMessage: {
      subject: row.last_subject || null,
      body: row.last_body || null,
      createdAt: row.last_created_at,
      senderRole: row.last_sender_role,
      senderName: row.sender_name || null
    },
    messageCount: Number(row.message_count || 0)
  };
}

async function getStudentAccount(accountId) {
  if (!accountId) return null;
  const { rows } = await query(
    `SELECT id, full_name, username, grade
       FROM accounts
      WHERE id = $1 AND role = 'Student'`,
    [accountId]
  );
  return rows[0] || null;
}

async function markAllRead(studentAccountId) {
  if (!studentAccountId) return;
  try {
    await query(
      `UPDATE student_messages
          SET read_at = NOW()
        WHERE student_account_id = $1
          AND read_at IS NULL`,
      [studentAccountId]
    );
  } catch (err) {
    console.warn('[messages] failed marking messages read', err);
  }
}

router.get('/threads', requireAuth, async (req, res) => {
  if (!isPrivileged(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { rows } = await query(
      `WITH ranked AS (
         SELECT sm.*, 
                ROW_NUMBER() OVER (PARTITION BY sm.student_account_id ORDER BY sm.created_at DESC) AS rn,
                COUNT(*) OVER (PARTITION BY sm.student_account_id) AS message_count,
                stu.full_name AS student_name,
                stu.username AS student_username,
                stu.grade AS student_grade,
                sender.full_name AS sender_name
           FROM student_messages sm
           JOIN accounts stu ON stu.id = sm.student_account_id
           LEFT JOIN accounts sender ON sender.id = sm.sender_account_id
          WHERE stu.role = 'Student'
       )
       SELECT student_account_id,
              student_name,
              student_username,
              student_grade,
              subject AS last_subject,
              body AS last_body,
              created_at AS last_created_at,
              sender_role AS last_sender_role,
              sender_name,
              message_count
         FROM ranked
        WHERE rn = 1
       ORDER BY last_created_at DESC NULLS LAST`
     );
    res.json(rows.map(mapThreadRow));
  } catch (err) {
    console.error('[messages] threads failed', err);
    res.status(500).json({ error: 'Failed to load message threads' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { studentAccountId } = req.query;
    const user = req.user;
    const privileged = isPrivileged(user);

    let targetAccountId = studentAccountId || null;
    if (!targetAccountId) {
      if (privileged) {
        return res.status(400).json({ error: 'studentAccountId is required' });
      }
      targetAccountId = user.id;
    }

    if (!privileged && targetAccountId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const studentAccount = await getStudentAccount(targetAccountId);
    if (!studentAccount) {
      return res.status(404).json({ error: 'Student account not found' });
    }

    const { rows } = await query(
      `SELECT sm.*, sender.full_name AS sender_name
         FROM student_messages sm
         LEFT JOIN accounts sender ON sender.id = sm.sender_account_id
        WHERE sm.student_account_id = $1
        ORDER BY sm.created_at ASC`,
      [studentAccount.id]
    );
    if (!privileged) {
      await markAllRead(studentAccount.id);
    }
    res.json(rows.map(mapMessageRow));
  } catch (err) {
    console.error('[messages] list failed', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { studentAccountId, subject, body } = req.body || {};
    const user = req.user;
    const privileged = isPrivileged(user);

    const messageBody = (body || '').trim();
    if (!messageBody) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    let targetAccountId = studentAccountId || null;
    if (privileged) {
      if (!targetAccountId) {
        return res.status(400).json({ error: 'studentAccountId is required' });
      }
    } else {
      if (targetAccountId && targetAccountId !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      targetAccountId = user.id;
    }

    const studentAccount = await getStudentAccount(targetAccountId);
    if (!studentAccount) {
      return res.status(404).json({ error: 'Student account not found' });
    }

    const senderRole = privileged ? user.role : 'Student';
    const cleanSubject = subject ? String(subject).trim() || null : null;

    const insertResult = await query(
      `INSERT INTO student_messages (student_account_id, sender_account_id, sender_role, subject, body, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       RETURNING id`,
      [studentAccount.id, user.id, senderRole, cleanSubject, messageBody]
    );

    const insertedId = insertResult.rows[0]?.id;
    if (!insertedId) {
      return res.status(500).json({ error: 'Failed to send message' });
    }

    const { rows } = await query(
      `SELECT sm.*, sender.full_name AS sender_name
         FROM student_messages sm
         LEFT JOIN accounts sender ON sender.id = sm.sender_account_id
        WHERE sm.id = $1`,
      [insertedId]
    );

    res.status(201).json(mapMessageRow(rows[0]));
  } catch (err) {
    console.error('[messages] create failed', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
