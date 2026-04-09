import { query } from './db.js';

/**
 * Idempotent schema migrations.
 * Each step uses IF NOT EXISTS / IF EXISTS so re-running is safe.
 */
export async function runMigrations() {
  const violationsIdTypeQuery = await query(`
    SELECT udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'violations'
      AND column_name = 'id'
    LIMIT 1
  `);

  const studentsIdTypeQuery = await query(`
    SELECT udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'students'
      AND column_name = 'id'
    LIMIT 1
  `);

  const toSqlType = (udtName, fallback) => {
    if (!udtName) return fallback;
    if (udtName === 'uuid') return 'UUID';
    if (udtName === 'int8') return 'BIGINT';
    if (udtName === 'int4') return 'INTEGER';
    return fallback;
  };

  const violationsIdType = toSqlType(violationsIdTypeQuery.rows[0]?.udt_name, 'UUID');
  const studentsIdType = toSqlType(studentsIdTypeQuery.rows[0]?.udt_name, violationsIdType);

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

  // --- norm_students compatibility ---
  // Keep a compatibility full_name column available for older queries while
  // allowing newer routes to use split name columns.
  const normStudentColumns = [
    `ALTER TABLE IF EXISTS norm_students ADD COLUMN IF NOT EXISTS first_name VARCHAR`,
    `ALTER TABLE IF EXISTS norm_students ADD COLUMN IF NOT EXISTS middle_name VARCHAR`,
    `ALTER TABLE IF EXISTS norm_students ADD COLUMN IF NOT EXISTS last_name VARCHAR`,
    `ALTER TABLE IF EXISTS norm_students ADD COLUMN IF NOT EXISTS full_name VARCHAR`,
    `ALTER TABLE IF EXISTS norm_students ADD COLUMN IF NOT EXISTS birthdate DATE`,
  ];

  for (const sql of normStudentColumns) {
    await query(sql);
  }

  await query(`
    UPDATE norm_students
       SET first_name = trim(split_part(full_name, ' ', 1))
     WHERE first_name IS NULL
       AND full_name IS NOT NULL
       AND trim(full_name) <> ''
  `);

  await query(`
    UPDATE norm_students
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

  await query(`
    UPDATE norm_students
       SET full_name = trim(concat_ws(' ', first_name, middle_name, last_name))
     WHERE full_name IS NULL
       AND (first_name IS NOT NULL OR last_name IS NOT NULL)
  `);

  // --- norm_sections compatibility ---
  // Ensure strand stores textual tracks (e.g., STEM/ABM), not numeric ids.
  await query(`
    ALTER TABLE IF EXISTS norm_sections
    ADD COLUMN IF NOT EXISTS strand VARCHAR
  `);

  await query(`
    ALTER TABLE IF EXISTS norm_sections
    ALTER COLUMN strand TYPE VARCHAR USING strand::VARCHAR
  `);

  // --- predictive inference storage ---
  await query(`
    CREATE TABLE IF NOT EXISTS violation_predictions (
      id BIGSERIAL PRIMARY KEY,
      violation_id ${violationsIdType} NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
      student_id ${studentsIdType} NOT NULL,
      grade_section VARCHAR,
      violation_label VARCHAR,
      incident_date DATE,
      repeat_probability DOUBLE PRECISION NOT NULL CHECK (repeat_probability >= 0 AND repeat_probability <= 1),
      model_version VARCHAR NOT NULL,
      source_service VARCHAR,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (violation_id, model_version)
    )
  `);

  await query(`
    ALTER TABLE violation_predictions
    ADD COLUMN IF NOT EXISTS incident_date DATE
  `);

  await query(`
    UPDATE violation_predictions vp
       SET incident_date = v.incident_date
      FROM violations v
     WHERE vp.violation_id = v.id
       AND vp.incident_date IS NULL
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_violation_predictions_section_time
      ON violation_predictions (grade_section, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_violation_predictions_incident_date
      ON violation_predictions (incident_date DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_violation_predictions_violation_label
      ON violation_predictions (violation_label)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS section_repeat_likelihood_snapshots (
      id BIGSERIAL PRIMARY KEY,
      grade_section VARCHAR NOT NULL,
      violation_label VARCHAR,
      window_days INTEGER NOT NULL,
      sample_size INTEGER NOT NULL,
      avg_repeat_probability DOUBLE PRECISION NOT NULL CHECK (avg_repeat_probability >= 0 AND avg_repeat_probability <= 1),
      computed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_section_repeat_likelihood_recent
      ON section_repeat_likelihood_snapshots (grade_section, computed_at DESC)
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
