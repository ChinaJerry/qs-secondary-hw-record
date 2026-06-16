const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required for PostgreSQL/Neon.");
    }

    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=require") ? undefined : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS students (
      id BIGSERIAL PRIMARY KEY,
      student_name TEXT NOT NULL,
      student_code TEXT NOT NULL,
      student_email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      level TEXT NOT NULL,
      year INTEGER NOT NULL,
      term TEXT NOT NULL,
      course_day TEXT NOT NULL,
      class_group TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      follow_up_contacted BOOLEAN DEFAULT FALSE,
      follow_up_contacted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (student_code, level, year, term, course_day, class_group)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS homework_records (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      week INTEGER NOT NULL CHECK (week >= 1 AND week <= 12),
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'E',
      note TEXT DEFAULT '',
      overall_quality TEXT DEFAULT '',
      attention TEXT DEFAULT 'No',
      is_deleted BOOLEAN DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (student_id, week, subject)
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS homework_records_week_subject_status_idx
    ON homework_records (week, subject, status)
    WHERE is_deleted = FALSE;
  `);
}

function studentFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.student_pk || row.id),
    studentName: row.student_name,
    studentId: row.student_code,
    studentEmail: row.student_email || "",
    phone: row.phone || "",
    level: row.level,
    year: row.year,
    term: row.term,
    courseDay: row.course_day,
    classGroup: row.class_group,
    active: row.active,
    followUpContacted: row.follow_up_contacted,
    followUpContactedAt: row.follow_up_contacted_at
  };
}

function recordFromRow(row) {
  return {
    _id: String(row.record_id || row.id),
    week: row.week,
    subject: row.subject,
    status: row.status,
    note: row.note || "",
    overallQuality: row.overall_quality || "",
    attention: row.attention || "No",
    student: studentFromRow(row)
  };
}

function buildStudentWhere(filters, startIndex = 1, alias = "s") {
  const clauses = [];
  const values = [];
  let index = startIndex;

  Object.entries(filters).forEach(([field, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    const column = {
      active: "active",
      level: "level",
      year: "year",
      term: "term",
      courseDay: "course_day",
      classGroup: "class_group",
      studentId: "student_code"
    }[field];

    if (!column) {
      return;
    }

    clauses.push(`${alias}.${column} = $${index}`);
    values.push(value);
    index += 1;
  });

  return {
    clause: clauses.length ? clauses.join(" AND ") : "TRUE",
    values,
    nextIndex: index
  };
}

module.exports = {
  buildStudentWhere,
  getPool,
  initDb,
  query,
  recordFromRow,
  studentFromRow
};
