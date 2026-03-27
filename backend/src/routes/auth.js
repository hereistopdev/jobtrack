import bcrypt from "bcryptjs";
import express from "express";
import { User } from "../models/User.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router = express.Router();

const SALT_ROUNDS = 12;

function publicUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name || "",
    role: user.role
  };
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password is required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const normalized = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalized });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email: normalized,
      passwordHash,
      name: typeof name === "string" ? name.trim() : ""
    });

    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ message: "Registration failed", error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalized = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalized });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json(publicUser(user));
  } catch (error) {
    res.status(500).json({ message: "Failed to load profile", error: error.message });
  }
});

export default router;
