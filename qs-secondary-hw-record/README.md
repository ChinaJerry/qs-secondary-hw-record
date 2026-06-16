# Qs Secondary HW Record

A Node.js, PostgreSQL/Neon, and Bootstrap homework checking system for Qs secondary classes.

## Features

- Admin-only login
- Levels: Level 8, Level 9, Level 10, VCE Prep, VCE
- Terms such as `2026 T2`
- Course days: Tuesday, Wednesday, Thursday, Saturday AM, Saturday PM, Sunday AM, Sunday PM
- A/B class groups
- Weekly homework records are created from the Records page after selecting the working week
- Subjects: Math, English & Writing, Science
- Status scores:
  - A: Self mark / complete
  - B: Complete but not mark
  - C: Not complete
  - D: Not touched
  - E: Not submit
- Excel import with `Student Name`, `Student ID`, `Student Email`, `Phone`
- Dashboard filters and 3-week D/E follow-up list with contacted tracking
- Student ID history search

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a PostgreSQL connection string such as Neon.
3. Install dependencies:

```bash
npm install
```

4. Run the system:

```bash
npm start
```

Default login:

- Username: `Admin`
- Password: `QsAdmin`

Open `http://localhost:3000`.

## Deploy to Vercel

This project can run on Vercel as a Node.js Function through `api/index.js`.

Before deploying, create a hosted PostgreSQL database such as Neon.

Set these Vercel Environment Variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require&channel_binding=require
SESSION_SECRET=use-a-long-random-secret
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=use-a-strong-password
```

Then deploy from this folder:

```zsh
cd "/Users/jinlangwu/Documents/New project/qs-secondary-hw-record"
vercel
```

For production:

```zsh
vercel --prod
```

Vercel project settings:

- Framework Preset: `Other`
- Build Command: `npm run vercel-build`
- Output Directory: leave empty
- Install Command: `npm install`
