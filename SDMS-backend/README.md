# SDMS Backend

## Requirements
- Node 18+
- Postgres (Neon)

## Environment Variables (.env)
DATABASE_URL=postgres://user:pass@host/db
PORT=3000
ALLOWED_ORIGINS=https://your-frontend.vercel.app

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

Passwords are stored hashed with bcrypt.
