import { query } from '../db.js';

export async function audit(user, action, entity, entityId, meta){
  try {
    await query(
      'INSERT INTO audit_logs (user_id, action, entity, entity_id, meta) VALUES ($1,$2,$3,$4,$5)',
      [user?.id || null, action, entity || null, entityId || null, meta ? JSON.stringify(meta) : null]
    );
  } catch (e) {
    console.warn('[audit] failed:', e.message);
  }
}
