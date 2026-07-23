const express = require("express");
const {
  emailOtpEnabled,
  generateOtpCode,
  getOtpEmailConfig,
  hashOtp,
  maskEmail,
  sendOtpEmail,
  verifyOtpHash
} = require("../services/otpEmail");

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function adminCredentials() {
  const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return {
    username: process.env.ADMIN_USERNAME || (isProduction ? "" : "Admin"),
    password: process.env.ADMIN_PASSWORD || (isProduction ? "" : "QsAdmin")
  };
}

async function startOtpChallenge(req, username) {
  const code = generateOtpCode();
  await sendOtpEmail(code);
  req.session.pendingLogin = {
    username,
    codeHash: hashOtp(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0
  };
}

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

router.post("/login", async (req, res, next) => {
  const { username, password } = adminCredentials();
  const usernameMatches = req.body.username === username;
  const passwordMatches = req.body.password === password;

  if (!usernameMatches || !passwordMatches) {
    req.session.flash = {
      type: "danger",
      message: "Invalid username or password."
    };
    return res.redirect("/login");
  }

  if (emailOtpEnabled()) {
    try {
      await startOtpChallenge(req, username);
      req.session.flash = {
        type: "info",
        message: "A verification code has been sent to the admin email."
      };
      return res.redirect("/login/verify");
    } catch (error) {
      return next(error);
    }
  }

  req.session.user = { username };
  return res.redirect("/dashboard");
});

router.get("/login/verify", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }

  if (!req.session.pendingLogin) {
    req.session.flash = {
      type: "warning",
      message: "Please sign in first."
    };
    return res.redirect("/login");
  }

  if (Date.now() > req.session.pendingLogin.expiresAt) {
    req.session.pendingLogin = null;
    req.session.flash = {
      type: "warning",
      message: "Your verification code expired. Please sign in again."
    };
    return res.redirect("/login");
  }

  return res.render("verify-login", {
    title: "Verify Login",
    maskedEmail: maskEmail(getOtpEmailConfig().to)
  });
});

router.post("/login/verify", (req, res) => {
  const pendingLogin = req.session.pendingLogin;
  const code = String(req.body.code || "").trim();

  if (!pendingLogin) {
    req.session.flash = {
      type: "warning",
      message: "Please sign in first."
    };
    return res.redirect("/login");
  }

  if (Date.now() > pendingLogin.expiresAt) {
    req.session.pendingLogin = null;
    req.session.flash = {
      type: "warning",
      message: "Your verification code expired. Please sign in again."
    };
    return res.redirect("/login");
  }

  pendingLogin.attempts += 1;

  if (!/^\d{6}$/.test(code) || !verifyOtpHash(code, pendingLogin.codeHash)) {
    if (pendingLogin.attempts >= MAX_OTP_ATTEMPTS) {
      req.session.pendingLogin = null;
      req.session.flash = {
        type: "danger",
        message: "Too many incorrect verification attempts. Please sign in again."
      };
      return res.redirect("/login");
    }

    req.session.flash = {
      type: "danger",
      message: "Invalid verification code."
    };
    return res.redirect("/login/verify");
  }

  req.session.user = { username: pendingLogin.username };
  req.session.pendingLogin = null;
  return res.redirect("/dashboard");
});

router.post("/login/resend-code", async (req, res, next) => {
  const pendingLogin = req.session.pendingLogin;

  if (!pendingLogin) {
    req.session.flash = {
      type: "warning",
      message: "Please sign in first."
    };
    return res.redirect("/login");
  }

  try {
    await startOtpChallenge(req, pendingLogin.username);
    req.session.flash = {
      type: "info",
      message: "A new verification code has been sent."
    };
    return res.redirect("/login/verify");
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/login");
});

module.exports = router;
