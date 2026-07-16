# Qs Secondary HW Record

A local Node.js and Bootstrap homework checking system for Qs secondary classes.

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
2. The app stores data locally in `data/local-db.json`.
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

Open `http://127.0.0.1:3001`.
