const express = require("express");
const {
  countStudents,
  createBackupSnapshot,
  followUpRecords,
  listBackupSnapshots,
  markFollowUpContacted,
  statusSummary,
  studentHistory,
  subjectSummary
} = require("../db");
const { requireAdmin, setFlash } = require("./middleware");
const { STATUSES, INCOMPLETE_CODES } = require("../config/constants");

const router = express.Router();

function cleanFilters(query) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== "")
  );
}

function studentFilterFromQuery(query) {
  const filters = cleanFilters({
    active: true,
    level: query.level,
    year: query.year ? Number(query.year) : "",
    term: query.term,
    courseDay: query.courseDay,
    classGroup: query.classGroup
  });

  if (query.studentId) {
    filters.studentId = query.studentId.trim();
  }

  return filters;
}

router.get("/dashboard", requireAdmin, async (req, res, next) => {
  try {
    const studentFilters = studentFilterFromQuery(req.query);
    const summary = await statusSummary(studentFilters, req.query.week ? Number(req.query.week) : null, req.query.subject);
    const statusCards = STATUSES.map((status) => {
      const found = summary.find((item) => item.code === status.code);
      return { ...status, count: found ? found.count : 0 };
    });
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
      subjectSummary: await subjectSummary(
        studentFilters,
        req.query.week ? Number(req.query.week) : null,
        req.query.subject,
        INCOMPLETE_CODES
      ),
      totalStudents: await countStudents(studentFilters),
      totalRecords,
      incompleteCount,
      completionRate,
      backupSnapshots: await listBackupSnapshots(5),
      followUpRecords: await followUpRecords(studentFilters, req.query.subject, INCOMPLETE_CODES),
      studentHistory: await studentHistory(req.query.studentId ? req.query.studentId.trim() : "")
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/dashboard/backups", requireAdmin, async (req, res, next) => {
  try {
    const backup = await createBackupSnapshot(req.session.user?.username || "Admin");
    setFlash(
      req,
      "success",
      `Secure backup created. Students: ${backup.studentCount}, homework records: ${backup.homeworkRecordCount}.`
    );
    return res.redirect("/dashboard");
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
      await markFollowUpContacted(studentIds);
    }

    setFlash(req, "success", `${studentIds.length} follow-up contact record(s) saved.`);
    return res.redirect(`/dashboard?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
