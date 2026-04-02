import express from "express";
import mongoose from "mongoose";
import { createGuardrails, generateSync } from "otplib";
import { TotpEntry } from "../models/TotpEntry.js";
import { requireAuth, requireApprovedUser } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireApprovedUser);

const MAX_ENTRIES = 40;
const PERIOD = 30;

/** Many sites use 10-byte secrets; default otplib guardrail is 16 bytes. */
const guardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

/**
 * Accept raw base32 or otpauth://totp/...?secret=XXXX URL.
 */
function normalizeSecret(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("otpauth://")) {
    try {
      const u = new URL(raw);
      const sec = u.searchParams.get("secret");
      if (sec) return sec.replace(/\s+/g, "").toUpperCase();
    } catch {
      return "";
    }
  }
  return raw.replace(/\s+/g, "").toUpperCase();
}

function parseOtpauthMeta(raw) {
  const s = String(raw ?? "").trim();
  if (!s.toLowerCase().startsWith("otpauth://")) return null;
  try {
    const u = new URL(s);
    const issuerQP = (u.searchParams.get("issuer") || "").trim();
    const path = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    let label = "";
    let issuer = issuerQP;
    if (path.includes(":")) {
      const idx = path.indexOf(":");
      const a = path.slice(0, idx).trim();
      const b = path.slice(idx + 1).trim();
      if (!issuer) issuer = a;
      label = b || path;
    } else {
      label = path;
    }
    return {
      label: label.slice(0, 200),
      issuer: issuer.slice(0, 120)
    };
  } catch {
    return null;
  }
}

function validateSecretForTotp(secret) {
  if (!secret || secret.length < 8) return false;
  try {
    generateSync({ secret, guardrails });
    return true;
  } catch {
    return false;
  }
}

function expiresAtMs() {
  const epoch = Math.floor(Date.now() / 1000);
  return (Math.floor(epoch / PERIOD) + 1) * PERIOD * 1000;
}

function serializeMeta(doc) {
  return {
    _id: doc._id.toString(),
    label: doc.label,
    issuer: doc.issuer || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

router.get("/codes", async (req, res) => {
  try {
    const rows = await TotpEntry.find({ owner: req.user.id }).sort({ updatedAt: -1 }).lean();
    const expiresAt = expiresAtMs();
    const entries = rows.map((r) => ({
      id: r._id.toString(),
      label: r.label,
      issuer: r.issuer || "",
      code: generateSync({ secret: r.secret, guardrails }),
      period: PERIOD,
      expiresAtMs: expiresAt
    }));
    res.json({ entries });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate codes", error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const rows = await TotpEntry.find({ owner: req.user.id }).sort({ updatedAt: -1 }).lean();
    res.json({ entries: rows.map(serializeMeta) });
  } catch (error) {
    res.status(500).json({ message: "Failed to load authenticator entries", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const count = await TotpEntry.countDocuments({ owner: req.user.id });
    if (count >= MAX_ENTRIES) {
      return res.status(400).json({ message: `At most ${MAX_ENTRIES} authenticator entries` });
    }
    let label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 200) : "";
    let issuer = typeof req.body?.issuer === "string" ? req.body.issuer.trim().slice(0, 120) : "";
    const secretRaw = normalizeSecret(req.body?.secret);
    const fromUri = parseOtpauthMeta(String(req.body?.secret ?? "").trim());
    if (fromUri) {
      if (!label && fromUri.label) label = fromUri.label;
      if (!issuer && fromUri.issuer) issuer = fromUri.issuer;
    }
    if (!label) {
      return res.status(400).json({
        message:
          "Label is required (or paste a full otpauth://totp/… URL so we can read the account name from it)."
      });
    }
    if (!validateSecretForTotp(secretRaw)) {
      return res.status(400).json({
        message:
          "Invalid or unsupported secret. Paste a base32 key or a full otpauth://totp/… URL from Google Authenticator."
      });
    }
    const created = await TotpEntry.create({
      owner: req.user.id,
      label,
      issuer,
      secret: secretRaw
    });
    res.status(201).json(serializeMeta(created));
  } catch (error) {
    res.status(400).json({ message: "Failed to save entry", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const r = await TotpEntry.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!r) {
      return res.status(404).json({ message: "Not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: "Failed to delete", error: error.message });
  }
});

export default router;
