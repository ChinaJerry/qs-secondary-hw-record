const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "local-db.json");

let db;
let pool;
let initPromise;

function usePostgres() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    pool = new Pool({ connectionString });
  }
  return pool;
}

async function pgQuery(text, params = []) {
  return getPool().query(text, params);
}

function emptyDb() {
  return {
    nextStudentId: 1,
    nextRecordId: 1,
    nextBackupId: 1,
    students: [],
    homeworkRecords: [],
    backupSnapshots: []
  };
}

function loadDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(dataFile)) {
    db = emptyDb();
    saveDb();
    return db;
  }

  db = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  db.nextStudentId ||= 1;
  db.nextRecordId ||= 1;
  db.nextBackupId ||= 1;
  db.students ||= [];
  db.homeworkRecords ||= [];
  db.backupSnapshots ||= [];
  return db;
}

function saveDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
}

async function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      if (usePostgres()) {
        await initPostgres();
        return;
      }
      loadDb();
    })();
  }

  return initPromise;
}

function nowIso() {
  return new Date().toISOString();
}

function sameCohort(student, cohort) {
  return (
    student.level === cohort.level &&
    Number(student.year) === Number(cohort.year) &&
    student.term === cohort.term &&
    student.courseDay === cohort.courseDay &&
    student.classGroup === cohort.classGroup
  );
}

function matchesStudentFilters(student, filters = {}) {
  return Object.entries(filters).every(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return true;
    }
    if (key === "year") {
      return Number(student.year) === Number(value);
    }
    if (key === "active") {
      return Boolean(student.active) === Boolean(value);
    }
    if (key === "studentId") {
      return student.studentId === value;
    }
    return student[key] === value;
  });
}

function localImportClassList(cohort, studentRows) {
  const store = loadDb();
  const uploadedIds = new Set(studentRows.map((row) => row.studentId));
  const removedIds = [];

  store.students = store.students.filter((student) => {
    const shouldRemove = sameCohort(student, cohort) && !uploadedIds.has(student.studentId);
    if (shouldRemove) {
      removedIds.push(student._id);
    }
    return !shouldRemove;
  });

  if (removedIds.length) {
    const removedSet = new Set(removedIds);
    store.homeworkRecords = store.homeworkRecords.filter((record) => !removedSet.has(record.studentId));
  }

  for (const row of studentRows) {
    const existing = store.students.find(
      (student) => sameCohort(student, cohort) && student.studentId === row.studentId
    );

    if (existing) {
      existing.studentName = row.studentName;
      existing.studentEmail = row.studentEmail;
      existing.phone = row.phone;
      existing.active = true;
      existing.updatedAt = nowIso();
    } else {
      store.students.push({
        _id: String(store.nextStudentId++),
        studentName: row.studentName,
        studentId: row.studentId,
        studentEmail: row.studentEmail,
        phone: row.phone,
        level: cohort.level,
        year: Number(cohort.year),
        term: cohort.term,
        courseDay: cohort.courseDay,
        classGroup: cohort.classGroup,
        active: true,
        followUpContacted: false,
        followUpContactedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }
  }

  saveDb();
  return { imported: studentRows.length, removed: removedIds.length };
}

function localAddOrUpdateStudent(cohort, studentRow) {
  const store = loadDb();
  const existing = store.students.find(
    (student) => sameCohort(student, cohort) && student.studentId === studentRow.studentId
  );

  if (existing) {
    existing.studentName = studentRow.studentName;
    existing.studentEmail = studentRow.studentEmail;
    existing.phone = studentRow.phone;
    existing.active = true;
    existing.updatedAt = nowIso();
    saveDb();
    return { student: existing, created: false };
  }

  const student = {
    _id: String(store.nextStudentId++),
    studentName: studentRow.studentName,
    studentId: studentRow.studentId,
    studentEmail: studentRow.studentEmail,
    phone: studentRow.phone,
    level: cohort.level,
    year: Number(cohort.year),
    term: cohort.term,
    courseDay: cohort.courseDay,
    classGroup: cohort.classGroup,
    active: true,
    followUpContacted: false,
    followUpContactedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  store.students.push(student);
  saveDb();
  return { student, created: true };
}

function localGetStudents(filters = {}) {
  return loadDb().students.filter((student) => matchesStudentFilters(student, filters));
}

function countStudents(filters = {}) {
  return localGetStudents(filters).length;
}

function localEnsureWeekRecords(studentIds, week, subjects) {
  const store = loadDb();
  const existingKeys = new Set(
    store.homeworkRecords.map((record) => `${record.studentId}:${record.week}:${record.subject}`)
  );

  for (const studentId of studentIds) {
    for (const subject of subjects) {
      const key = `${studentId}:${week}:${subject}`;
      if (!existingKeys.has(key)) {
        store.homeworkRecords.push({
          _id: String(store.nextRecordId++),
          studentId: String(studentId),
          week: Number(week),
          subject,
          status: "E",
          note: "",
          overallQuality: "",
          attention: "No",
          isDeleted: false,
          deletedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
        existingKeys.add(key);
      }
    }
  }

  saveDb();
}

function attachStudent(record) {
  const student = loadDb().students.find((item) => item._id === String(record.studentId));
  return {
    ...record,
    student
  };
}

function getRecords({ studentFilters = {}, week, subject, status, limit = 500 } = {}) {
  const students = localGetStudents(studentFilters);
  const studentIds = new Set(students.map((student) => student._id));

  return loadDb()
    .homeworkRecords.filter((record) => {
      if (record.isDeleted) return false;
      if (!studentIds.has(String(record.studentId))) return false;
      if (week && Number(record.week) !== Number(week)) return false;
      if (subject && record.subject !== subject) return false;
      if (status && record.status !== status) return false;
      return true;
    })
    .map(attachStudent)
    .filter((record) => record.student)
    .sort((a, b) =>
      `${a.student.level}-${a.student.studentName}-${a.week}-${a.subject}`.localeCompare(
        `${b.student.level}-${b.student.studentName}-${b.week}-${b.subject}`
      )
    )
    .slice(0, limit);
}

function localUpdateRecords(updates) {
  const store = loadDb();
  for (const update of updates) {
    const record = store.homeworkRecords.find(
      (item) => item._id === String(update.id) && !item.isDeleted
    );
    if (record) {
      record.status = update.status;
      record.note = update.note || "";
      record.overallQuality = update.overallQuality || "";
      record.attention = update.attention === "Yes" ? "Yes" : "No";
      record.updatedAt = nowIso();
    }
  }
  saveDb();
}

function localDeleteRecord(id) {
  const record = loadDb().homeworkRecords.find((item) => item._id === String(id) && !item.isDeleted);
  if (record) {
    record.isDeleted = true;
    record.deletedAt = nowIso();
    record.updatedAt = nowIso();
    saveDb();
  }
}

function localArchiveStudent(id) {
  const student = loadDb().students.find((item) => item._id === String(id));
  if (student) {
    student.active = false;
    student.updatedAt = nowIso();
    saveDb();
  }
}

function statusSummary(studentFilters, week, subject) {
  const summary = new Map();
  for (const record of getRecords({ studentFilters, week, subject, limit: Number.MAX_SAFE_INTEGER })) {
    summary.set(record.status, (summary.get(record.status) || 0) + 1);
  }
  return [...summary.entries()].map(([code, count]) => ({ code, count }));
}

function subjectSummary(studentFilters, week, subject, incompleteCodes) {
  const summary = new Map();
  for (const record of getRecords({ studentFilters, week, subject, limit: Number.MAX_SAFE_INTEGER })) {
    const item = summary.get(record.subject) || { _id: record.subject, total: 0, incomplete: 0 };
    item.total += 1;
    if (incompleteCodes.includes(record.status)) {
      item.incomplete += 1;
    }
    summary.set(record.subject, item);
  }
  return [...summary.values()].sort((a, b) => a._id.localeCompare(b._id));
}

function followUpRecords(studentFilters, subject, incompleteCodes) {
  const records = getRecords({
    studentFilters,
    subject,
    limit: Number.MAX_SAFE_INTEGER
  }).filter((record) => incompleteCodes.includes(record.status));
  const grouped = new Map();

  for (const record of records) {
    const item = grouped.get(record.student._id) || {
      _id: record.student._id,
      student: record.student,
      deRecords: 0,
      deWeeks: new Set(),
      latestWeek: 0
    };
    item.deRecords += 1;
    item.deWeeks.add(Number(record.week));
    item.latestWeek = Math.max(item.latestWeek, Number(record.week));
    grouped.set(record.student._id, item);
  }

  return [...grouped.values()]
    .map((item) => ({ ...item, deWeeks: [...item.deWeeks].sort((a, b) => a - b) }))
    .filter((item) => item.deWeeks.length >= 3)
    .sort((a, b) => b.deWeeks.length - a.deWeeks.length || b.deRecords - a.deRecords);
}

function studentHistory(studentId) {
  if (!studentId) {
    return [];
  }
  return loadDb()
    .homeworkRecords.filter((record) => !record.isDeleted)
    .map(attachStudent)
    .filter((record) => record.student && record.student.studentId === studentId)
    .sort((a, b) => Number(a.week) - Number(b.week) || a.subject.localeCompare(b.subject));
}

function localExportBackupData() {
  const store = loadDb();
  const studentMap = new Map(store.students.map((student) => [String(student._id), student]));
  return {
    students: [...store.students].sort((a, b) =>
      `${a.level}-${a.year}-${a.term}-${a.courseDay}-${a.classGroup}-${a.studentName}`.localeCompare(
        `${b.level}-${b.year}-${b.term}-${b.courseDay}-${b.classGroup}-${b.studentName}`
      )
    ),
    homeworkRecords: [...store.homeworkRecords]
      .map((record) => ({
        ...record,
        student: studentMap.get(String(record.studentId)) || null
      }))
      .sort((a, b) =>
        `${a.student?.level || ""}-${a.student?.studentName || ""}-${a.week}-${a.subject}`.localeCompare(
          `${b.student?.level || ""}-${b.student?.studentName || ""}-${b.week}-${b.subject}`
        )
      )
  };
}

function localCreateBackupSnapshot(createdBy = "Admin") {
  const store = loadDb();
  const snapshotData = localExportBackupData();
  const backup = {
    _id: String(store.nextBackupId++),
    createdAt: nowIso(),
    createdBy,
    studentCount: snapshotData.students.length,
    homeworkRecordCount: snapshotData.homeworkRecords.length,
    snapshotData
  };

  store.backupSnapshots.push(backup);
  saveDb();
  return backup;
}

function localListBackupSnapshots(limit = 5) {
  return loadDb()
    .backupSnapshots
    .map(({ snapshotData, ...backup }) => backup)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

function localMarkFollowUpContacted(studentIds) {
  const set = new Set(studentIds.map(String));
  for (const student of loadDb().students) {
    if (set.has(student._id)) {
      student.followUpContacted = true;
      student.followUpContactedAt = nowIso();
      student.updatedAt = nowIso();
    }
  }
  saveDb();
}

function studentFromRow(row) {
  if (!row) return null;
  return {
    _id: String(row.id),
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
    _id: String(row.record_id),
    week: row.week,
    subject: row.subject,
    status: row.status,
    note: row.note || "",
    overallQuality: row.overall_quality || "",
    attention: row.attention || "No",
    student: studentFromRow(row)
  };
}

async function initPostgres() {
  await pgQuery(`
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

  await pgQuery(`
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

  await pgQuery(`
    CREATE TABLE IF NOT EXISTS backup_snapshots (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      created_by TEXT DEFAULT 'Admin',
      student_count INTEGER NOT NULL DEFAULT 0,
      homework_record_count INTEGER NOT NULL DEFAULT 0,
      snapshot_data JSONB NOT NULL
    );
  `);
}

function buildStudentConditions(filters = {}, startIndex = 1, alias = "s") {
  const clauses = [];
  const values = [];
  let index = startIndex;
  const map = {
    active: "active",
    level: "level",
    year: "year",
    term: "term",
    courseDay: "course_day",
    classGroup: "class_group",
    studentId: "student_code"
  };

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    clauses.push(`${alias}.${map[key]} = $${index}`);
    values.push(value);
    index += 1;
  }

  return { clause: clauses.length ? clauses.join(" AND ") : "TRUE", values, nextIndex: index };
}

async function pgImportClassList(cohort, studentRows) {
  const uploadedIds = studentRows.map((row) => row.studentId);
  const removed = await pgQuery(
    `
      DELETE FROM students
      WHERE level = $1
        AND year = $2
        AND term = $3
        AND course_day = $4
        AND class_group = $5
        AND NOT (student_code = ANY($6::text[]))
    `,
    [cohort.level, Number(cohort.year), cohort.term, cohort.courseDay, cohort.classGroup, uploadedIds]
  );

  for (const row of studentRows) {
    await pgQuery(
      `
        INSERT INTO students (
          student_name, student_code, student_email, phone,
          level, year, term, course_day, class_group, active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW())
        ON CONFLICT (student_code, level, year, term, course_day, class_group)
        DO UPDATE SET
          student_name = EXCLUDED.student_name,
          student_email = EXCLUDED.student_email,
          phone = EXCLUDED.phone,
          active = TRUE,
          updated_at = NOW()
      `,
      [
        row.studentName,
        row.studentId,
        row.studentEmail,
        row.phone,
        cohort.level,
        Number(cohort.year),
        cohort.term,
        cohort.courseDay,
        cohort.classGroup
      ]
    );
  }

  return { imported: studentRows.length, removed: removed.rowCount };
}

async function pgAddOrUpdateStudent(cohort, studentRow) {
  const existing = await pgQuery(
    `
      SELECT id FROM students
      WHERE student_code = $1
        AND level = $2
        AND year = $3
        AND term = $4
        AND course_day = $5
        AND class_group = $6
    `,
    [
      studentRow.studentId,
      cohort.level,
      Number(cohort.year),
      cohort.term,
      cohort.courseDay,
      cohort.classGroup
    ]
  );

  await pgQuery(
    `
      INSERT INTO students (
        student_name, student_code, student_email, phone,
        level, year, term, course_day, class_group, active, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW())
      ON CONFLICT (student_code, level, year, term, course_day, class_group)
      DO UPDATE SET
        student_name = EXCLUDED.student_name,
        student_email = EXCLUDED.student_email,
        phone = EXCLUDED.phone,
        active = TRUE,
        updated_at = NOW()
    `,
    [
      studentRow.studentName,
      studentRow.studentId,
      studentRow.studentEmail,
      studentRow.phone,
      cohort.level,
      Number(cohort.year),
      cohort.term,
      cohort.courseDay,
      cohort.classGroup
    ]
  );

  return { created: existing.rowCount === 0 };
}

async function pgGetStudents(filters = {}) {
  const where = buildStudentConditions(filters, 1, "s");
  const result = await pgQuery(`SELECT * FROM students s WHERE ${where.clause}`, where.values);
  return result.rows.map(studentFromRow);
}

async function pgCountStudents(filters = {}) {
  const where = buildStudentConditions(filters, 1, "s");
  const result = await pgQuery(`SELECT COUNT(*)::int AS count FROM students s WHERE ${where.clause}`, where.values);
  return result.rows[0].count;
}

async function pgEnsureWeekRecords(studentIds, week, subjects) {
  for (const studentId of studentIds) {
    for (const subject of subjects) {
      await pgQuery(
        `
          INSERT INTO homework_records (student_id, week, subject, status, note, overall_quality, attention)
          VALUES ($1, $2, $3, 'E', '', '', 'No')
          ON CONFLICT (student_id, week, subject) DO NOTHING
        `,
        [studentId, Number(week), subject]
      );
    }
  }
}

async function pgGetRecords({ studentFilters = {}, week, subject, status, limit = 500 } = {}) {
  const where = buildStudentConditions(studentFilters, 1, "s");
  const clauses = [`${where.clause}`, "r.is_deleted = FALSE"];
  const values = [...where.values];
  let index = where.nextIndex;

  if (week) {
    clauses.push(`r.week = $${index}`);
    values.push(Number(week));
    index += 1;
  }
  if (subject) {
    clauses.push(`r.subject = $${index}`);
    values.push(subject);
    index += 1;
  }
  if (status) {
    clauses.push(`r.status = $${index}`);
    values.push(status);
    index += 1;
  }
  values.push(limit);

  const result = await pgQuery(
    `
      SELECT
        r.id AS record_id, r.week, r.subject, r.status, r.note,
        r.overall_quality, r.attention,
        s.*
      FROM homework_records r
      JOIN students s ON s.id = r.student_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY s.level, s.student_name, r.week, r.subject
      LIMIT $${index}
    `,
    values
  );
  return result.rows.map(recordFromRow);
}

async function pgUpdateRecords(updates) {
  for (const update of updates) {
    await pgQuery(
      `
        UPDATE homework_records
        SET status = $1,
            note = $2,
            overall_quality = $3,
            attention = $4,
            updated_at = NOW()
        WHERE id = $5 AND is_deleted = FALSE
      `,
      [
        update.status,
        update.note || "",
        update.overallQuality || "",
        update.attention === "Yes" ? "Yes" : "No",
        update.id
      ]
    );
  }
}

async function pgDeleteRecord(id) {
  await pgQuery(
    "UPDATE homework_records SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
    [id]
  );
}

async function pgArchiveStudent(id) {
  await pgQuery("UPDATE students SET active = FALSE, updated_at = NOW() WHERE id = $1", [id]);
}

async function pgExportBackupData() {
  const students = await pgQuery(`
    SELECT *
    FROM students
    ORDER BY level, year, term, course_day, class_group, student_name
  `);
  const homeworkRecords = await pgQuery(`
    SELECT
      r.id AS record_id,
      r.student_id AS record_student_id,
      r.week,
      r.subject,
      r.status,
      r.note,
      r.overall_quality,
      r.attention,
      r.is_deleted,
      r.deleted_at,
      r.created_at AS record_created_at,
      r.updated_at AS record_updated_at,
      s.*
    FROM homework_records r
    LEFT JOIN students s ON s.id = r.student_id
    ORDER BY s.level, s.student_name, r.week, r.subject
  `);
  return {
    students: students.rows.map(studentFromRow),
    homeworkRecords: homeworkRecords.rows.map((row) => ({
      _id: String(row.record_id),
      studentId: String(row.record_student_id),
      week: row.week,
      subject: row.subject,
      status: row.status,
      note: row.note || "",
      overallQuality: row.overall_quality || "",
      attention: row.attention || "No",
      isDeleted: Boolean(row.is_deleted),
      deletedAt: row.deleted_at,
      createdAt: row.record_created_at,
      updatedAt: row.record_updated_at,
      student: row.id ? studentFromRow(row) : null
    }))
  };
}

async function pgCreateBackupSnapshot(createdBy = "Admin") {
  const snapshotData = await pgExportBackupData();
  const result = await pgQuery(
    `
      INSERT INTO backup_snapshots (
        created_by, student_count, homework_record_count, snapshot_data
      )
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING *
    `,
    [
      createdBy,
      snapshotData.students.length,
      snapshotData.homeworkRecords.length,
      JSON.stringify(snapshotData)
    ]
  );

  return backupSnapshotFromRow(result.rows[0]);
}

async function pgListBackupSnapshots(limit = 5) {
  const result = await pgQuery(
    `
      SELECT id, created_at, created_by, student_count, homework_record_count
      FROM backup_snapshots
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map(backupSnapshotFromRow);
}

function backupSnapshotFromRow(row) {
  return {
    _id: String(row.id),
    createdAt: row.created_at,
    createdBy: row.created_by || "Admin",
    studentCount: row.student_count || 0,
    homeworkRecordCount: row.homework_record_count || 0
  };
}

async function pgStatusSummary(studentFilters, week, subject) {
  const records = await pgGetRecords({ studentFilters, week, subject, limit: Number.MAX_SAFE_INTEGER });
  const summary = new Map();
  for (const record of records) summary.set(record.status, (summary.get(record.status) || 0) + 1);
  return [...summary.entries()].map(([code, count]) => ({ code, count }));
}

async function pgSubjectSummary(studentFilters, week, subject, incompleteCodes) {
  const records = await pgGetRecords({ studentFilters, week, subject, limit: Number.MAX_SAFE_INTEGER });
  const summary = new Map();
  for (const record of records) {
    const item = summary.get(record.subject) || { _id: record.subject, total: 0, incomplete: 0 };
    item.total += 1;
    if (incompleteCodes.includes(record.status)) item.incomplete += 1;
    summary.set(record.subject, item);
  }
  return [...summary.values()].sort((a, b) => a._id.localeCompare(b._id));
}

async function pgFollowUpRecords(studentFilters, subject, incompleteCodes) {
  const records = (await pgGetRecords({ studentFilters, subject, limit: Number.MAX_SAFE_INTEGER })).filter((record) =>
    incompleteCodes.includes(record.status)
  );
  const grouped = new Map();
  for (const record of records) {
    const item = grouped.get(record.student._id) || {
      _id: record.student._id,
      student: record.student,
      deRecords: 0,
      deWeeks: new Set(),
      latestWeek: 0
    };
    item.deRecords += 1;
    item.deWeeks.add(Number(record.week));
    item.latestWeek = Math.max(item.latestWeek, Number(record.week));
    grouped.set(record.student._id, item);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, deWeeks: [...item.deWeeks].sort((a, b) => a - b) }))
    .filter((item) => item.deWeeks.length >= 3)
    .sort((a, b) => b.deWeeks.length - a.deWeeks.length || b.deRecords - a.deRecords);
}

async function pgStudentHistory(studentId) {
  return pgGetRecords({ studentFilters: { studentId }, limit: Number.MAX_SAFE_INTEGER });
}

async function pgMarkFollowUpContacted(studentIds) {
  await pgQuery(
    "UPDATE students SET follow_up_contacted = TRUE, follow_up_contacted_at = NOW(), updated_at = NOW() WHERE id = ANY($1::bigint[])",
    [studentIds]
  );
}

module.exports = {
  addOrUpdateStudent: (...args) => (usePostgres() ? pgAddOrUpdateStudent(...args) : localAddOrUpdateStudent(...args)),
  archiveStudent: (...args) => (usePostgres() ? pgArchiveStudent(...args) : localArchiveStudent(...args)),
  countStudents: (...args) => (usePostgres() ? pgCountStudents(...args) : countStudents(...args)),
  createBackupSnapshot: (...args) => (usePostgres() ? pgCreateBackupSnapshot(...args) : localCreateBackupSnapshot(...args)),
  deleteRecord: (...args) => (usePostgres() ? pgDeleteRecord(...args) : localDeleteRecord(...args)),
  ensureWeekRecords: (...args) => (usePostgres() ? pgEnsureWeekRecords(...args) : localEnsureWeekRecords(...args)),
  exportBackupData: (...args) => (usePostgres() ? pgExportBackupData(...args) : localExportBackupData(...args)),
  followUpRecords: (...args) => (usePostgres() ? pgFollowUpRecords(...args) : followUpRecords(...args)),
  getRecords: (...args) => (usePostgres() ? pgGetRecords(...args) : getRecords(...args)),
  getStudents: (...args) => (usePostgres() ? pgGetStudents(...args) : localGetStudents(...args)),
  importClassList: (...args) => (usePostgres() ? pgImportClassList(...args) : localImportClassList(...args)),
  initDb,
  listBackupSnapshots: (...args) => (usePostgres() ? pgListBackupSnapshots(...args) : localListBackupSnapshots(...args)),
  markFollowUpContacted: (...args) => (usePostgres() ? pgMarkFollowUpContacted(...args) : localMarkFollowUpContacted(...args)),
  statusSummary: (...args) => (usePostgres() ? pgStatusSummary(...args) : statusSummary(...args)),
  studentHistory: (...args) => (usePostgres() ? pgStudentHistory(...args) : studentHistory(...args)),
  subjectSummary: (...args) => (usePostgres() ? pgSubjectSummary(...args) : subjectSummary(...args)),
  updateRecords: (...args) => (usePostgres() ? pgUpdateRecords(...args) : localUpdateRecords(...args))
};
