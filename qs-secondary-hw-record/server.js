require("dotenv").config();

const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const createApp = require("./app");

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/qs-secondary-hw-record";

async function connectMongo() {
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2500 });
    console.log("MongoDB connected");
    return mongoUri;
  } catch (error) {
    if (process.env.DISABLE_MEMORY_MONGO === "true") {
      throw error;
    }

    const { MongoMemoryServer } = require("mongodb-memory-server");
    const dbPath = path.join(__dirname, ".mongodb-data");
    fs.mkdirSync(dbPath, { recursive: true });
    const memoryServer = await MongoMemoryServer.create({
      instance: {
        dbName: "qs-secondary-hw-record",
        dbPath,
        ip: "127.0.0.1",
        port: Number(process.env.MEMORY_MONGO_PORT || 27018),
        storageEngine: "wiredTiger"
      }
    });
    const memoryUri = memoryServer.getUri();
    await mongoose.connect(memoryUri);
    console.log("Development MongoDB started inside the project folder");
    return memoryUri;
  }
}

async function start() {
  const activeMongoUri = await connectMongo();
  const app = createApp(activeMongoUri);

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
