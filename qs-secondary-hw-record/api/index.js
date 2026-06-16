const createApp = require("../app");
const { initDb } = require("../db");

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  throw new Error("DATABASE_URL must be set in Vercel Environment Variables.");
}

initDb().catch((error) => {
  console.error("PostgreSQL initialization failed:", error.message);
});

module.exports = createApp();
