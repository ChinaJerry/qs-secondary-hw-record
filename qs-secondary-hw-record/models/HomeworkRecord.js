const mongoose = require("mongoose");
const { SUBJECTS, STATUSES } = require("../config/constants");

const statusCodes = STATUSES.map((status) => status.code);

const homeworkRecordSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    week: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    subject: {
      type: String,
      enum: SUBJECTS,
      required: true
    },
    status: {
      type: String,
      enum: statusCodes,
      default: "E",
      required: true
    },
    note: {
      type: String,
      trim: true,
      default: ""
    },
    overallQuality: {
      type: String,
      trim: true,
      default: ""
    },
    attention: {
      type: String,
      enum: ["No", "Yes"],
      default: "No"
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

homeworkRecordSchema.index({ student: 1, week: 1, subject: 1 }, { unique: true });
homeworkRecordSchema.index({ week: 1, subject: 1, status: 1 });

module.exports = mongoose.model("HomeworkRecord", homeworkRecordSchema);
