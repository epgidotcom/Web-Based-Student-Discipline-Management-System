import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon requires SSL. Render provides proper CA; this is sufficient for Neon.
  ssl: { rejectUnauthorized: false }
});

// Helper for single query
export const query = (text, params) => pool.query(text, params);