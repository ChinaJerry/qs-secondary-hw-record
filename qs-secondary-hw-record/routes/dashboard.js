const express = require("express");
const Student = require("../models/Student");
const HomeworkRecord = require("../models/HomeworkRecord");
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
    const students = await Student.find(studentFilters).select("_id").lean();
    const studentIds = students.map((student) => student._id);
    const recordFilters = {};

    if (studentIds.length || Object.keys(studentFilters).length) {
      recordFilters.student = { $in: studentIds };
    }

    recordFilters.isDeleted = { $ne: true };

    if (req.query.week) {
      recordFilters.week = Number(req.query.week);
    }
    if (req.query.subject) {
      recordFilters.subject = req.query.subject;
    }

    const followUpRecordFilters = { ...recordFilters };
    delete followUpRecordFilters.week;

    const [statusSummary, subjectSummary, totalStudents, followUpSummary, studentHistory] =
      await Promise.all([
        HomeworkRecord.aggregate([
          { $match: recordFilters },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        HomeworkRecord.aggregate([
          { $match: recordFilters },
          { $group: { _id: "$subject", total: { $sum: 1 }, incomplete: { $sum: { $cond: [{ $in: ["$status", INCOMPLETE_CODES] }, 1, 0] } } } },
          { $sort: { _id: 1 } }
        ]),
        Student.countDocuments(studentFilters),
        HomeworkRecord.aggregate([
          { $match: { ...followUpRecordFilters, status: { $in: INCOMPLETE_CODES } } },
          {
            $group: {
              _id: "$student",
              deRecords: { $sum: 1 },
              deWeeks: { $addToSet: "$week" },
              latestWeek: { $max: "$week" }
            }
          },
          { $addFields: { deWeekCount: { $size: "$deWeeks" } } },
          { $match: { deWeekCount: { $gte: 3 } } },
          { $sort: { deWeekCount: -1, deRecords: -1, latestWeek: -1 } },
          { $limit: 300 }
        ]),
        req.query.studentId
          ? HomeworkRecord.find({ isDeleted: { $ne: true } })
              .populate({
                path: "student",
                match: { studentId: req.query.studentId.trim() }
              })
              .sort({ week: 1, subject: 1 })
              .lean()
          : []
      ]);

    const followUpStudents = await Student.find({
      _id: { $in: followUpSummary.map((item) => item._id) }
    }).lean();
    const studentsById = new Map(followUpStudents.map((student) => [String(student._id), student]));
    const followUpRecords = followUpSummary
      .map((item) => ({
        ...item,
        student: studentsById.get(String(item._id)),
        deWeeks: item.deWeeks.sort((a, b) => a - b)
      }))
      .filter((item) => item.student);

    const statusCards = STATUSES.map((status) => {
      const found = statusSummary.find((item) => item._id === status.code);
      return { ...status, count: found ? found.count : 0 };
    });

    const visibleHistory = studentHistory.filter((record) => record.student);
    const totalRecords = statusCards.reduce((sum, status) => sum + status.count, 0);
    const incompleteCount = statusCards
      .filter((status) => INCOMPLETE_CODES.includes(status.code))
      .reduce((sum, status) => sum + status.count, 0);
    const completionRate = totalRecords
      ? Math.round(((totalRecords - incompleteCount) / totalRecords) * 100)
      : 0;

    res.render("dashboard", {
      title: "Dashboard",
      query: req.query,
      statusCards,
      subjectSummary,
      totalStudents,
      totalRecords,
      incompleteCount,
      completionRate,
      followUpRecords,
      studentHistory: visibleHistory
    });
  } catch (error) {
    next(error);
  }
});

router.post("/dashboard/follow-up-contacted", requireAdmin, async (req, res, next) => {
  try {
    const studentIds = Array.isArray(req.body.studentIds)
      ? req.body.studentIds
      : [req.body.studentIds].filter(Boolean);

    if (studentIds.length) {
      await Student.updateMany(
        { _id: { $in: studentIds } },
        {
          $set: {
            followUpContacted: true,
            followUpContactedAt: new Date()
          }
        }
      );
    }

    setFlash(req, "success", `${studentIds.length} follow-up contact record(s) saved.`);
    return res.redirect(`/dashboard?${new URLSearchParams(req.body.returnQuery || "").toString()}`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
