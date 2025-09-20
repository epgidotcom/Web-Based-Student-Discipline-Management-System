import fs from "fs";
import path from "path";
import url from "url";
import { query } from "./db.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function run() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.error("Schema file not found at", schemaPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(schemaPath, "utf8");
  try {
    await query(sql);
    console.log("Migration completed successfully");
    process.exit(0);
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  }
}

run();