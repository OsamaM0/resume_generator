/* ═══════════════════════════════════════════════════════════════════════════
   ATTACHMENTS — multi-format file ingestion
   Supports: PDF, images (PNG/JPG/WEBP/GIF), Word (.docx), plain text/markdown
   Each attachment is stored as a normalized object:
     { id, name, kind, mediaType, size, base64?, text?, addedAt }
   ═══════════════════════════════════════════════════════════════════════════ */

import mammoth from "mammoth/mammoth.browser";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;          // 10 MB per file
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024;         // 25 MB across all files

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const TEXT_TYPES = new Set(["text/plain", "text/markdown"]);

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fileToText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });

const fileToArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

/**
 * Convert a File into a normalized attachment record.
 * Returns { ok: true, attachment } or { ok: false, error }.
 */
export async function processFile(file) {
  if (!file) return { ok: false, error: "No file provided." };
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `${file.name}: file too large (max 10 MB).` };
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const base = {
    id,
    name: file.name,
    size: file.size,
    addedAt: new Date().toISOString(),
  };

  try {
    // PDF
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const base64 = await fileToBase64(file);
      return {
        ok: true,
        attachment: { ...base, kind: "pdf", mediaType: "application/pdf", base64 },
      };
    }

    // Word .docx — extract text (we don't ship native .doc support)
    if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx$/i.test(file.name)
    ) {
      const buf = await fileToArrayBuffer(file);
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      const text = (result?.value || "").trim();
      if (!text) {
        return { ok: false, error: `${file.name}: no extractable text in DOCX.` };
      }
      return {
        ok: true,
        attachment: {
          ...base,
          kind: "docx",
          mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          text,
        },
      };
    }

    // Legacy .doc — not supported reliably client-side
    if (file.type === "application/msword" || /\.doc$/i.test(file.name)) {
      return {
        ok: false,
        error: `${file.name}: legacy .doc not supported. Please save as .docx or PDF.`,
      };
    }

    // Images
    if (IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      const base64 = await fileToBase64(file);
      const mediaType = file.type === "image/jpg" ? "image/jpeg" : file.type || "image/png";
      return {
        ok: true,
        attachment: { ...base, kind: "image", mediaType, base64 },
      };
    }

    // Plain text / markdown
    if (TEXT_TYPES.has(file.type) || /\.(txt|md|markdown)$/i.test(file.name)) {
      const text = (await fileToText(file)).trim();
      if (!text) return { ok: false, error: `${file.name}: empty text file.` };
      return {
        ok: true,
        attachment: {
          ...base,
          kind: "text",
          mediaType: file.type || "text/plain",
          text,
        },
      };
    }

    return {
      ok: false,
      error: `${file.name}: unsupported type. Use PDF, DOCX, image, or text.`,
    };
  } catch (err) {
    return { ok: false, error: `${file.name}: ${err.message || "failed to read file"}` };
  }
}

/**
 * Build provider-specific content blocks for the user message that
 * should accompany a prompt. Returns an array of blocks ready to be
 * concatenated with a final {type:"text"} block.
 */
export function buildContentBlocks(attachments, providerId) {
  const blocks = [];
  const inlineTextParts = [];

  for (const a of attachments || []) {
    if (a.kind === "pdf") {
      if (providerId === "anthropic") {
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: a.base64 },
        });
      } else {
        // OpenAI Responses-style file input (gpt-4o supports PDF via file blocks)
        blocks.push({
          type: "file",
          file: {
            filename: a.name,
            file_data: `data:application/pdf;base64,${a.base64}`,
          },
        });
      }
    } else if (a.kind === "image") {
      if (providerId === "anthropic") {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: a.mediaType, data: a.base64 },
        });
      } else {
        blocks.push({
          type: "image_url",
          image_url: { url: `data:${a.mediaType};base64,${a.base64}` },
        });
      }
    } else if (a.kind === "docx" || a.kind === "text") {
      inlineTextParts.push(
        `--- BEGIN ATTACHED DOCUMENT: ${a.name} (${a.kind.toUpperCase()}) ---\n${a.text}\n--- END ATTACHED DOCUMENT: ${a.name} ---`
      );
    }
  }

  return { blocks, inlineText: inlineTextParts.join("\n\n") };
}

/** Human-readable summary for prompts / UI badges. */
export function summarizeAttachments(attachments) {
  if (!attachments?.length) return "";
  return attachments
    .map((a) => `• ${a.name} (${a.kind}, ${(a.size / 1024).toFixed(1)} KB)`)
    .join("\n");
}

export function totalAttachmentSize(attachments) {
  return (attachments || []).reduce((s, a) => s + (a.size || 0), 0);
}
