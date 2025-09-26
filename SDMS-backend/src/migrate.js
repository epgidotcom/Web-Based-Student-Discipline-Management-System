import { query } from './db.js';

export async function runMigrations() {
  const sql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin','Teacher','Student')),
  grade TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS past_offenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_past_offenses_student_name ON past_offenses(student_name);

CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Students table used by frontend student list
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lrn TEXT UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  birthdate DATE,
  address TEXT,
  grade TEXT,
  section TEXT,
  parent_contact TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
`;
  await query(sql);
  console.log('Migration complete');
}

// If invoked directly via: node src/migrate.js
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch(e => {
    console.error('Migration failed', e);
    process.exit(1);
  });
}
