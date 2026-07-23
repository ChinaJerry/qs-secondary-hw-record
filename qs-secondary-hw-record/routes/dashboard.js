const express = require("express");
const xlsx = require("xlsx");
const {
  countStudents,
  exportBackupData,
  followUpRecords,
  markFollowUpContacted,
  statusSummary,
  studentHistory,
  subjectSummary
} = require("../db");
const { requireAdmin, setFlash } = require("./middleware");
const { STATUSES, INCOMPLETE_CODES } = require("../config/constants");

const router = express.Router();

function isoValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildBackupWorkbook({ students, homeworkRecords }) {
  const workbook = xlsx.utils.book_new();
  const studentRows = students.map((student) => ({
    "Internal Student ID": student._id,
    "Student Name": student.studentName,
    "Student ID": student.studentId,
    "Student Email": student.studentEmail,
    Phone: student.phone || "",
    Level: student.level,
    Year: student.year,
    Term: student.term,
    "Course Day": student.courseDay,
    "Class Group": student.classGroup,
    Active: student.active ? "Yes" : "No",
    "Follow-up Contacted": student.followUpContacted ? "Yes" : "No",
    "Follow-up Contacted At": isoValue(student.followUpContactedAt),
    "Created At": isoValue(student.createdAt),
    "Updated At": isoValue(student.updatedAt)
  }));
  const recordRows = homeworkRecords.map((record) => ({
    "Record ID": record._id,
    "Internal Student ID": record.studentId,
    "Student Name": record.student?.studentName || "",
    "Student ID": record.student?.studentId || "",
    "Student Email": record.student?.studentEmail || "",
    Phone: record.student?.phone || "",
    Level: record.student?.level || "",
    Year: record.student?.year || "",
    Term: record.student?.term || "",
    "Course Day": record.student?.courseDay || "",
    "Class Group": record.student?.classGroup || "",
    Week: record.week,
    Subject: record.subject,
    Status: record.status,
    "Overall Quality": record.overallQuality || "",
    Attention: record.attention || "No",
    Note: record.note || "",
    Deleted: record.isDeleted ? "Yes" : "No",
    "Deleted At": isoValue(record.deletedAt),
    "Created At": isoValue(record.createdAt),
    "Updated At": isoValue(record.updatedAt)
  }));

  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(studentRows), "Students");
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(recordRows), "Homework Records");
  return workbook;
}

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
      followUpRecords: await followUpRecords(studentFilters, req.query.subject, INCOMPLETE_CODES),
      studentHistory: await studentHistory(req.query.studentId ? req.query.studentId.trim() : "")
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/dashboard/export-backup", requireAdmin, async (req, res, next) => {
  try {
    const backupData = await exportBackupData();
    const workbook = buildBackupWorkbook(backupData);
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="qs-secondary-hw-record-backup-${stamp}.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(buffer);
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
