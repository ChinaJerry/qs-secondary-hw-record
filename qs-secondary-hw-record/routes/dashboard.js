const express = require("express");
const { buildStudentWhere, query, studentFromRow } = require("../db");
const { requireAdmin, setFlash } = require("./middleware");
const { STATUSES, INCOMPLETE_CODES } = require("../config/constants");

const router = express.Router();

function cleanFilters(queryParams) {
  return Object.fromEntries(
    Object.entries(queryParams).filter(([, value]) => value !== undefined && value !== "")
  );
}

function studentFilterFromQuery(queryParams) {
  const filters = cleanFilters({
    active: true,
    level: queryParams.level,
    year: queryParams.year ? Number(queryParams.year) : "",
    term: queryParams.term,
    courseDay: queryParams.courseDay,
    classGroup: queryParams.classGroup
  });

  if (queryParams.studentId) {
    filters.studentId = queryParams.studentId.trim();
  }

  return filters;
}

function recordWhereFromQuery(queryParams, studentIds, includeWeek = true) {
  const clauses = ["r.is_deleted = FALSE", "r.student_id = ANY($1::bigint[])"];
  const values = [studentIds];
  let index = 2;

  if (includeWeek && queryParams.week) {
    clauses.push(`r.week = $${index}`);
    values.push(Number(queryParams.week));
    index += 1;
  }

  if (queryParams.subject) {
    clauses.push(`r.subject = $${index}`);
    values.push(queryParams.subject);
  }

  return { clause: clauses.join(" AND "), values };
}

router.get("/dashboard", requireAdmin, async (req, res, next) => {
  try {
    const studentFilters = studentFilterFromQuery(req.query);
    const studentWhere = buildStudentWhere(studentFilters, 1, "s");
    const studentsResult = await query(
      `SELECT s.id FROM students s WHERE ${studentWhere.clause}`,
      studentWhere.values
    );
    const studentIds = studentsResult.rows.map((student) => student.id);
    const recordWhere = recordWhereFromQuery(req.query, studentIds, true);
    const followUpWhere = recordWhereFromQuery(req.query, studentIds, false);

    const [statusSummary, subjectSummary, totalStudentsResult, followUpSummary, studentHistory] =
      await Promise.all([
        query(
          `
            SELECT r.status AS code, COUNT(*)::int AS count
            FROM homework_records r
            WHERE ${recordWhere.clause}
            GROUP BY r.status
          `,
          recordWhere.values
        ),
        query(
          `
            SELECT
              r.subject,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE r.status = ANY($${recordWhere.values.length + 1}::text[]))::int AS incomplete
            FROM homework_records r
            WHERE ${recordWhere.clause}
            GROUP BY r.subject
            ORDER BY r.subject
          `,
          [...recordWhere.values, INCOMPLETE_CODES]
        ),
        query(`SELECT COUNT(*)::int AS count FROM students s WHERE ${studentWhere.clause}`, studentWhere.values),
        query(
          `
            SELECT
              r.student_id,
              COUNT(*)::int AS de_records,
              ARRAY_AGG(DISTINCT r.week ORDER BY r.week) AS de_weeks,
              MAX(r.week) AS latest_week,
              COUNT(DISTINCT r.week)::int AS de_week_count
            FROM homework_records r
            WHERE ${followUpWhere.clause}
              AND r.status = ANY($${followUpWhere.values.length + 1}::text[])
            GROUP BY r.student_id
            HAVING COUNT(DISTINCT r.week) >= 3
            ORDER BY de_week_count DESC, de_records DESC, latest_week DESC
            LIMIT 300
          `,
          [...followUpWhere.values, INCOMPLETE_CODES]
        ),
        req.query.studentId
          ? query(
              `
                SELECT
                  r.id AS record_id, r.week, r.subject, r.status, r.note,
                  r.overall_quality, r.attention,
                  s.id AS student_pk, s.student_name, s.student_code, s.student_email,
                  s.phone, s.level, s.year, s.term, s.course_day, s.class_group,
                  s.active, s.follow_up_contacted, s.follow_up_contacted_at
                FROM homework_records r
                JOIN students s ON s.id = r.student_id
                WHERE r.is_deleted = FALSE
                  AND s.student_code = $1
                ORDER BY s.year, s.term, r.week, r.subject
              `,
              [req.query.studentId.trim()]
            )
          : { rows: [] }
      ]);

    const followUpStudentIds = followUpSummary.rows.map((item) => item.student_id);
    const followUpStudentsResult = followUpStudentIds.length
      ? await query(
          `
            SELECT
              s.id, s.student_name, s.student_code, s.student_email, s.phone,
              s.level, s.year, s.term, s.course_day, s.class_group, s.active,
              s.follow_up_contacted, s.follow_up_contacted_at
            FROM students s
            WHERE s.id = ANY($1::bigint[])
          `,
          [followUpStudentIds]
        )
      : { rows: [] };

    const studentsById = new Map(
      followUpStudentsResult.rows.map((student) => [String(student.id), studentFromRow(student)])
    );
    const followUpRecords = followUpSummary.rows
      .map((item) => ({
        _id: String(item.student_id),
        deRecords: item.de_records,
        deWeeks: item.de_weeks || [],
        latestWeek: item.latest_week,
        deWeekCount: item.de_week_count,
        student: studentsById.get(String(item.student_id))
      }))
      .filter((item) => item.student);

    const statusCards = STATUSES.map((status) => {
      const found = statusSummary.rows.find((item) => item.code === status.code);
      return { ...status, count: found ? found.count : 0 };
    });

    const studentHistoryRows = studentHistory.rows.map((row) => ({
      _id: String(row.record_id),
      week: row.week,
      subject: row.subject,
      status: row.status,
      note: row.note || "",
      overallQuality: row.overall_quality || "",
      attention: row.attention || "No",
      student: studentFromRow(row)
    }));
    const totalRecords = statusCards.reduce((sum, status) => sum + status.count, 0);
    const incompleteCount = statusCards
      .filter((status) => INCOMPLETE_CODES.includes(status.code))
      .reduce((sum, status) => sum + status.count, 0);
    const completionRate = totalRecords
      ? Math.round(((totalRecords - incompleteCount) / totalRecords) * 100)
      : 0;

    return res.render("dashboard", {
      title: "Dashboard",
      query: req.query,
      statusCards,
      subjectSummary: subjectSummary.rows.map((item) => ({
        _id: item.subject,
        total: item.total,
        incomplete: item.incomplete
      })),
      totalStudents: totalStudentsResult.rows[0].count,
      totalRecords,
      incompleteCount,
      completionRate,
      followUpRecords,
      studentHistory: studentHistoryRows
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/dashboard/follow-up-contacted", requireAdmin, async (req, res, next) => {
  try {
    const studentIds = Array.isArray(req.body.studentIds)
      ? req.body.studentIds
      : [req.body.studentIds].filter(Boolean);

    if (studentIds.length) {
      await query(
        `
          UPDATE students
          SET follow_up_contacted = TRUE,
              follow_up_contacted_at = NOW(),
              updated_at = NOW()
          WHERE id = ANY($1::bigint[])
        `,
        [studentIds]
      );
    }

    setFlash(req, "success", `${studentIds.length} follow-up contact record(s) saved.`);
    return res.redirect(`/dashboard?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
