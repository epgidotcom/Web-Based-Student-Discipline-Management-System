import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const PRIVILEGED_ROLES = new Set(['Admin', 'Teacher']);

function isPrivileged(user) {
  return Boolean(user && PRIVILEGED_ROLES.has(user.role));
}

function getSenderRole(user) {
  if (!user || !user.role) return 'Student';
  if (user.role === 'Admin') return 'Admin';
  if (user.role === 'Teacher') return 'Teacher';
  return 'Student';
}

function mapAppealRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    studentId: row.student_id,
    violationId: row.violation_id,
    lrn: row.lrn || row.student_lrn || null,
    studentName: row.student_name,
    section: row.section || row.student_section || null,
    violation: row.violation_title || row.offense_type || null,
    reason: row.reason,
    status: row.status,
    decisionNotes: row.decision_notes,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestMessage: row.latest_message_created_at
      ? {
          senderRole: row.latest_message_sender_role,
          body: row.latest_message_body,
          createdAt: row.latest_message_created_at
        }
      : null
  };
}

function mapMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    appealId: row.appeal_id,
    senderAccountId: row.sender_account_id,
    senderRole: row.sender_role,
    senderName: row.sender_name || null,
    body: row.body,
    createdAt: row.created_at
  };
}

async function loadAppealRow(appealId) {
  const { rows } = await query(
    `SELECT a.*, s.lrn AS student_lrn, s.section AS student_section, v.offense_type,
            lm.body AS latest_message_body,
            lm.created_at AS latest_message_created_at,
            lm.sender_role AS latest_message_sender_role
       FROM appeals a
       LEFT JOIN students s ON s.id = a.student_id
       LEFT JOIN violations v ON v.id = a.violation_id
       LEFT JOIN LATERAL (
         SELECT body, created_at, sender_role
           FROM appeal_messages am
          WHERE am.appeal_id = a.id
          ORDER BY created_at DESC
          LIMIT 1
       ) lm ON TRUE
      WHERE a.id = $1`,
    [appealId]
  );
  return rows[0] || null;
}

async function fetchStudentById(id) {
  if (!id) return null;
  try {
    const { rows } = await query(
      'SELECT id, lrn, first_name, middle_name, last_name, grade, section FROM students WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    const msg = err?.message?.toLowerCase?.() || '';
    if (msg.includes('column "last_name"') && msg.includes('does not exist')) {
      const { rows } = await query(
        'SELECT id, lrn, first_name, middle_name, full_name, grade, section FROM students WHERE id = $1',
        [id]
      );
      return rows[0] || null;
    }
    throw err;
  }
}

async function fetchStudentByLrn(lrn) {
  if (!lrn) return null;
  try {
    const { rows } = await query(
      'SELECT id, lrn, first_name, middle_name, last_name, grade, section FROM students WHERE lrn = $1',
      [lrn]
    );
    return rows[0] || null;
  } catch (err) {
    const msg = err?.message?.toLowerCase?.() || '';
    if (msg.includes('column "last_name"') && msg.includes('does not exist')) {
      const { rows } = await query(
        'SELECT id, lrn, first_name, middle_name, full_name, grade, section FROM students WHERE lrn = $1',
        [lrn]
      );
      return rows[0] || null;
    }
    throw err;
  }
}

function buildStudentName(student) {
  if (!student) return null;
  if (!student.last_name && student.full_name) return student.full_name;
  return [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStatus(input) {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (value === 'approved') return 'Approved';
  if (value === 'rejected') return 'Rejected';
  if (value === 'pending') return 'Pending';
  return null;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, student_id: studentId, account_id: accountId, mine } = req.query;
    const clauses = [];
    const params = [];
    const user = req.user;
    const privileged = isPrivileged(user);

    if (!privileged) {
      clauses.push(`a.account_id = $${params.length + 1}`);
      params.push(user.id);
    } else {
      if (accountId) {
        clauses.push(`a.account_id = $${params.length + 1}`);
        params.push(accountId);
      }
      if (studentId) {
        clauses.push(`a.student_id = $${params.length + 1}`);
        params.push(studentId);
      }
      if (mine === '1') {
        clauses.push(`a.account_id = $${params.length + 1}`);
        params.push(user.id);
      }
    }

    if (status) {
      const normalized = normalizeStatus(status);
      if (!normalized) return res.status(400).json({ error: 'Invalid status filter' });
      clauses.push(`a.status = $${params.length + 1}`);
      params.push(normalized);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `
      SELECT a.*, s.lrn AS student_lrn, s.section AS student_section, v.offense_type,
             lm.body AS latest_message_body,
             lm.created_at AS latest_message_created_at,
             lm.sender_role AS latest_message_sender_role
        FROM appeals a
        LEFT JOIN students s ON s.id = a.student_id
        LEFT JOIN violations v ON v.id = a.violation_id
        LEFT JOIN LATERAL (
          SELECT body, created_at, sender_role
            FROM appeal_messages am
           WHERE am.appeal_id = a.id
           ORDER BY created_at DESC
           LIMIT 1
        ) lm ON TRUE
        ${where}
        ORDER BY a.created_at DESC`;
    const { rows } = await query(sql, params);
    res.json(rows.map(mapAppealRow));
  } catch (err) {
    console.error('[appeals] list failed', err);
    res.status(500).json({ error: 'Failed to load appeals' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await loadAppealRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Appeal not found' });
    if (!isPrivileged(req.user) && row.account_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(mapAppealRow(row));
  } catch (err) {
    console.error('[appeals] get failed', err);
    res.status(500).json({ error: 'Failed to load appeal' });
  }
});

router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const appeal = await loadAppealRow(req.params.id);
    if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
    if (!isPrivileged(req.user) && appeal.account_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await query(
      `SELECT m.*, a.full_name AS sender_name
         FROM appeal_messages m
         LEFT JOIN accounts a ON a.id = m.sender_account_id
        WHERE m.appeal_id = $1
        ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    res.json(rows.map(mapMessageRow));
  } catch (err) {
    console.error('[appeals] messages list failed', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const appeal = await loadAppealRow(req.params.id);
    if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
    if (!isPrivileged(req.user) && appeal.account_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const bodyText = (req.body?.body || '').trim();
    if (!bodyText) return res.status(400).json({ error: 'Message body is required' });

    const senderRole = getSenderRole(req.user);
    const { rows } = await query(
      `INSERT INTO appeal_messages (appeal_id, sender_account_id, sender_role, body, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING *`,
      [req.params.id, req.user.id || null, senderRole, bodyText]
    );

    await query('UPDATE appeals SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    const [messageRow] = rows;
    const mapped = mapMessageRow({ ...messageRow, sender_name: req.user?.full_name || req.user?.username || null });
    res.status(201).json(mapped);
  } catch (err) {
    console.error('[appeals] message create failed', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { violation, reason, student_id: studentIdInput, lrn, section, studentName, violation_id: violationIdInput } = req.body || {};

    let violationText = (violation || '').trim();
    const reasonText = (reason || '').trim();
    if (!violationText) return res.status(400).json({ error: 'violation is required' });
    if (!reasonText) return res.status(400).json({ error: 'reason is required' });

    let resolvedStudentId = null;
    let resolvedSection = section ? String(section).trim() : null;
    let resolvedLrn = lrn ? String(lrn).trim() : null;
    let resolvedStudentName = studentName ? String(studentName).trim() : '';

    let violationId = null;
    if (violationIdInput) {
      const { rows } = await query('SELECT id, offense_type FROM violations WHERE id = $1', [violationIdInput]);
      if (rows.length) {
        violationId = rows[0].id;
        if (!violationText) violationText = rows[0].offense_type || violationText;
      }
    }

    let studentRecord = null;
    if (studentIdInput) {
      studentRecord = await fetchStudentById(studentIdInput);
    } else if (resolvedLrn) {
      studentRecord = await fetchStudentByLrn(resolvedLrn);
    }

    if (studentRecord) {
      resolvedStudentId = studentRecord.id;
      resolvedSection = resolvedSection || studentRecord.section || studentRecord.grade || null;
      resolvedLrn = resolvedLrn || studentRecord.lrn || null;
      if (!resolvedStudentName) {
        resolvedStudentName = buildStudentName(studentRecord);
      }
    }

    if (!resolvedStudentName) {
      resolvedStudentName = req.user?.full_name || req.user?.username || 'Student';
    }

    const { rows } = await query(
      `INSERT INTO appeals (
         account_id, student_id, violation_id, lrn, student_name, section, violation_title, reason, status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending', NOW(), NOW())
       RETURNING *`,
      [
        req.user.id,
        resolvedStudentId,
        violationId,
        resolvedLrn,
        resolvedStudentName,
        resolvedSection,
        violationText,
        reasonText
      ]
    );
  const row = rows[0];
    res.status(201).json(mapAppealRow(row));
  } catch (err) {
    console.error('[appeals] create failed', err);
    res.status(500).json({ error: 'Failed to submit appeal' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const privileged = isPrivileged(req.user);
  if (!privileged) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { status, decisionNotes } = req.body || {};
    const updates = [];
    const params = [];

    if (status !== undefined) {
      const normalized = normalizeStatus(status);
      if (!normalized) return res.status(400).json({ error: 'Invalid status' });
      updates.push(`status = $${params.length + 1}`);
      params.push(normalized);
      if (normalized === 'Pending') {
        updates.push('decided_by = NULL');
        updates.push('decided_at = NULL');
      } else {
        updates.push(`decided_by = $${params.length + 1}`);
        params.push(req.user.id);
        updates.push('decided_at = NOW()');
      }
    }

    if (decisionNotes !== undefined) {
      updates.push(`decision_notes = $${params.length + 1}`);
      params.push(decisionNotes === null ? null : String(decisionNotes));
    }

    if (!updates.length) return res.status(400).json({ error: 'No changes provided' });
    updates.push('updated_at = NOW()');

    const sql = `UPDATE appeals SET ${updates.join(', ')} WHERE id = $${params.length + 1} RETURNING *`;
    params.push(req.params.id);
    const { rows } = await query(sql, params);
    if (!rows.length) return res.status(404).json({ error: 'Appeal not found' });
    res.json(mapAppealRow(rows[0]));
  } catch (err) {
    console.error('[appeals] update failed', err);
    res.status(500).json({ error: 'Failed to update appeal' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!isPrivileged(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { rowCount } = await query('DELETE FROM appeals WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Appeal not found' });
    res.status(204).end();
  } catch (err) {
    console.error('[appeals] delete failed', err);
    res.status(500).json({ error: 'Failed to delete appeal' });
  }
});

export default router;
