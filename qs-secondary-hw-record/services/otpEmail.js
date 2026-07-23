const crypto = require("crypto");

function emailOtpEnabled() {
  return process.env.LOGIN_OTP_ENABLED === "true";
}

function getOtpEmailConfig() {
  return {
    to: process.env.ADMIN_OTP_EMAIL || "",
    from: process.env.OTP_EMAIL_FROM || "Qs Secondary HW Record <onboarding@resend.dev>",
    apiKey: process.env.RESEND_API_KEY || ""
  };
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function otpSecret() {
  return process.env.SESSION_SECRET || "qs-secondary-hw-record-local-secret";
}

function hashOtp(code) {
  return crypto.createHmac("sha256", otpSecret()).update(code).digest("hex");
}

function verifyOtpHash(code, expectedHash) {
  const actual = Buffer.from(hashOtp(code), "hex");
  const expected = Buffer.from(expectedHash || "", "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "the configured admin email";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

async function sendOtpEmail(code) {
  const config = getOtpEmailConfig();

  if (!emailOtpEnabled()) {
    return { sent: false, skipped: true };
  }

  if (!config.to) {
    throw new Error("ADMIN_OTP_EMAIL is not configured.");
  }

  if (!config.apiKey) {
    if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
      console.log(`[Qs HW Record] Admin login OTP: ${code}`);
      return { sent: false, logged: true };
    }
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: config.to,
      subject: "Qs Secondary HW Record Login Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; color: #17243a;">
          <h2 style="color: #0b3d78;">Qs Secondary HW Record</h2>
          <p>Your admin login verification code is:</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
          <p>This code expires in 10 minutes. If you did not request this login, please ignore this email.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send verification email: ${text}`);
  }

  return { sent: true };
}

module.exports = {
  emailOtpEnabled,
  generateOtpCode,
  getOtpEmailConfig,
  hashOtp,
  maskEmail,
  sendOtpEmail,
  verifyOtpHash
};
