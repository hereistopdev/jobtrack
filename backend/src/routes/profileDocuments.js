import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { createReadStream } from "fs";
import { User } from "../models/User.js";
import { requireAuth, requireApprovedUser } from "../middleware/auth.js";
import { mapJobProfileToClient, migrateJobProfilesIfNeeded, sanitizeExperiences, sanitizeUniversities } from "../utils/jobProfiles.js";
import { parseResumeStructured } from "../utils/parseResumeStructured.js";
import { extractResumeText } from "../utils/resumeTextFromBuffer.js";
import {
  absolutePathForKey,
  deleteFileIfExists,
  newStoredRelativeKey,
  writeFileEnsured
} from "../utils/profileUploadStorage.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 30 }
});

const uploadMulti = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 30 }
});

const RESUME_MIME = /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/i;
const IMAGE_OR_PDF_MIME =
  /^(image\/jpeg|image\/png|image\/webp|application\/pdf)$/i;

const ID_KINDS = new Set(["drivers_license", "passport", "green_card", "state_id", "other"]);
const OTHER_CATS = new Set(["diploma", "transcript", "paystub", "certificate", "other"]);

router.use(requireAuth, requireApprovedUser);

function handleMulter(err, _req, res, next) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File too large (max 15 MB)" });
  }
  return next(err);
}

function profileSubdoc(user, profileId) {
  const pid = String(profileId);
  if (!mongoose.Types.ObjectId.isValid(pid)) return null;
  return (user.jobProfiles || []).find((p) => p._id.toString() === pid) ?? null;
}

function attachmentName(originalName) {
  const s = String(originalName || "document").replace(/[\r\n"]/g, "");
  return encodeURIComponent(s);
}

/** POST /api/auth/profile-files/:profileId/resume — multipart field `file` */
router.post(
  "/:profileId/resume",
  (req, res, next) => upload.single("file")(req, res, (err) => handleMulter(err, req, res, next)),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file?.buffer) {
        return res.status(400).json({ message: "file is required" });
      }
      if (!RESUME_MIME.test(file.mimetype || "") && !/\.(pdf|docx|txt)$/i.test(file.originalname || "")) {
        return res.status(400).json({ message: "Use PDF, DOCX, or TXT" });
      }

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      await migrateJobProfilesIfNeeded(user);

      const jp = profileSubdoc(user, req.params.profileId);
      if (!jp) return res.status(404).json({ message: "Profile not found" });

      let extracted = "";
      try {
        extracted = await extractResumeText(file.buffer, file.mimetype, file.originalname);
      } catch (e) {
        return res.status(400).json({ message: e.message || "Could not read file" });
      }

      if (jp.resumeFile?.key) {
        await deleteFileIfExists(jp.resumeFile.key);
      }

      const relKey = newStoredRelativeKey(user._id.toString(), jp._id.toString(), file.originalname);
      await writeFileEnsured(relKey, file.buffer);

      jp.resumeFile = {
        key: relKey,
        originalName: file.originalname || "",
        mimeType: file.mimetype || "",
        uploadedAt: new Date(),
        parsedTextLength: extracted.length
      };
      if (extracted.length > 0) {
        jp.resumeText = extracted.slice(0, 50000);
      }

      const parsed = parseResumeStructured(extracted);
      const ex = sanitizeExperiences(parsed.experiences);
      const uni = sanitizeUniversities(parsed.universities);
      if (ex.length) {
        jp.experiences = ex;
      }
      if (uni.length) {
        jp.universities = uni;
      }

      user.markModified("jobProfiles");
      await user.save();

      const idx = user.jobProfiles.findIndex((p) => p._id.equals(jp._id));
      res.json({
        message: "Resume uploaded",
        profile: mapJobProfileToClient(jp, idx < 0 ? 0 : idx),
        extractedChars: extracted.length,
        parsedExperiences: ex.length,
        parsedUniversities: uni.length
      });
    } catch (error) {
      res.status(500).json({ message: "Upload failed", error: error.message });
    }
  }
);

/** POST /api/auth/profile-files/:profileId/id-documents — multipart: files[] (or file), kind */
router.post(
  "/:profileId/id-documents",
  (req, res, next) =>
    uploadMulti.fields([
      { name: "files", maxCount: 20 },
      { name: "file", maxCount: 1 }
    ])(req, res, (err) => handleMulter(err, req, res, next)),
  async (req, res) => {
    try {
      const fileList = [...(req.files?.files || []), ...(req.files?.file || [])].filter(Boolean);
      if (!fileList.length) {
        return res.status(400).json({ message: "Add one or more files (field name: files)" });
      }

      const kind = String(req.body?.kind || "other").trim();
      if (!ID_KINDS.has(kind)) {
        return res.status(400).json({ message: "Invalid kind" });
      }

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      await migrateJobProfilesIfNeeded(user);

      const jp = profileSubdoc(user, req.params.profileId);
      if (!jp) return res.status(404).json({ message: "Profile not found" });

      let uploaded = 0;
      let skipped = 0;
      for (const file of fileList) {
        if ((jp.idDocuments || []).length >= 15) {
          skipped += fileList.length - uploaded;
          break;
        }
        if (!IMAGE_OR_PDF_MIME.test(file.mimetype || "")) {
          skipped++;
          continue;
        }
        const relKey = newStoredRelativeKey(user._id.toString(), jp._id.toString(), file.originalname);
        await writeFileEnsured(relKey, file.buffer);
        jp.idDocuments.push({
          kind,
          key: relKey,
          originalName: file.originalname || "",
          mimeType: file.mimetype || "",
          uploadedAt: new Date()
        });
        uploaded++;
      }

      user.markModified("jobProfiles");
      await user.save();

      const idx = user.jobProfiles.findIndex((p) => p._id.equals(jp._id));
      res.json({
        message:
          skipped > 0
            ? `Uploaded ${uploaded} file(s). ${skipped} skipped (invalid type or over limit).`
            : `Uploaded ${uploaded} ID document(s).`,
        uploaded,
        skipped,
        profile: mapJobProfileToClient(jp, idx < 0 ? 0 : idx)
      });
    } catch (error) {
      res.status(500).json({ message: "Upload failed", error: error.message });
    }
  }
);

/** POST /api/auth/profile-files/:profileId/other-documents — multipart: files[] (or file), category, label */
router.post(
  "/:profileId/other-documents",
  (req, res, next) =>
    uploadMulti.fields([
      { name: "files", maxCount: 25 },
      { name: "file", maxCount: 1 }
    ])(req, res, (err) => handleMulter(err, req, res, next)),
  async (req, res) => {
    try {
      const fileList = [...(req.files?.files || []), ...(req.files?.file || [])].filter(Boolean);
      if (!fileList.length) {
        return res.status(400).json({ message: "Add one or more files (field name: files)" });
      }

      const category = String(req.body?.category || "other").trim();
      if (!OTHER_CATS.has(category)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      const label = String(req.body?.label || "").trim().slice(0, 200);

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      await migrateJobProfilesIfNeeded(user);

      const jp = profileSubdoc(user, req.params.profileId);
      if (!jp) return res.status(404).json({ message: "Profile not found" });

      let uploaded = 0;
      let skipped = 0;
      for (const file of fileList) {
        if ((jp.otherDocuments || []).length >= 40) {
          skipped += fileList.length - uploaded;
          break;
        }
        if (!IMAGE_OR_PDF_MIME.test(file.mimetype || "")) {
          skipped++;
          continue;
        }
        const relKey = newStoredRelativeKey(user._id.toString(), jp._id.toString(), file.originalname);
        await writeFileEnsured(relKey, file.buffer);

        jp.otherDocuments.push({
          category,
          label,
          key: relKey,
          originalName: file.originalname || "",
          mimeType: file.mimetype || "",
          uploadedAt: new Date()
        });
        uploaded++;
      }

      user.markModified("jobProfiles");
      await user.save();

      const idx = user.jobProfiles.findIndex((p) => p._id.equals(jp._id));
      res.json({
        message:
          skipped > 0
            ? `Uploaded ${uploaded} file(s). ${skipped} skipped (invalid type or over limit).`
            : `Uploaded ${uploaded} document(s).`,
        uploaded,
        skipped,
        profile: mapJobProfileToClient(jp, idx < 0 ? 0 : idx)
      });
    } catch (error) {
      res.status(500).json({ message: "Upload failed", error: error.message });
    }
  }
);

/** DELETE stored resume file (does not clear resume text) */
router.delete("/:profileId/resume", async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const jp = profileSubdoc(user, req.params.profileId);
    if (!jp) return res.status(404).json({ message: "Profile not found" });
    if (jp.resumeFile?.key) {
      await deleteFileIfExists(jp.resumeFile.key);
    }
    jp.resumeFile = null;
    user.markModified("jobProfiles");
    await user.save();
    const idx = user.jobProfiles.findIndex((p) => p._id.equals(jp._id));
    res.json({ message: "Resume file removed", profile: mapJobProfileToClient(jp, idx < 0 ? 0 : idx) });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove file", error: error.message });
  }
});

router.delete("/:profileId/id-documents/:docId", async (req, res) => {
  try {
    const docId = req.params.docId;
    if (!mongoose.Types.ObjectId.isValid(docId)) {
      return res.status(400).json({ message: "Invalid document id" });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const jp = profileSubdoc(user, req.params.profileId);
    if (!jp) return res.status(404).json({ message: "Profile not found" });
    const doc = jp.idDocuments.id(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.key) await deleteFileIfExists(doc.key);
    jp.idDocuments.pull(docId);
    user.markModified("jobProfiles");
    await user.save();
    const idx = user.jobProfiles.findIndex((p) => p._id.equals(jp._id));
    res.json({ message: "Removed", profile: mapJobProfileToClient(jp, idx < 0 ? 0 : idx) });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove", error: error.message });
  }
});

router.delete("/:profileId/other-documents/:docId", async (req, res) => {
  try {
    const docId = req.params.docId;
    if (!mongoose.Types.ObjectId.isValid(docId)) {
      return res.status(400).json({ message: "Invalid document id" });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const jp = profileSubdoc(user, req.params.profileId);
    if (!jp) return res.status(404).json({ message: "Profile not found" });
    const doc = jp.otherDocuments.id(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.key) await deleteFileIfExists(doc.key);
    jp.otherDocuments.pull(docId);
    user.markModified("jobProfiles");
    await user.save();
    const idx = user.jobProfiles.findIndex((p) => p._id.equals(jp._id));
    res.json({ message: "Removed", profile: mapJobProfileToClient(jp, idx < 0 ? 0 : idx) });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove", error: error.message });
  }
});

/** GET file stream — type=resume | id | other */
router.get("/:profileId/files", async (req, res) => {
  try {
    const type = String(req.query.type || "");
    const docId = req.query.docId ? String(req.query.docId) : "";

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const jp = profileSubdoc(user, req.params.profileId);
    if (!jp) return res.status(404).json({ message: "Profile not found" });

    let key = "";
    let originalName = "file";
    let mimeType = "application/octet-stream";

    if (type === "resume") {
      if (!jp.resumeFile?.key) return res.status(404).json({ message: "No file" });
      key = jp.resumeFile.key;
      originalName = jp.resumeFile.originalName || "resume";
      mimeType = jp.resumeFile.mimeType || mimeType;
    } else if (type === "id") {
      if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
        return res.status(400).json({ message: "docId required" });
      }
      const d = jp.idDocuments.id(docId);
      if (!d) return res.status(404).json({ message: "Not found" });
      key = d.key;
      originalName = d.originalName || "id";
      mimeType = d.mimeType || mimeType;
    } else if (type === "other") {
      if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
        return res.status(400).json({ message: "docId required" });
      }
      const d = jp.otherDocuments.id(docId);
      if (!d) return res.status(404).json({ message: "Not found" });
      key = d.key;
      originalName = d.originalName || "document";
      mimeType = d.mimeType || mimeType;
    } else {
      return res.status(400).json({ message: "type must be resume, id, or other" });
    }

    const abs = absolutePathForKey(key);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${attachmentName(originalName)}`);
    createReadStream(abs).on("error", () => res.status(404).end()).pipe(res);
  } catch (error) {
    res.status(500).json({ message: "Download failed", error: error.message });
  }
});

export default router;
