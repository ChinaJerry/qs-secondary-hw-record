const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const os = require("os");
const { query } = require("../db");
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
    const removedResult = await query(
      `
        DELETE FROM students
        WHERE level = $1
          AND year = $2
          AND term = $3
          AND course_day = $4
          AND class_group = $5
          AND NOT (student_code = ANY($6::text[]))
      `,
      [cohort.level, cohort.year, cohort.term, cohort.courseDay, cohort.classGroup, uploadedIds]
    );

    for (const studentRow of studentRowsById.values()) {
      await query(
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
          cohort.year,
          cohort.term,
          cohort.courseDay,
          cohort.classGroup
        ]
      );
      imported += 1;
    }

    setFlash(
      req,
      "success",
      `Import completed. ${imported} students in this class list, ${removedResult.rowCount} old students removed, ${skipped} rows skipped.`
    );
    return res.redirect("/records");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
