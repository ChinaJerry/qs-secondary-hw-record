const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  return res.redirect("/login");
});

router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  return res.render("login", { title: "Admin Login" });
});

router.post("/login", (req, res) => {
  const username = process.env.ADMIN_USERNAME || "Admin";
  const password = process.env.ADMIN_PASSWORD || "QsAdmin";
  const usernameMatches = req.body.username === username;
  const passwordMatches = req.body.password === password;

  if (!usernameMatches || !passwordMatches) {
    req.session.flash = {
      type: "danger",
      message: "Invalid username or password."
    };
    return res.redirect("/login");
  }

  req.session.user = { username };
  return res.redirect("/dashboard");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

module.exports = router;
