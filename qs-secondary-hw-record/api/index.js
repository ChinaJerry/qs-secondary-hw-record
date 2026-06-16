const mongoose = require("mongoose");
const createApp = require("../app");

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI must be set in Vercel Environment Variables.");
}

if (mongoose.connection.readyState === 0) {
  mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 }).catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });
}

module.exports = createApp(mongoUri);
