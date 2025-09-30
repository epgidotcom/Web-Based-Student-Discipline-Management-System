import 'dotenv/config';
import bcrypt from 'bcrypt';
import { query } from './db.js';

async function main(){
  const username = process.env.SEED_ADMIN_USER || 'admin';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const fullName = process.env.SEED_ADMIN_NAME || 'System Administrator';

  const { rows } = await query(`SELECT id FROM accounts WHERE role='Admin' LIMIT 1`);
  if(rows[0]){ console.log('[seed_admin] Admin already exists; skipping.'); process.exit(0); }

  const hash = await bcrypt.hash(password, 12);
  const ins = await query(`INSERT INTO accounts (full_name,email,username,password_hash,role) VALUES ($1,$2,$3,$4,'Admin') RETURNING id`, [fullName, email.toLowerCase(), username.toLowerCase(), hash]);
  console.log('[seed_admin] Created admin user:', { id: ins.rows[0].id, username, email });
  console.log('[seed_admin] IMPORTANT: Change this password after first login.');
}

main().catch(e => { console.error('[seed_admin] Failed:', e); process.exit(1); });
