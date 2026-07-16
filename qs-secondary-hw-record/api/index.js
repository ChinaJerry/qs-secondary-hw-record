const createApp = require("../app");
const { initDb } = require("../db");

initDb().catch((error) => {
  console.error("Database initialization failed:", error.message);
});

module.exports = createApp();
