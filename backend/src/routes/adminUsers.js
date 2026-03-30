import express from "express";
import { User } from "../models/User.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/", async (_req, res) => {
  try {
    const users = await User.find().sort({ email: 1 }).select("-passwordHash").lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to list users", error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { name, role, financeOwnerLabel } = req.body || {};
    const updates = {};

    if (typeof name === "string") {
      updates.name = name.trim();
    }
    if (typeof financeOwnerLabel === "string") {
      updates.financeOwnerLabel = financeOwnerLabel.trim();
    }
    if (role !== undefined) {
      if (!["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "role must be user or admin" });
      }
      updates.role = role;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(400).json({ message: "Failed to update user", error: error.message });
  }
});

export default router;
