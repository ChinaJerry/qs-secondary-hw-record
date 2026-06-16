const express = require("express");
const Student = require("../models/Student");
const HomeworkRecord = require("../models/HomeworkRecord");
const { requireAdmin, setFlash } = require("./middleware");
const { SUBJECTS } = require("../config/constants");

const router = express.Router();

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

async function ensureWeekRecords(students, week, subjectFilter) {
  const subjects = subjectFilter ? [subjectFilter] : SUBJECTS;
  const bulkOps = [];

  for (const student of students) {
    for (const subject of subjects) {
      bulkOps.push({
        updateOne: {
          filter: { student: student._id, week, subject },
          update: {
            $setOnInsert: {
              student: student._id,
              week,
              subject,
              status: "E",
              note: "",
              overallQuality: "",
              attention: "No"
            }
          },
          upsert: true
        }
      });
    }
  }

  if (bulkOps.length) {
    await HomeworkRecord.bulkWrite(bulkOps);
  }
}

router.get("/", requireAdmin, async (req, res, next) => {
  try {
    const studentFilters = buildStudentFilters(req.query);
    const students = await Student.find(studentFilters).select("_id").lean();
    const recordFilters = {};
    const week = req.query.week ? Number(req.query.week) : null;

    if (!week) {
      return res.render("records", {
        title: "Homework Records",
        query: req.query,
        records: [],
        weekRequired: true
      });
    }

    await ensureWeekRecords(students, week, req.query.subject);

    recordFilters.student = { $in: students.map((student) => student._id) };
    recordFilters.week = week;
    recordFilters.isDeleted = { $ne: true };

    if (req.query.subject) {
      recordFilters.subject = req.query.subject;
    }
    if (req.query.status) {
      recordFilters.status = req.query.status;
    }

    const records = await HomeworkRecord.find(recordFilters)
      .populate("student")
      .sort({ "student.level": 1, week: 1, subject: 1 })
      .limit(500)
      .lean();

    res.render("records", {
      title: "Homework Records",
      query: req.query,
      records: records.filter((record) => record.student),
      weekRequired: false
    });
  } catch (error) {
    next(error);
  }
});

router.post("/update", requireAdmin, async (req, res, next) => {
  try {
    const statuses = req.body.status || {};
    const notes = req.body.note || {};
    const overallQualities = req.body.overallQuality || {};
    const attentionValues = req.body.attention || {};
    const bulkOps = Object.keys(statuses).map((recordId) => ({
      updateOne: {
        filter: { _id: recordId, isDeleted: { $ne: true } },
        update: {
          $set: {
            status: statuses[recordId],
            note: notes[recordId] || "",
            overallQuality: overallQualities[recordId] || "",
            attention: attentionValues[recordId] === "Yes" ? "Yes" : "No"
          }
        }
      }
    }));

    if (bulkOps.length) {
      await HomeworkRecord.bulkWrite(bulkOps);
    }

    setFlash(req, "success", `${bulkOps.length} homework records saved.`);
    return res.redirect(`/records?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    await HomeworkRecord.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date()
        }
      }
    );

    setFlash(req, "success", "Homework record deleted.");
    return res.redirect(`/records?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

router.post("/students/:id/archive", requireAdmin, async (req, res, next) => {
  try {
    await Student.findByIdAndUpdate(req.params.id, { active: false });
    setFlash(req, "success", "Student archived.");
    return res.redirect("/records");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
