// src/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

// REGISTER
router.post("/register", authController.register);

// LOGIN
router.post("/login", authController.login);

module.exports = router;
