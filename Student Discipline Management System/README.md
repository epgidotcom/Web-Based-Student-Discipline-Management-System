# SDMS – Frontend + Minimal Backend

This project includes a static frontend and a minimal Node.js/Express backend so you can run it locally or deploy it as a live website.

APIs provided by the backend:
- GET/POST `/api/past-offenses` – used by `violation_list.html`
- POST `/api/sms/sanctions/send` – used by `SMS.html`

Data is persisted to a small `data.json` file on disk (demo storage only).

## Run locally (Windows PowerShell)

1) Install Node.js 18+.
2) Install dependencies:

```powershell
npm install
```

3) Start the server:

```powershell
npm start
```

Open http://localhost:3000 in your browser.

Notes:
- `js/violation_list.js` has `USE_API = true` so it calls the backend.
- `js/SMS.js` posts to `/api/sms/sanctions/send`.

## Deploy options

- Render / Railway / Fly.io: push this folder as a repo, set start command `node server.js`.
- Azure App Service or AWS Elastic Beanstalk: deploy as a Node.js app; `server.js` listens on `PORT`.
- Docker: Use Node 18 base image, copy the project, `npm ci`, then `node server.js`.

## API quick reference

- GET `/api/past-offenses?name=<student>` → `string[]`
- POST `/api/past-offenses` body `{ name: string, label: string, date?: string }` → `string[]`
- POST `/api/sms/sanctions/send` body `{ phone: string, message: string, ... }` → `{ ok: true, accepted: true, id: number }`

## Troubleshooting

- If port 3000 is in use, set `PORT=4000` before start.
- Data is stored in `data.json` next to `server.js`.
- For production, integrate a real SMS provider (e.g., Twilio) and a database.
