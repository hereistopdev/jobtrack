import bcrypt from "bcryptjs";
import express from "express";
import { User } from "../models/User.js";
import { requireAuth, requireApprovedUser, signToken } from "../middleware/auth.js";
import { ledgerOwnerLabelFromUserDoc, normalizeOwnerName } from "../utils/financeOwnerIdentity.js";
import {
  applyIncomingJobProfiles,
  mapJobProfileToClient,
  migrateJobProfilesIfNeeded
} from "../utils/jobProfiles.js";

const router = express.Router();

const SALT_ROUNDS = 12;

function publicUser(user) {
  const ledger = ledgerOwnerLabelFromUserDoc(user);
  const financeAccess =
    user.role === "admin" || normalizeOwnerName(ledger).length > 0;
  const jobProfiles = (user.jobProfiles || []).map((p, i) => mapJobProfileToClient(p, i));
  const profiles = jobProfiles.map((p) => p.label);
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name || "",
    role: user.role,
    financeAccess,
    financeOwnerLabel: user.financeOwnerLabel || "",
    jobProfiles,
    interviewProfiles: profiles
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

    const count = await User.countDocuments();
    const isFirstUser = count === 0;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email: normalized,
      passwordHash,
      name: typeof name === "string" ? name.trim() : "",
      signupApproved: isFirstUser,
      role: isFirstUser ? "admin" : "user"
    });

    if (!isFirstUser) {
      return res.status(201).json({
        message:
          "Account created. An administrator must approve your account before you can sign in.",
        pendingApproval: true
      });
    }

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

    if (user.signupApproved === false) {
      return res.status(403).json({
        message: "Your account is pending administrator approval. You will be able to sign in once approved."
      });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

router.get("/me", requireAuth, requireApprovedUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    await migrateJobProfilesIfNeeded(user);
    res.json(publicUser(user));
  } catch (error) {
    res.status(500).json({ message: "Failed to load profile", error: error.message });
  }
});

router.patch("/me", requireAuth, requireApprovedUser, async (req, res) => {
  try {
    const b = req.body || {};
    const hasName = b.name !== undefined;
    const hasJobProfiles = b.jobProfiles !== undefined;
    const hasLegacyProfiles = b.interviewProfiles !== undefined;

    if (!hasName && !hasJobProfiles && !hasLegacyProfiles) {
      return res.status(400).json({
        message: "Provide at least one of: name, jobProfiles, interviewProfiles"
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    await migrateJobProfilesIfNeeded(user);

    if (hasName) {
      user.name = String(b.name).trim().slice(0, 160);
    }

    if (hasJobProfiles) {
      if (!Array.isArray(b.jobProfiles)) {
        return res.status(400).json({ message: "jobProfiles must be an array" });
      }
      applyIncomingJobProfiles(user, b.jobProfiles);
    } else if (hasLegacyProfiles) {
      if (!Array.isArray(b.interviewProfiles)) {
        return res.status(400).json({ message: "interviewProfiles must be an array" });
      }
      const cleaned = [
        ...new Set(
          b.interviewProfiles
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
            .map((s) => s.slice(0, 120))
        )
      ].slice(0, 40);
      const existing = user.jobProfiles || [];
      const byLabel = new Map(existing.map((p) => [p.label.toLowerCase(), p]));
      const incoming = cleaned.map((label) => {
        const prev = byLabel.get(label.toLowerCase());
        return {
          id: prev?._id?.toString(),
          label,
          calendarColor: prev?.calendarColor
        };
      });
      applyIncomingJobProfiles(user, incoming);
    }

    await user.save();
    res.json(publicUser(user));
  } catch (error) {
    res.status(400).json({ message: "Failed to update profile", error: error.message });
  }
});

router.post("/change-password", requireAuth, requireApprovedUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    res.json({ message: "Password updated" });
  } catch (error) {
    res.status(400).json({ message: "Failed to change password", error: error.message });
  }
});

export default router;
