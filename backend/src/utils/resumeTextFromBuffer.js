import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/**
 * Extract plain text from resume files (PDF, DOCX, TXT).
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} originalName
 */
export async function extractResumeText(buffer, mimeType, originalName) {
  const lower = (originalName || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();

  if (mt === "application/pdf" || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result?.text || "").trim();
    } finally {
      await parser.destroy?.();
    }
  }

  if (
    mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }

  if (mt === "text/plain" || lower.endsWith(".txt")) {
    return buffer.toString("utf8").trim();
  }

  throw new Error("Unsupported format. Use PDF, DOCX, or TXT.");
}
