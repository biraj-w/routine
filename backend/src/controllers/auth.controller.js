// src/controllers/auth.controller.js
const { User } = require("../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// REGISTER USER
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    // Check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "user", // default role
    });

    res.status(201).json({ message: "User registered successfully", userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

// LOGIN USER
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role || "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login successful", token, role: user.role || "user" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
};
