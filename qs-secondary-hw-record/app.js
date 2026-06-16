const path = require("path");
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const expressLayouts = require("express-ejs-layouts");
const constants = require("./config/constants");

function createApp(mongoUri) {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required.");
  }

  const app = express();

  app.set("trust proxy", 1);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(expressLayouts);
  app.set("layout", "layout");

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.use(
    session({
      name: "qs_hw_sid",
      secret: process.env.SESSION_SECRET || "qs-secondary-hw-record-local-secret",
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: mongoUri }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.path = req.path;
    res.locals.constants = constants;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
  });

  app.use("/", require("./routes/auth"));
  app.use("/", require("./routes/dashboard"));
  app.use("/import", require("./routes/import"));
  app.use("/records", require("./routes/records"));

  app.use((req, res) => {
    res.status(404).render("error", {
      title: "Page Not Found",
      message: "The page you requested does not exist."
    });
  });

  return app;
}

module.exports = createApp;
