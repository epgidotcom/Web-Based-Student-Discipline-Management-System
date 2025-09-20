import { Router } from "express";
import { query } from "../db.js";

const router = Router();

// List students
router.get("/", async (_req, res) => {
  try {
    const { rows } = await query(
      "select id, first_name, last_name, grade, section, created_at from students order by last_name asc"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one student
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await query(
      "select id, first_name, last_name, grade, section, created_at from students where id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create student
router.post("/", async (req, res) => {
  const { first_name, last_name, grade, section } = req.body ?? {};
  if (!first_name || !last_name) {
    return res.status(400).json({ error: "first_name and last_name are required" });
  }
  try {
    const { rows } = await query(
      "insert into students (first_name, last_name, grade, section) values ($1,$2,$3,$4) returning *",
      [first_name, last_name, grade ?? null, section ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update student
router.put("/:id", async (req, res) => {
  const { first_name, last_name, grade, section } = req.body ?? {};
  try {
    const { rows } = await query(
      `update students
         set first_name = coalesce($1, first_name),
             last_name  = coalesce($2, last_name),
             grade      = coalesce($3, grade),
             section    = coalesce($4, section)
       where id = $5
       returning *`,
      [first_name ?? null, last_name ?? null, grade ?? null, section ?? null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete student
router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await query("delete from students where id = $1", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;