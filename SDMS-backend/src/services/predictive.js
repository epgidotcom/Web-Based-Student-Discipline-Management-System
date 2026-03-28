import { query } from '../db.js';

const DEFAULT_WINDOW_DAYS = 90;
const DEFAULT_INFER_TIMEOUT_MS = 5000;
const DEFAULT_INFER_RETRIES = 1;

function getPredictiveServiceUrl() {
  const value = String(process.env.PREDICTIVE_SERVICE_URL || '').trim();
  return value ? value.replace(/\/+$/, '') : '';
}

function parseIncidentDate(input) {
  const parsed = new Date(input || Date.now());
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function toEvidenceToken(evidence) {
  if (evidence == null) return 'none';
  if (typeof evidence === 'string') return evidence.trim() ? 'present' : 'none';
  if (Array.isArray(evidence)) return evidence.length ? 'present' : 'none';
  if (typeof evidence === 'object') {
    const files = Array.isArray(evidence.files) ? evidence.files : [];
    return files.length ? 'present' : 'none';
  }
  return 'present';
}

async function resolveOffenseId(violationRow) {
  const direct = Number.parseInt(violationRow.offense_id, 10);
  if (Number.isFinite(direct)) return direct;

  const description = String(violationRow.description || violationRow.violation_type || '').trim();
  if (!description) return 0;

  try {
    const { rows } = await query(
      `SELECT id
         FROM norm_offenses
        WHERE description = $1
        ORDER BY id ASC
        LIMIT 1`,
      [description]
    );
    const id = Number.parseInt(rows[0]?.id, 10);
    return Number.isFinite(id) ? id : 0;
  } catch (error) {
    console.warn('[predictive] unable to resolve offense_id from norm_offenses', { description, error: error.message });
    return 0;
  }
}

export async function buildInferencePayload(violationRow, studentRow) {
  const incidentDate = parseIncidentDate(violationRow.incident_date);
  const offenseId = await resolveOffenseId(violationRow);

  return {
    offense_id: offenseId,
    description: String(violationRow.description || '').trim(),
    sanction: String(violationRow.sanction || 'none').trim() || 'none',
    evidence: toEvidenceToken(violationRow.evidence),
    status: String(violationRow.status || 'Pending').trim() || 'Pending',
    active: studentRow?.active ? 1 : 0,
    incident_year: incidentDate.getUTCFullYear(),
    incident_month: incidentDate.getUTCMonth() + 1,
    incident_day: incidentDate.getUTCDate(),
    incident_dayofweek: incidentDate.getUTCDay(),
  };
}

export async function requestRepeatProbability(payload) {
  const serviceUrl = getPredictiveServiceUrl();
  if (!serviceUrl) {
    throw new Error('PREDICTIVE_SERVICE_URL is not configured');
  }

  const timeoutRaw = Number.parseInt(process.env.PREDICTIVE_TIMEOUT_MS, 10);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_INFER_TIMEOUT_MS;
  const retriesRaw = Number.parseInt(process.env.PREDICTIVE_MAX_RETRIES, 10);
  const maxRetries = Number.isFinite(retriesRaw) && retriesRaw >= 0 ? Math.min(retriesRaw, 3) : DEFAULT_INFER_RETRIES;

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${serviceUrl}/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Predictive service request failed (${response.status}): ${text}`);
      }

      const result = await response.json();
      const probability = Number(result.repeat_probability);
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new Error('Predictive service returned an invalid repeat_probability');
      }

      return {
        repeatProbability: probability,
        modelVersion: String(result.model_version || 'unknown'),
        sourceService: serviceUrl,
      };
    } catch (error) {
      const isAbort = error?.name === 'AbortError';
      lastError = isAbort
        ? new Error(`Predictive service timed out after ${timeoutMs}ms`)
        : error;

      const canRetry = attempt < maxRetries;
      if (!canRetry) break;

      // Small fixed backoff to reduce burst retries under transient failures.
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw lastError || new Error('Predictive service request failed');
}

export async function persistViolationPrediction({
  violationId,
  studentId,
  gradeSection,
  violationLabel,
  incidentDate,
  repeatProbability,
  modelVersion,
  sourceService,
}) {
  await query(
    `INSERT INTO violation_predictions (
       violation_id,
       student_id,
       grade_section,
       violation_label,
       incident_date,
       repeat_probability,
       model_version,
       source_service
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (violation_id, model_version)
     DO UPDATE SET
       incident_date = EXCLUDED.incident_date,
       repeat_probability = EXCLUDED.repeat_probability,
       source_service = EXCLUDED.source_service,
       created_at = NOW()`,
    [
      violationId,
      studentId,
      gradeSection || 'Unknown',
      violationLabel || 'Unknown',
      incidentDate || null,
      repeatProbability,
      modelVersion,
      sourceService || null
    ]
  );
}

export async function upsertSectionSnapshot({ gradeSection, violationLabel = null, windowDays = DEFAULT_WINDOW_DAYS }) {
  const { rows } = await query(
    `SELECT
       COALESCE(AVG(repeat_probability), 0) AS avg_probability,
       COUNT(*)::int AS sample_size
     FROM violation_predictions
     WHERE grade_section = $1
       AND ($2::varchar IS NULL OR violation_label = $2)
       AND COALESCE(incident_date, created_at::date) >= CURRENT_DATE - $3::int`,
    [gradeSection || 'Unknown', violationLabel, windowDays]
  );

  const avgProbability = Number(rows[0]?.avg_probability || 0);
  const sampleSize = Number(rows[0]?.sample_size || 0);

  await query(
    `INSERT INTO section_repeat_likelihood_snapshots (
       grade_section,
       violation_label,
       window_days,
       sample_size,
       avg_repeat_probability
     ) VALUES ($1,$2,$3,$4,$5)`,
    [gradeSection || 'Unknown', violationLabel, windowDays, sampleSize, avgProbability]
  );
}

export async function runAsyncPredictionForViolation({ violationRow, studentRow }) {
  const violationId = violationRow?.id;
  if (!violationId) {
    throw new Error('Invalid violation id for predictive inference');
  }

  const payload = await buildInferencePayload(violationRow, studentRow);
  const result = await requestRepeatProbability(payload);

  await persistViolationPrediction({
    violationId,
    studentId: violationRow.student_id,
    gradeSection: violationRow.grade_section,
    violationLabel: violationRow.description,
    incidentDate: violationRow.incident_date,
    repeatProbability: result.repeatProbability,
    modelVersion: result.modelVersion,
    sourceService: result.sourceService,
  });

  await upsertSectionSnapshot({
    gradeSection: violationRow.grade_section,
    violationLabel: null,
    windowDays: DEFAULT_WINDOW_DAYS,
  });

  return result;
}

export async function listSectionLikelihood({ section = null, violation = null, windowDays = DEFAULT_WINDOW_DAYS, limit = 30 }) {
  const { rows: tableCheckRows } = await query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'violation_predictions'
     ) AS exists`
  );
  if (!tableCheckRows[0]?.exists) {
    return [];
  }

  const params = [windowDays];
  let where = `WHERE COALESCE(vp.incident_date, vp.created_at::date) >= CURRENT_DATE - $1::int`;

  if (section && section !== 'All') {
    params.push(section);
    where += ` AND vp.grade_section = $${params.length}`;
  }

  if (violation && violation !== 'All') {
    params.push(violation);
    where += ` AND vp.violation_label = $${params.length}`;
  }

  params.push(limit);

  const { rows } = await query(
    `SELECT
       vp.grade_section,
       AVG(vp.repeat_probability) AS likelihood,
       COUNT(*)::int AS sample_size
     FROM violation_predictions vp
     ${where}
     GROUP BY vp.grade_section
     ORDER BY likelihood DESC, sample_size DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((row) => ({
    section: row.grade_section || 'Unknown',
    likelihood: Number(row.likelihood || 0),
    sample_size: Number(row.sample_size || 0),
  }));
}

export async function listAvailableViolationLabels() {
  const { rows: tableCheckRows } = await query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'violation_predictions'
     ) AS exists`
  );
  if (!tableCheckRows[0]?.exists) {
    return [];
  }

  const { rows } = await query(
    `SELECT DISTINCT violation_label
       FROM violation_predictions
      WHERE violation_label IS NOT NULL AND violation_label <> ''
      ORDER BY violation_label ASC`
  );
  return rows.map((row) => row.violation_label);
}

export async function listAvailableSections() {
  const { rows: tableCheckRows } = await query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'violation_predictions'
     ) AS exists`
  );
  if (!tableCheckRows[0]?.exists) {
    return [];
  }

  const { rows } = await query(
    `SELECT DISTINCT grade_section
       FROM violation_predictions
      WHERE grade_section IS NOT NULL AND grade_section <> ''
      ORDER BY grade_section ASC`
  );
  return rows.map((row) => row.grade_section);
}

export async function backfillViolationPredictions({ limit = 200 } = {}) {
  const boundedLimit = Number.isFinite(limit) ? Math.min(Math.max(1, limit), 2000) : 200;

  const { rows } = await query(
    `SELECT
       v.id,
       v.student_id,
       v.grade_section,
       v.description,
       v.sanction,
       v.status,
       v.evidence,
       v.incident_date,
       v.created_at,
       s.active,
       s.grade,
       s.section
     FROM violations v
     INNER JOIN students s ON s.id = v.student_id
     LEFT JOIN violation_predictions vp ON vp.violation_id = v.id
     WHERE vp.violation_id IS NULL
     ORDER BY v.incident_date DESC NULLS LAST, v.created_at DESC
     LIMIT $1`,
    [boundedLimit]
  );

  const summary = {
    scanned: rows.length,
    inserted: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    const normalizedGradeSection = row.grade_section || (row.grade && row.section ? `${row.grade}-${row.section}` : 'Unknown');

    try {
      await runAsyncPredictionForViolation({
        violationRow: {
          ...row,
          grade_section: normalizedGradeSection,
        },
        studentRow: {
          active: row.active,
        },
      });
      summary.inserted += 1;
    } catch (error) {
      summary.failed += 1;
      if (summary.errors.length < 20) {
        summary.errors.push({
          violation_id: row.id,
          message: error.message,
        });
      }
    }
  }

  return summary;
}
