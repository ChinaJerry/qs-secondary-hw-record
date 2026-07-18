const express = require("express");
const {
  archiveStudent,
  deleteRecord,
  ensureWeekRecords,
  getRecords,
  getStudents,
  updateRecords
} = require("../db");
const { requireAdmin, setFlash } = require("./middleware");
const { SUBJECTS } = require("../config/constants");

const router = express.Router();

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function buildStudentFilters(query) {
  const filters = { active: true };
  ["level", "term", "courseDay", "classGroup"].forEach((field) => {
    if (query[field]) {
      filters[field] = query[field];
    }
  });

  if (query.year) {
    filters.year = Number(query.year);
  }

  if (query.studentId) {
    filters.studentId = query.studentId.trim();
  }

  return filters;
}

router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const studentFilters = buildStudentFilters(req.query);
    const students = await getStudents(studentFilters);
    const week = req.query.week ? Number(req.query.week) : null;

    if (!week) {
      return res.render("records", {
        title: "Homework Records",
        query: req.query,
        records: [],
        weekRequired: true
      });
    }

    await ensureWeekRecords(
      students.map((student) => student._id),
      week,
      req.query.subject ? [req.query.subject] : SUBJECTS
    );

    return res.render("records", {
      title: "Homework Records",
      query: req.query,
      records: await getRecords({
        studentFilters,
        week,
        subject: req.query.subject,
        status: req.query.status
      }),
      weekRequired: false
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/update", requireAdmin, async (req, res, next) => {
  try {
    const recordIds = asArray(req.body.recordIds);

    await updateRecords(
      recordIds.map((recordId) => ({
        id: recordId,
        status: req.body[`status_${recordId}`],
        note: req.body[`note_${recordId}`] || "",
        overallQuality: req.body[`overallQuality_${recordId}`] || "",
        attention: req.body[`attention_${recordId}`] === "Yes" ? "Yes" : "No"
      }))
    );

    setFlash(req, "success", `${recordIds.length} homework records saved.`);
    return res.redirect(`/records?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    await deleteRecord(req.params.id);
    setFlash(req, "success", "Homework record deleted.");
    return res.redirect(`/records?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

router.post("/students/:id/archive", requireAdmin, async (req, res, next) => {
  try {
    await archiveStudent(req.params.id);
    setFlash(req, "success", "Student archived.");
    return res.redirect("/records");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
