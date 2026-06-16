function requireAdmin(req, res, next) {
  if (req.session.user) {
    return next();
  }

  req.session.flash = {
    type: "warning",
    message: "Please sign in to continue."
  };
  return res.redirect("/login");
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

module.exports = {
  requireAdmin,
  setFlash
};
