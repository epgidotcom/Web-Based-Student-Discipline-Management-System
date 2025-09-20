# SDMS Backend (Express + Neon + Render)

This is the backend API for the Web-Based Student Discipline Management System.

## Local Development

1) Copy env vars:
```bash
cp SDMS-backend/.env.example SDMS-backend/.env
```
- Set `DATABASE_URL` to your Neon connection string (must include `sslmode=require`).
- `ALLOWED_ORIGINS` includes `https://mpnag.vercel.app` plus localhost entries; adjust as needed.

2) Install and migrate:
```bash
cd SDMS-backend
npm ci
npm run migrate
npm run dev
```

3) Test:
- Health: http://localhost:3000/health
- Students: GET http://localhost:3000/api/students

## Database (Neon)
- Use pooled or direct connection string ending with `?sslmode=require`.
- Run `npm run migrate` to create the `students` table.

## Deploy to Render

Option A — Blueprint (render.yaml)
- Push this repo to GitHub (with `render.yaml` at repo root).
- In Render: New → Blueprint → pick this repo.
- Create a secret named `NEON_DATABASE_URL` with your Neon connection string.
- Deploy.

Option B — Manual Web Service
- New → Web Service → connect the repo.
- Root Directory: `SDMS-backend`
- Build Command: `npm ci`
- Start Command: `npm start`
- Add Environment Variables:
  - `DATABASE_URL` = `<your Neon connection string with ?sslmode=require>`
  - `ALLOWED_ORIGINS` = `https://mpnag.vercel.app`

## Frontend (Vercel) Integration

Two choices:
1) Rewrites (no CORS hassle): put a `vercel.json` in your frontend project root to proxy `/api/*` → your Render URL.
2) Direct calls + CORS: call `https://<your-render-host>/api/*` and ensure `ALLOWED_ORIGINS` includes your Vercel domain.

## Extending
- Add routes under `src/routes/`.
- Update `db/schema.sql` and run `npm run migrate` to evolve the schema.
- Always use parameterized queries to avoid SQL injection.