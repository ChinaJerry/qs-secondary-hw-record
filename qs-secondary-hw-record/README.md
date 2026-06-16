# Qs Secondary HW Record

A Node.js, MongoDB, and Bootstrap homework checking system for Qs secondary classes.

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
2. Start MongoDB locally or set `MONGODB_URI`.
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

Before deploying, create a hosted MongoDB database such as MongoDB Atlas. The local development MongoDB fallback is not used on Vercel.

Set these Vercel Environment Variables:

```text
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/qs-secondary-hw-record
SESSION_SECRET=use-a-long-random-secret
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=QsAdmin
DISABLE_MEMORY_MONGO=true
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
