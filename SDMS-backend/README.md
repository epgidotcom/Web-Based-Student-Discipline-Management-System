# SDMS Backend

Backend for **Student Discipline Management System**.

### 🚀 Deploying to Render
1. Push this folder to GitHub (`SDMS-backend` repo).
2. Go to [Render](https://render.com/) → New Web Service.
3. Connect your GitHub repo.
4. Root directory: `SDMS-backend`
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Add Environment Variable:
   - `DATABASE_URL` = your Neon Postgres connection string
   - `PORT` = 5000

### 🔗 Connecting
- Vercel frontend will call your backend via:
  ```
  https://your-render-service.onrender.com
  ```

Test route: `/`
Database check: `/test-db`
