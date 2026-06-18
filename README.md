# DevSecOps Operations Dashboard

Small full-stack example for a DevSecOps operations dashboard.

## Structure

```text
frontend/
  index.html
  style.css
  script.js
backend/
  package.json
  server.js
database/
  schema.sql
```

## Features

- Login role selector for Admin, Manager, and Staff
- Sign up with username, password, and role
- Dashboard cards for total, completed, and pending tasks
- Records table with team name, task name, status, and created date
- Add record form to insert a new operational record
- MySQL table named `operational_records`

## Run locally

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Start the server:

```bash
npm start
```

3. Open `http://localhost:3000`.

If MySQL environment variables are not set, the app runs with demo data so the UI works immediately.

## MySQL setup

Set these environment variables before starting the backend:

- `MYSQL_HOST`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`

Then run the SQL in `database/schema.sql`.

## API

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /records`
- `POST /records`
- `PUT /records/:id/status`
