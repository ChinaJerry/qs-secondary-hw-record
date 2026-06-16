require("dotenv").config();

const createApp = require("./app");
const { initDb } = require("./db");

async function start() {
  await initDb();
  console.log("PostgreSQL connected");

  const app = createApp();

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "127.0.0.1";
  app.listen(port, host, () => {
    console.log(`Qs Secondary HW Record is running on http://${host}:${port}`);
  });
}

start().catch((error) => {
  console.error("Application failed to start:", error.message);
  process.exit(1);
});
