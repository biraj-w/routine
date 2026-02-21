const jwt = require("jsonwebtoken");

exports.authenticate = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Bearer TOKEN
  if (!token) return res.status(401).json({ message: "Token missing" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // id + role
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
