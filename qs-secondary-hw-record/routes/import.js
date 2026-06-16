const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const os = require("os");
const Student = require("../models/Student");
const HomeworkRecord = require("../models/HomeworkRecord");
const { requireAdmin, setFlash } = require("./middleware");

const router = express.Router();
const upload = multer({ dest: process.env.VERCEL === "1" ? os.tmpdir() : "uploads/" });

function readRows(filePath) {
  const workbook = xlsx.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(sheet, { defval: "" });
}

function getCell(row, names) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value])
  );
  const foundKey = names.find((name) => Object.prototype.hasOwnProperty.call(normalized, name));
  return foundKey ? String(normalized[foundKey]).trim() : "";
}

router.get("/", requireAdmin, (req, res) => {
  res.render("import", {
    title: "Import Students"
  });
});

router.post("/", requireAdmin, upload.single("studentFile"), async (req, res, next) => {
  try {
    if (!req.file) {
      setFlash(req, "danger", "Please upload an Excel file.");
      return res.redirect("/import");
    }

    const rows = readRows(req.file.path);
    const cohortFilter = {
      level: req.body.level,
      year: Number(req.body.year),
      term: req.body.term,
      courseDay: req.body.courseDay,
      classGroup: req.body.classGroup
    };
    const studentRowsById = new Map();
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const studentName = getCell(row, ["student name", "name"]);
      const studentId = getCell(row, ["student id", "id"]);
      const studentEmail = getCell(row, ["student email", "email"]);
      const phone = getCell(row, ["phone", "student phone", "phone number", "mobile", "mobile phone"]);

      if (!studentName || !studentId) {
        skipped += 1;
        continue;
      }

      studentRowsById.set(studentId, {
        studentName,
        studentId,
        studentEmail,
        phone
      });
    }

    const uploadedIds = [...studentRowsById.keys()];
    const removedStudents = await Student.find({
      ...cohortFilter,
      studentId: { $nin: uploadedIds }
    }).select("_id");

    if (removedStudents.length) {
      await HomeworkRecord.deleteMany({ student: { $in: removedStudents.map((student) => student._id) } });
      await Student.deleteMany({ _id: { $in: removedStudents.map((student) => student._id) } });
    }

    for (const studentRow of studentRowsById.values()) {
      await Student.findOneAndUpdate(
        { ...cohortFilter, studentId: studentRow.studentId },
        {
          $set: {
            studentName: studentRow.studentName,
            studentEmail: studentRow.studentEmail,
            phone: studentRow.phone,
            active: true
          }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      );
      imported += 1;
    }

    setFlash(
      req,
      "success",
      `Import completed. ${imported} students in this class list, ${removedStudents.length} old students removed, ${skipped} rows skipped.`
    );
    return res.redirect("/records");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
