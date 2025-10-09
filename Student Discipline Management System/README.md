# SDMS Frontend

Static HTML/CSS/JS client for the Student Discipline Management System. Pages are organized under `Student Discipline Management System/` for staff/admin views and under `Student Discipline Management System/student/` for learner-facing screens. All dynamic data flows through the Express API in the `SDMS-backend` folder.

## Highlights

- **Dashboard & reports** – aggregate violation metrics, student directory, appeals list.
- **Internal messaging** – `SMS.html` hosts the new staff inbox for sending in-app messages to students. It uses `/api/accounts/students` and `/api/messages/*` endpoints.
- **Student portal** – learners can review violations, submit appeals, and now reply to guidance messages via `student/messages.html`.

## Local preview

The frontend is static and can be served with any HTTP server. While developing against the backend:

```powershell
# from the project root
npm install -g live-server
live-server "Student Discipline Management System"
```

Point `SDMS-backend` at the same origin via `ALLOWED_ORIGINS` or use the built-in `config.js` override to target your backend URL.

## Configuration

`js/config.js` detects the current origin and resolves an `API_BASE`. You can override it manually using the developer console:

```javascript
window.SDMS.setApiBase('https://your-api.example.com');
```

The value is cached in `localStorage` so subsequent reloads keep the same backend.

## Messaging UI quick tour

- `SMS.html` + `css/SMS.css` – admin interface for selecting a student, reviewing conversation history, and composing messages.
- `js/SMS.js` – fetches student rosters, loads threads, and posts messages via the secure endpoints.
- `student/messages.html` + `student/js/messages.js` – student inbox that reads messages, acknowledges them (marks as read), and sends replies.

## Deploying

Host the static build (e.g., Vercel, Netlify, Azure Static Web Apps) and deploy the backend separately. Ensure:

- The environment has the correct `SDMS_CONFIG.API_BASE` (see `config.js`).
- The backend allows the frontend origin via CORS.
- Database migrations are executed (`npm run migrate` in `SDMS-backend`).

## Troubleshooting

- If the sidebar toggle does not work, confirm `js/sidebar.js` and `js/main.js` are loaded.
- Missing data usually indicates an incorrect `API_BASE` or blocked CORS request—check the browser console.
- For internal messaging specifically, make sure the user is authenticated, has the right role, and that the backend migration creating `student_messages` has run.
