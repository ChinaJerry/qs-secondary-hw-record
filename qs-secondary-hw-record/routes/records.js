const express = require("express");
const { buildStudentWhere, query, recordFromRow } = require("../db");
const { requireAdmin, setFlash } = require("./middleware");
const { SUBJECTS } = require("../config/constants");

const router = express.Router();

function buildStudentFilters(queryParams) {
  const filters = { active: true };
  ["level", "term", "courseDay", "classGroup"].forEach((field) => {
    if (queryParams[field]) {
      filters[field] = queryParams[field];
    }
  });

  if (queryParams.year) {
    filters.year = Number(queryParams.year);
  }

  if (queryParams.studentId) {
    filters.studentId = queryParams.studentId.trim();
  }

  return filters;
}

async function ensureWeekRecords(studentIds, week, subjectFilter) {
  const subjects = subjectFilter ? [subjectFilter] : SUBJECTS;

  for (const studentId of studentIds) {
    for (const subject of subjects) {
      await query(
        `
          INSERT INTO homework_records (
            student_id, week, subject, status, note, overall_quality, attention
          )
          VALUES ($1, $2, $3, 'E', '', '', 'No')
          ON CONFLICT (student_id, week, subject) DO NOTHING
        `,
        [studentId, week, subject]
      );
    }
  }
}

router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const studentFilters = buildStudentFilters(req.query);
    const studentWhere = buildStudentWhere(studentFilters, 1, "s");
    const studentsResult = await query(
      `SELECT s.id FROM students s WHERE ${studentWhere.clause}`,
      studentWhere.values
    );
    const studentIds = studentsResult.rows.map((student) => student.id);
    const week = req.query.week ? Number(req.query.week) : null;

    if (!week) {
      return res.render("records", {
        title: "Homework Records",
        query: req.query,
        records: [],
        weekRequired: true
      });
    }

    await ensureWeekRecords(studentIds, week, req.query.subject);

    const recordClauses = ["r.is_deleted = FALSE", "r.student_id = ANY($1::bigint[])", "r.week = $2"];
    const values = [studentIds, week];
    let index = 3;

    if (req.query.subject) {
      recordClauses.push(`r.subject = $${index}`);
      values.push(req.query.subject);
      index += 1;
    }
    if (req.query.status) {
      recordClauses.push(`r.status = $${index}`);
      values.push(req.query.status);
    }

    const recordsResult = await query(
      `
        SELECT
          r.id AS record_id, r.week, r.subject, r.status, r.note,
          r.overall_quality, r.attention,
          s.id AS student_pk, s.student_name, s.student_code, s.student_email,
          s.phone, s.level, s.year, s.term, s.course_day, s.class_group,
          s.active, s.follow_up_contacted, s.follow_up_contacted_at
        FROM homework_records r
        JOIN students s ON s.id = r.student_id
        WHERE ${recordClauses.join(" AND ")}
        ORDER BY s.level, s.student_name, r.week, r.subject
        LIMIT 500
      `,
      values
    );

    return res.render("records", {
      title: "Homework Records",
      query: req.query,
      records: recordsResult.rows.map(recordFromRow),
      weekRequired: false
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/update", requireAdmin, async (req, res, next) => {
  try {
    const statuses = req.body.status || {};
    const notes = req.body.note || {};
    const overallQualities = req.body.overallQuality || {};
    const attentionValues = req.body.attention || {};
    const recordIds = Object.keys(statuses);

    for (const recordId of recordIds) {
      await query(
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
          statuses[recordId],
          notes[recordId] || "",
          overallQualities[recordId] || "",
          attentionValues[recordId] === "Yes" ? "Yes" : "No",
          recordId
        ]
      );
    }

    setFlash(req, "success", `${recordIds.length} homework records saved.`);
    return res.redirect(`/records?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    await query(
      `
        UPDATE homework_records
        SET is_deleted = TRUE,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND is_deleted = FALSE
      `,
      [req.params.id]
    );

    setFlash(req, "success", "Homework record deleted.");
    return res.redirect(`/records?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

router.post("/students/:id/archive", requireAdmin, async (req, res, next) => {
  try {
    await query("UPDATE students SET active = FALSE, updated_at = NOW() WHERE id = $1", [req.params.id]);
    setFlash(req, "success", "Student archived.");
    return res.redirect("/records");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
