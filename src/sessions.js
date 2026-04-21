/* ═══════════════════════════════════════════════════════════════════════════
   SESSIONS — persistent chat + pipeline state in localStorage
   A session captures everything needed to resume a resume run:
     inputs (job, notes, mode, provider), attachments (with base64),
     chat messages, structured profile, last generated output.
   ═══════════════════════════════════════════════════════════════════════════ */

const SESSIONS_KEY = "resumeforge_sessions";
const ACTIVE_SESSION_KEY = "resumeforge_active_session";
const SCHEMA_VERSION = 1;

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function listSessions() {
  const raw = localStorage.getItem(SESSIONS_KEY);
  const arr = safeParse(raw, []);
  if (!Array.isArray(arr)) return [];
  // Newest first
  return [...arr].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function getSession(id) {
  if (!id) return null;
  return listSessions().find((s) => s.id === id) || null;
}

export function getActiveSessionId() {
  return localStorage.getItem(ACTIVE_SESSION_KEY) || "";
}

export function setActiveSessionId(id) {
  if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id);
  else localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function writeAll(sessions) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    return true;
  } catch (err) {
    // Likely QuotaExceededError — surface to caller
    throw new Error(
      "Storage full. Remove old sessions or attachments and try again."
    );
  }
}

export function createSession(initial = {}) {
  const now = new Date().toISOString();
  const id = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    id,
    schema: SCHEMA_VERSION,
    name: initial.name || "Untitled session",
    createdAt: now,
    updatedAt: now,
    provider: initial.provider || "anthropic",
    questionMode: initial.questionMode || "standard",
    jobInput: initial.jobInput || "",
    notes: initial.notes || "",
    attachments: initial.attachments || [],
    messages: initial.messages || [],
    profile: initial.profile || emptyProfile(),
    chatContext: initial.chatContext || "",
    output: initial.output || null,
  };
  const all = listSessions();
  all.push(session);
  writeAll(all);
  setActiveSessionId(id);
  return session;
}

export function updateSession(id, patch) {
  if (!id) return null;
  const all = listSessions();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

export function deleteSession(id) {
  const all = listSessions().filter((s) => s.id !== id);
  writeAll(all);
  if (getActiveSessionId() === id) setActiveSessionId("");
}

export function renameSession(id, name) {
  return updateSession(id, { name: (name || "").trim() || "Untitled session" });
}

/** Derive a friendly auto-name from inputs. */
export function deriveSessionName({ jobInput, attachments }) {
  const job = (jobInput || "").trim();
  if (job) {
    const firstLine = job.split("\n")[0].trim();
    return firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine;
  }
  if (attachments?.[0]?.name) return attachments[0].name;
  return `Session ${new Date().toLocaleString()}`;
}

/* ── Structured profile (the "knowledge base") ──────────────────────────── */
export function emptyProfile() {
  return {
    personal: {},          // { fullName, email, phone, location, linkedin, github, website }
    targetRole: "",
    summary: "",
    experience: [],        // [{ company, title, location, start, end, achievements: [], tech: [] }]
    education: [],         // [{ degree, school, year, gpa, coursework: [] }]
    skills: {},            // { category: [items] }
    projects: [],          // [{ name, description, tech: [], outcomes: [] }]
    certifications: [],    // [{ name, issuer, year }]
    achievements: [],      // [string]
    preferences: {},       // tone, sections to emphasize, etc.
  };
}

/**
 * Deep-merge a partial profile update into the current profile.
 * Arrays are appended with naive de-duplication; objects are shallow-merged.
 */
export function mergeProfile(current, update) {
  const base = current ? { ...emptyProfile(), ...current } : emptyProfile();
  if (!update || typeof update !== "object") return base;

  const out = { ...base };

  if (update.personal && typeof update.personal === "object") {
    out.personal = { ...base.personal, ...stripEmpty(update.personal) };
  }
  if (typeof update.targetRole === "string" && update.targetRole.trim()) {
    out.targetRole = update.targetRole.trim();
  }
  if (typeof update.summary === "string" && update.summary.trim()) {
    out.summary = update.summary.trim();
  }
  if (Array.isArray(update.experience)) {
    out.experience = mergeArrayBy(base.experience, update.experience, (x) =>
      `${(x.company || "").toLowerCase()}|${(x.title || "").toLowerCase()}|${x.start || ""}`
    );
  }
  if (Array.isArray(update.education)) {
    out.education = mergeArrayBy(base.education, update.education, (x) =>
      `${(x.school || "").toLowerCase()}|${(x.degree || "").toLowerCase()}`
    );
  }
  if (update.skills && typeof update.skills === "object") {
    out.skills = { ...base.skills };
    for (const [cat, items] of Object.entries(update.skills)) {
      const list = Array.isArray(items) ? items : [items];
      const existing = Array.isArray(out.skills[cat]) ? out.skills[cat] : [];
      out.skills[cat] = dedupCaseInsensitive([...existing, ...list]);
    }
  }
  if (Array.isArray(update.projects)) {
    out.projects = mergeArrayBy(base.projects, update.projects, (x) =>
      (x.name || "").toLowerCase()
    );
  }
  if (Array.isArray(update.certifications)) {
    out.certifications = mergeArrayBy(base.certifications, update.certifications, (x) =>
      `${(x.name || "").toLowerCase()}|${(x.issuer || "").toLowerCase()}`
    );
  }
  if (Array.isArray(update.achievements)) {
    out.achievements = dedupCaseInsensitive([
      ...base.achievements,
      ...update.achievements.filter((s) => typeof s === "string" && s.trim()),
    ]);
  }
  if (update.preferences && typeof update.preferences === "object") {
    out.preferences = { ...base.preferences, ...stripEmpty(update.preferences) };
  }

  return out;
}

function stripEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    out[k] = v;
  }
  return out;
}

function dedupCaseInsensitive(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function mergeArrayBy(existing, incoming, keyFn) {
  const map = new Map();
  for (const item of existing || []) {
    if (!item || typeof item !== "object") continue;
    map.set(keyFn(item), item);
  }
  for (const item of incoming || []) {
    if (!item || typeof item !== "object") continue;
    const k = keyFn(item);
    if (map.has(k)) {
      const prev = map.get(k);
      map.set(k, deepMergeShallow(prev, item));
    } else {
      map.set(k, item);
    }
  }
  return [...map.values()];
}

function deepMergeShallow(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (Array.isArray(v)) {
      const prev = Array.isArray(a[k]) ? a[k] : [];
      out[k] = dedupCaseInsensitive([
        ...prev.map(String),
        ...v.map(String),
      ]);
    } else if (v && typeof v === "object") {
      out[k] = { ...(a[k] || {}), ...v };
    } else if (v != null && v !== "") {
      out[k] = v;
    }
  }
  return out;
}

/** Format the profile for inclusion in a prompt. */
export function profileToPromptBlock(profile) {
  if (!profile) return "";
  const lines = [];
  const p = profile.personal || {};
  if (Object.keys(p).length) {
    lines.push("PERSONAL:");
    for (const [k, v] of Object.entries(p)) lines.push(`  ${k}: ${v}`);
  }
  if (profile.targetRole) lines.push(`TARGET ROLE: ${profile.targetRole}`);
  if (profile.summary) lines.push(`SUMMARY: ${profile.summary}`);
  if (profile.experience?.length) {
    lines.push("EXPERIENCE:");
    profile.experience.forEach((e, i) => {
      lines.push(
        `  [${i + 1}] ${e.title || "Role"} @ ${e.company || "?"} (${e.start || "?"} – ${e.end || "Present"}) ${e.location ? "— " + e.location : ""}`
      );
      (e.achievements || []).forEach((a) => lines.push(`      • ${a}`));
      if (e.tech?.length) lines.push(`      tech: ${e.tech.join(", ")}`);
    });
  }
  if (profile.education?.length) {
    lines.push("EDUCATION:");
    profile.education.forEach((e) =>
      lines.push(
        `  • ${e.degree || "Degree"} — ${e.school || "?"} ${e.year ? "(" + e.year + ")" : ""}${e.gpa ? " GPA " + e.gpa : ""}`
      )
    );
  }
  if (profile.skills && Object.keys(profile.skills).length) {
    lines.push("SKILLS:");
    for (const [cat, items] of Object.entries(profile.skills)) {
      lines.push(`  ${cat}: ${(items || []).join(", ")}`);
    }
  }
  if (profile.projects?.length) {
    lines.push("PROJECTS:");
    profile.projects.forEach((pr) => {
      lines.push(`  • ${pr.name}${pr.description ? " — " + pr.description : ""}`);
      if (pr.tech?.length) lines.push(`    tech: ${pr.tech.join(", ")}`);
      (pr.outcomes || []).forEach((o) => lines.push(`    outcome: ${o}`));
    });
  }
  if (profile.certifications?.length) {
    lines.push("CERTIFICATIONS:");
    profile.certifications.forEach((c) =>
      lines.push(`  • ${c.name}${c.issuer ? " — " + c.issuer : ""}${c.year ? " (" + c.year + ")" : ""}`)
    );
  }
  if (profile.achievements?.length) {
    lines.push("ACHIEVEMENTS:");
    profile.achievements.forEach((a) => lines.push(`  • ${a}`));
  }
  if (profile.preferences && Object.keys(profile.preferences).length) {
    lines.push("PREFERENCES:");
    for (const [k, v] of Object.entries(profile.preferences)) lines.push(`  ${k}: ${v}`);
  }
  return lines.join("\n");
}
