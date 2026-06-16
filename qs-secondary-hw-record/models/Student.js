const mongoose = require("mongoose");
const { LEVELS, TERMS, COURSE_DAYS, CLASS_GROUPS } = require("../config/constants");

const studentSchema = new mongoose.Schema(
  {
    studentName: {
      type: String,
      required: true,
      trim: true
    },
    studentId: {
      type: String,
      required: true,
      trim: true
    },
    studentEmail: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
    level: {
      type: String,
      enum: LEVELS,
      required: true
    },
    year: {
      type: Number,
      required: true
    },
    term: {
      type: String,
      enum: TERMS,
      required: true
    },
    courseDay: {
      type: String,
      enum: COURSE_DAYS,
      required: true
    },
    classGroup: {
      type: String,
      enum: CLASS_GROUPS,
      required: true
    },
    active: {
      type: Boolean,
      default: true
    },
    followUpContacted: {
      type: Boolean,
      default: false
    },
    followUpContactedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

studentSchema.index(
  { studentId: 1, level: 1, year: 1, term: 1, courseDay: 1, classGroup: 1 },
  { unique: true }
);

studentSchema.virtual("termLabel").get(function getTermLabel() {
  return `${this.year} ${this.term}`;
});

module.exports = mongoose.model("Student", studentSchema);
