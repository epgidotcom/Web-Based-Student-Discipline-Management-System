# SDMS Backend

## Requirements
- Node 18+
- Postgres (Neon)

## Environment Variables (.env)
DATABASE_URL=postgres://user:pass@host/db
PORT=3000
ALLOWED_ORIGINS=https://your-frontend.vercel.app
JWT_SECRET=replace-with-strong-random-secret
PREDICTIVE_SERVICE_URL=http://localhost:8000
PREDICTIVE_TIMEOUT_MS=5000
PREDICTIVE_MAX_RETRIES=1
ENABLE_PREDICTIVE_BACKFILL=false
AUTO_MIGRATE=true
FAIL_ON_MIGRATION_ERROR=true

## Install
```
npm install
```

## Migrate
```
npm run migrate
```

## Run Dev
```
npm run dev
```

## Run Prod
```
npm start
```

## API Routes
- GET  /api/health
- GET  /api/accounts
- POST /api/accounts
- DELETE /api/accounts/:id
- GET  /api/past-offenses?name=Student Name
- POST /api/past-offenses { name, label }
- POST /api/sms/sanctions/send { phone, message }
- GET  /api/analytics/predictive-repeat-risk
- POST /api/analytics/predictive-repeat-risk/backfill (Admin/Teacher + ENABLE_PREDICTIVE_BACKFILL=true)

Passwords are stored hashed with bcrypt.
