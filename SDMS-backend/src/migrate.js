import { query } from './db.js';

/**
 * Idempotent schema migrations.
 * Each step uses IF NOT EXISTS / IF EXISTS so re-running is safe.
 */
export async function runMigrations() {
  // --- students table ---
  // Ensure all expected columns exist (old deployments may only have full_name)
  const studentColumns = [
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS lrn VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS middle_name VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS full_name VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS birthdate DATE`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS age INTEGER`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS address VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS grade VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS grade_level VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS section VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_contact VARCHAR`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
  ];

  for (const sql of studentColumns) {
    await query(sql);
  }

  // Back-fill split name columns for rows that only have full_name
  await query(`
    UPDATE students
       SET first_name = trim(split_part(full_name, ' ', 1))
     WHERE first_name IS NULL
       AND full_name IS NOT NULL
       AND trim(full_name) <> ''
  `);

  await query(`
    UPDATE students
       SET last_name = trim(
             CASE
               WHEN array_length(string_to_array(trim(full_name), ' '), 1) > 1
               THEN (string_to_array(trim(full_name), ' '))[array_length(string_to_array(trim(full_name), ' '), 1)]
               ELSE trim(full_name)
             END
           )
     WHERE last_name IS NULL
       AND full_name IS NOT NULL
       AND trim(full_name) <> ''
  `);

  // Back-fill full_name from split columns for rows that have the split columns set
  await query(`
    UPDATE students
       SET full_name = trim(concat_ws(' ', first_name, middle_name, last_name))
     WHERE full_name IS NULL
       AND (first_name IS NOT NULL OR last_name IS NOT NULL)
  `);
}
