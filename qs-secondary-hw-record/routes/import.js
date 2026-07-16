const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const os = require("os");
const { addOrUpdateStudent, importClassList } = require("../db");
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
    const cohort = {
      level: req.body.level,
      year: Number(req.body.year),
      term: req.body.term,
      courseDay: req.body.courseDay,
      classGroup: req.body.classGroup
    };
    const studentRowsById = new Map();
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

    const result = await importClassList(cohort, [...studentRowsById.values()]);

    setFlash(
      req,
      "success",
      `Import completed. ${result.imported} students in this class list, ${result.removed} old students removed, ${skipped} rows skipped.`
    );
    return res.redirect("/records");
  } catch (error) {
    return next(error);
  }
});

router.post("/manual", requireAdmin, async (req, res, next) => {
  try {
    const studentName = String(req.body.studentName || "").trim();
    const studentId = String(req.body.studentId || "").trim();

    if (!studentName || !studentId) {
      setFlash(req, "danger", "Student Name and Student ID are required.");
      return res.redirect("/import");
    }

    const result = await addOrUpdateStudent(
      {
        level: req.body.level,
        year: Number(req.body.year),
        term: req.body.term,
        courseDay: req.body.courseDay,
        classGroup: req.body.classGroup
      },
      {
        studentName,
        studentId,
        studentEmail: String(req.body.studentEmail || "").trim(),
        phone: String(req.body.phone || "").trim()
      }
    );

    setFlash(
      req,
      "success",
      result.created
        ? `Student ${studentName} has been added.`
        : `Student ${studentName} already existed in this class and has been updated.`
    );
    return res.redirect("/import");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
