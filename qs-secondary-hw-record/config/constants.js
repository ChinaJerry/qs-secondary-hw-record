const LEVELS = ["Level 8", "Level 9", "Level 10", "VCE Prep", "VCE"];
const TERMS = ["T1", "T2", "T3", "T4"];
const COURSE_DAYS = [
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Saturday AM",
  "Saturday PM",
  "Sunday AM",
  "Sunday PM"
];
const CLASS_GROUPS = ["A", "B"];
const SUBJECTS = ["Math", "English & Writing", "Science"];
const STATUSES = [
  { code: "A", label: "Self mark / complete", complete: true },
  { code: "B", label: "Complete but not mark", complete: true },
  { code: "C", label: "Not complete", complete: false },
  { code: "D", label: "Not touched", complete: false },
  { code: "E", label: "Not submit", complete: false }
];
const INCOMPLETE_CODES = ["D", "E"];

module.exports = {
  LEVELS,
  TERMS,
  COURSE_DAYS,
  CLASS_GROUPS,
  SUBJECTS,
  STATUSES,
  INCOMPLETE_CODES
};
