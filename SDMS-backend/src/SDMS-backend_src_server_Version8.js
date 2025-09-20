import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";
import studentsRouter from "./routes/students.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// CORS: allow comma-separated origins
const allowed = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow same-origin / server-to-server
    if (allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check (and DB check)
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", db: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: e.message });
  }
});

// API routes
app.use("/api/students", studentsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`SDMS backend listening on port ${port}`);
});