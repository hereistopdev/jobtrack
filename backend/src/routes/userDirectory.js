import express from "express";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { ledgerOwnerLabelFromUserDoc } from "../utils/financeOwnerIdentity.js";

const router = express.Router();

/** Team roster for pickers (interviews, finance owner, etc.). Any authenticated user. */
router.get("/directory", requireAuth, async (_req, res) => {
  try {
    const users = await User.find()
      .sort({ name: 1, email: 1 })
      .select("name email financeOwnerLabel")
      .lean();

    const members = users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name || "",
      displayName: (u.name || "").trim() || u.email,
      ownerLabel: ledgerOwnerLabelFromUserDoc(u)
    }));

    res.json({ members });
  } catch (error) {
    res.status(500).json({ message: "Failed to load team directory", error: error.message });
  }
});

export default router;
