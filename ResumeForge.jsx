import { useState, useRef, useEffect, useMemo } from "react";
import ChatBot from "./src/ChatBot.jsx";
import {
  processFile,
  buildContentBlocks,
  totalAttachmentSize,
  MAX_TOTAL_SIZE,
} from "./src/attachments.js";
import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  renameSession,
  getActiveSessionId,
  setActiveSessionId,
  deriveSessionName,
  emptyProfile,
  profileToPromptBlock,
} from "./src/sessions.js";

/* ═══════════════════════════════════════════════════════════════════════════
   PROVIDER CONFIGURATION
   ═══════════════════════════════════════════════════════════════════════════ */
const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    model: import.meta.env.VITE_ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || "",
    endpoint: "https://api.anthropic.com/v1/messages",
    maxTokens: 16384,
  },
  openai: {
    id: "openai",
    label: "OpenAI GPT",
    model: import.meta.env.VITE_OPENAI_MODEL || "gpt-5-mini",
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || "",
    endpoint: "https://api.openai.com/v1/chat/completions",
    maxTokens: 16384,
  },
};

const DEFAULT_PROVIDER = import.meta.env.VITE_DEFAULT_PROVIDER || "anthropic";

/* ═══════════════════════════════════════════════════════════════════════════
   ADVANCED ATS-OPTIMIZED SYSTEM PROMPT
   ═══════════════════════════════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `You are a world-class resume engineer, ATS (Applicant Tracking System) reverse-engineering specialist, and career strategist with 20+ years of experience placing candidates at FAANG, Fortune 100, top startups, and elite consulting firms globally.

You have deep expertise in how the following ATS platforms parse, score, and rank resumes:
• Taleo (Oracle) — keyword density scoring, section header matching
• Workday — structured field extraction, skills taxonomy matching
• Greenhouse — scorecard alignment, keyword frequency analysis
• Lever — resume parsing + manual reviewer optimization
• iCIMS — Boolean search matching, knockout question alignment
• BambooHR, Bullhorn, SmartRecruiters, Jobvite, SAP SuccessFactors

─────────────────────────────────────────────
MISSION: Produce a COMPLETE, perfectly ATS-optimized LaTeX resume that will:
1. Score 95%+ on automated ATS keyword matching
2. Pass all automated parsing without data loss
3. Impress human reviewers in the 6-second scan
4. Survive PDF-to-text extraction with zero formatting corruption
─────────────────────────────────────────────

OUTPUT FORMAT — respond in exactly three labeled sections:

## ATS_ANALYSIS
Target Role: [exact role name from input]
ATS Match Score: [X% — be specific, based on keyword coverage]
Primary Keywords Matched: [top 10-15 hard-skill keywords from JD, comma-separated]
Secondary Keywords Matched: [soft skills, methodologies, tools mentioned in JD]
Missing/Weak Areas: [any JD requirements not fully covered — be honest]
Seniority Alignment: [Junior / Mid / Senior / Lead / Staff / Principal / Director / VP / Executive]
Industry Match: [specific domain — e.g., "FinTech", "Healthcare SaaS", "AdTech"]
Parse Safety Score: [10/10 — our LaTeX template is ATS-safe]
Keyword Density Analysis: [primary keywords appear X times across resume]
Recommendations: [2-3 specific things the candidate should manually verify or customize]

## LATEX_CODE
[Full LaTeX document from \\documentclass to \\end{document}]

## TIPS
• [Tip 1: specific customization for this exact role/company — mention company name if known]
• [Tip 2: what to personalize before sending — be specific about which sections]
• [Tip 3: one strategic thing that will make this resume stand out to HUMAN reviewers]
• [Tip 4: LinkedIn/GitHub optimization tip that complements this resume]
• [Tip 5: cover letter angle that reinforces the resume narrative]

─────────────────────────────────────────────
ATS REVERSE-ENGINEERING RULES (CRITICAL — follow ALL):
─────────────────────────────────────────────

1. KEYWORD INJECTION STRATEGY:
   • Extract EVERY hard skill, tool, technology, methodology, and certification from the JD
   • Place each primary keyword at least 2-3 times across different sections (summary, skills, experience, projects)
   • Use EXACT phrasing from the JD — do NOT paraphrase ("cross-functional collaboration" stays as-is, not "working with different teams")
   • Include BOTH the acronym AND the full form: "Natural Language Processing (NLP)", "Amazon Web Services (AWS)", "Continuous Integration/Continuous Deployment (CI/CD)"
   • Front-load keywords: the first 1/3 of the resume carries 60% of ATS weight
   • Include keyword variations: "machine learning" + "ML" + "machine-learning" (hyphenated forms)

2. SECTION NAMING — use ONLY these ATS-recognized headers (case-sensitive):
   • "Professional Summary" (NOT "About Me", "Profile", "Objective")
   • "Work Experience" or "Professional Experience" (NOT "Career History", "Employment")
   • "Education" (NOT "Academic Background")
   • "Technical Skills" or "Skills" (NOT "Competencies", "Expertise")
   • "Projects" or "Key Projects" (NOT "Portfolio", "Work Samples")
   • "Certifications" (NOT "Credentials", "Licenses")
   • "Achievements" or "Key Achievements" (NOT "Accomplishments", "Awards")

3. STRUCTURAL OPTIMIZATION FOR ATS PARSING:
   • Single-column layout ONLY — ATS cannot reliably parse multi-column
   • No text boxes, graphics, icons, or images
   • No headers/footers for critical content (some ATS skip them)
   • Contact info in the main body, not in page headers
   • Dates in consistent format: "Month Year -- Present" or "Month Year -- Month Year"
   • Use standard bullet characters (\\item), no custom symbols
   • \\pdfgentounicode=1 ensures Unicode mapping for text extraction
   • Every \\href must also show the URL text (ATS may strip hyperlinks)
   • Logical reading order: left-to-right, top-to-bottom

4. BULLET POINT ENGINEERING (CAR Framework):
   • Every bullet follows: [Power Verb] + [What You Built/Did] + [Technology/Method Used] + [Quantified Business Impact]
   • MINIMUM 3 metrics per job entry (%, $, time, count, scale, accuracy, throughput)
   • Power verbs by seniority:
     - Junior: Developed, Implemented, Built, Created, Designed, Automated
     - Mid: Architected, Engineered, Optimized, Spearheaded, Streamlined, Orchestrated
     - Senior: Led, Directed, Pioneered, Transformed, Scaled, Established
     - Lead/Principal: Drove, Championed, Defined, Mentored, Governed, Standardized
     - Executive: Shaped, Envisioned, Steered, Secured, Evangelized
   • BANNED phrases (ATS red flags + weak language):
     "responsible for", "helped with", "worked on", "assisted in", "various", "etc.",
     "I", "my", "duties included", "tasked with", "participated in", "was involved in",
     "utilizing", "leveraging" (overused), "synergy", "dynamic", "self-starter", "team player"

5. PROFESSIONAL SUMMARY OPTIMIZATION:
   • Exactly 3-4 sentences, 50-70 words
   • Sentence 1: [Title] + [Years] + [Core Expertise] — mirrors JD title EXACTLY
   • Sentence 2: [Domain Specialization] + [Key Technologies from JD] + [Scale]
   • Sentence 3: [Biggest Quantified Achievement] + [Business Impact]
   • Sentence 4 (optional): [Unique differentiator or leadership angle]
   • This section is the #1 ATS scoring zone — pack it with primary keywords

6. SKILLS SECTION OPTIMIZATION:
   • Minimum 6 categories, each with 6-10 items
   • Categories ordered by JD relevance (most important first)
   • Category names from: Languages, Frameworks, Cloud & Infrastructure, Databases, DevOps & CI/CD,
     Machine Learning & AI, Data Engineering, Monitoring & Observability, Testing, Methodologies,
     Product & Design, Business Intelligence, Security, Mobile, Blockchain (pick relevant ones)
   • Include ALL tools/technologies from JD + industry-standard adjacent tools
   • This section acts as a keyword bank — every item here gets ATS-indexed

7. EXPERIENCE SECTION OPTIMIZATION:
   • Reverse-chronological order (most recent first)
   • 3-5 positions, each with: Company Name, Location, Job Title, Date Range
   • CRITICAL: \\resumeSubheading takes EXACTLY 4 brace arguments: {arg1}{arg2}{arg3}{arg4}
     Each argument is a SINGLE SHORT STRING inside braces. NEVER put \\\\, \\par, \\resumeItemListStart,
     or any other commands inside these 4 brace arguments. Close all 4 braces BEFORE \\resumeItemListStart.
   • Each position uses a nested project structure. The EXACT LaTeX pattern is:

     \\resumeSubheading{Company Name}{City, Country}{Job Title}{Mon YYYY -- Present}
       \\resumeItemListStart
         \\resumeItem{\\textbf{PROJECT NAME: Brief Description of the Project}}
           \\resumeItemListStart
             \\resumeItem{Detailed accomplishment bullet with metrics and technologies}
             \\resumeItem{Another accomplishment bullet with quantified impact}
             \\resumeItem{Third bullet highlighting scale, performance, or business outcome}
           \\resumeItemListEnd
         \\resumeItem{\\textbf{ANOTHER PROJECT: Brief Description}}
           \\resumeItemListStart
             \\resumeItem{Accomplishment bullet}
             \\resumeItem{Accomplishment bullet}
           \\resumeItemListEnd
       \\resumeItemListEnd

   • NEVER put descriptions, paragraphs, or extra text inside {arg1}, {arg2}, {arg3}, or {arg4} of \\resumeSubheading.
     Wrong: \\resumeSubheading{Company Name}{Construction and real estate company \\\\ City}{...}{...}
     Right: \\resumeSubheading{Company Name}{City, Country}{Job Title}{Mon YYYY -- Present}
   • Project names should be descriptive: "SPECKY: API Development for Education Platforms" not "Project Alpha"
   • Present tense for current role, past tense for all others
   • Each bullet: 1-2 lines, never more than 3 lines
   • EVERY bullet must contain at least one technology/tool name from the JD

8. EDUCATION SECTION:
   • Degree, Major, University Name, Graduation Year
   • Include GPA only if > 3.5/4.0 or top 10%
   • Relevant coursework only if < 3 years experience
   • Honors, Dean's List, scholarships if impressive

9. PROJECTS SECTION (keyword amplification zone):
   • 3-4 projects, each with descriptive bold title + 2-3 bullets
   • Use this section to inject remaining JD keywords not covered in experience
   • Each project: what it does + tech stack + quantified outcome
   • Include GitHub/demo links where applicable

10. CERTIFICATIONS SECTION:
    • Only include certifications relevant to the target role
    • Format: "Certification Name — Issuing Organization (Year)"
    • Priority: AWS, GCP, Azure, Kubernetes (CKA/CKAD), PMP, Scrum Master, etc.
    • If candidate has no certs, suggest 2-3 they should get (as comments in LaTeX)

11. ACHIEVEMENTS SECTION:
    • 4-6 quantified achievements with bold category labels
    • Format: "\\textbf{Category}: Achievement with specific numbers"
    • Categories: Performance, Scale, Cost Savings, Innovation, Leadership, Recognition

12. CONTENT GENERATION RULES:
    • If a STRUCTURED PROFILE is provided (from chat), TREAT IT AS GROUND TRUTH for facts. Do NOT invent contradictory data.
    • If documents are provided (PDF / image / DOCX), extract ALL content and ENHANCE every bullet with stronger verbs, metrics, and JD keywords. Cross-reference with the structured profile.
    • If no source data: generate REALISTIC, PLAUSIBLE example content with a "% EXAMPLE — REPLACE" comment on a SEPARATE LINE above every generated entry (never inline inside \\resumeItem{})
    • If notes provide personal info (name, email, phone, LinkedIn, GitHub): use them exactly
    • If no personal info: use [YOUR NAME], [your.email@domain.com], [Your Phone], [linkedin.com/in/yourprofile], [github.com/yourusername]
    • Never invent specific company names unless provided; use [Company Name] placeholders
    • Never fabricate specific degree institutions unless provided; use [University Name]

13. CRITICAL — LATEX SPECIAL CHARACTER ESCAPING (violations cause compile errors):
    • & → \\& in ALL text content (company names, bullet text, skills). Bare & is ONLY for tabular column separators.
    • % → \\% in ALL text content. Bare % means "start of comment" — the rest of the line will vanish!
    • $ → \\$ for currency amounts (e.g., \\$1.2M). Bare $ toggles math mode.
    • # → \\# in all text. Bare # is only for macro parameters in \\newcommand.
    • _ → \\_ in text. Bare _ is only for subscripts in math mode.
    • WRONG: \\resumeItem{Saved company $500K by reducing R&D costs by 25%}
    • RIGHT: \\resumeItem{Saved company \\$500K by reducing R\\&D costs by 25\\%}

─────────────────────────────────────────────
LATEX TEMPLATE STRUCTURE:
─────────────────────────────────────────────

\\documentclass[a4paper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{xcolor}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{fontawesome5}
\\input{glyphtounicode}
\\pagestyle{fancy}\\fancyhf{}\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.6in}\\addtolength{\\evensidemargin}{-0.6in}
\\addtolength{\\textwidth}{1.2in}\\addtolength{\\topmargin}{-.7in}\\addtolength{\\textheight}{1.4in}
\\urlstyle{same}\\raggedbottom\\raggedright\\setlength{\\tabcolsep}{0in}
\\definecolor{linkblue}{HTML}{0077B5}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\pdfgentounicode=1
\\newcommand{\\resumeItem}[1]{\\item\\small{#1 \\vspace{-2pt}}}
% \\resumeSubheading takes exactly 4 short args: {Company}{Location}{Title}{Dates} — no \\\\ or commands inside these braces!
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\\\textit{\\small#3} & \\textit{\\small #4}\\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2\\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

SECTIONS TO INCLUDE (in this exact order):
1. Contact Info (centered: name big + phone | email | LinkedIn | GitHub | location on one line)
2. Professional Summary (3-4 keyword-dense sentences)
3. Technical Skills (6+ categories × 6-10 tools, ordered by JD relevance — this is the ATS keyword bank)
4. Work Experience (3-5 roles, reverse-chronological, project sub-headings, quantified bullets)
5. Education (degrees, relevant coursework if junior)
6. Key Projects (3-4 projects with tech stacks and metrics)
7. Certifications (most relevant to target role)
8. Key Achievements (4-6 bold-labeled quantified wins)

─────────────────────────────────────────────
QUALITY CHECKLIST (verify before outputting):
─────────────────────────────────────────────
□ Every JD keyword appears at least twice in the resume
□ Professional Summary mirrors the exact JD title
□ Every bullet has a quantified metric
□ No banned phrases used anywhere
□ Section headers are ATS-standard names
□ Dates are consistent format throughout
□ Skills section covers all JD requirements
□ LaTeX compiles without errors
□ All special characters escaped in text: & → \\&, % → \\%, $ → \\$, # → \\#, _ → \\_
□ Single-column, no graphics, ATS-parse-safe
□ Total resume length: 1-2 pages (senior+: 2 pages OK)
□ \\pdfgentounicode=1 is included for Unicode extraction
□ All hyperlinks show visible URL text`;

/* ═══════════════════════════════════════════════════════════════════════════
   USER PROMPT BUILDER
   ═══════════════════════════════════════════════════════════════════════════ */
const buildUserPrompt = (jobInput, notes, attachments, chatContext = "", profile = null) => {
  const sections = [];

  const hasDocs = (attachments || []).some(
    (a) => a.kind === "pdf" || a.kind === "image"
  );
  const hasInline = (attachments || []).some(
    (a) => a.kind === "docx" || a.kind === "text"
  );

  if (hasDocs || hasInline) {
    const list = (attachments || [])
      .map((a) => `• ${a.name} (${a.kind})`)
      .join("\n");
    sections.push(`SOURCE DOCUMENTS — extract & enhance:
${list}

You MUST:
1. Extract EVERY piece of information from the attached documents (PDFs / images / DOCX text below).
2. Cross-reference with the structured profile if provided — profile values override conflicting OCR/extraction errors.
3. Preserve all factual content (dates, company names, titles, metrics) exactly as written.
4. ENHANCE every bullet point: stronger power verbs, JD keywords injected naturally, quantified metrics added/improved, restructured to CAR format.
5. Re-order skills sections to prioritize JD-relevant technologies.
6. If a metric is weak or missing, infer a realistic one based on role/project scope and mark with a LaTeX comment on its OWN SEPARATE LINE above the item: % VERIFY: [reason]. NEVER put % VERIFY inside \\resumeItem{} text — it will break compilation.
7. Add any JD-required skills the candidate likely has (inferred from their experience) that are missing.`);

    // Append inline DOCX/text content here
    const inlineParts = (attachments || [])
      .filter((a) => a.kind === "docx" || a.kind === "text")
      .map((a) => `--- BEGIN ${a.name} (${a.kind.toUpperCase()}) ---\n${a.text}\n--- END ${a.name} ---`);
    if (inlineParts.length) {
      sections.push("EXTRACTED DOCUMENT TEXT:\n" + inlineParts.join("\n\n"));
    }
  } else {
    sections.push(`NO SOURCE DOCUMENTS — GENERATION MODE:
Generate realistic, plausible example content for a strong candidate at the appropriate seniority level.
Mark EVERY generated entry with a LaTeX comment on its OWN SEPARATE LINE above the entry: % EXAMPLE — REPLACE WITH YOUR REAL EXPERIENCE. NEVER put this marker inside \\resumeItem{} text.
Generate 4-5 job positions with realistic progression, each with project sub-headings and quantified bullets.`);
  }

  if (profile && profileToPromptBlock(profile)) {
    sections.push(`STRUCTURED PROFILE (GROUND TRUTH — derived from chat & documents):
${profileToPromptBlock(profile)}

Use this profile as the authoritative source for facts. Place each item in its correct resume section.`);
  }

  sections.push(`TARGET ROLE / JOB DESCRIPTION:
${jobInput?.trim() || "Not specified — infer the best possible role from any context available, or generate a strong Senior Software Engineer resume as default"}`);

  sections.push(`ADDITIONAL PERSONAL NOTES / INFO:
${notes?.trim() || "None provided"}`);

  if (chatContext) {
    sections.push(`CAREER ADVISOR INTERVIEW — CRITICAL CONTEXT:
The candidate completed a detailed interview with our career advisor before this generation.
Use ALL information from this transcript to make the resume as personalized and accurate as possible.
Prioritize information from this interview over generic assumptions.

${chatContext}`);
  }

  sections.push(`FINAL INSTRUCTIONS:
1. Generate the COMPLETE LaTeX document — from \\documentclass to \\end{document}
2. Include ALL preamble packages from the template
3. Ensure the resume would score 95%+ on ATS keyword matching against the provided JD
4. Every bullet MUST have a quantified metric (%, $, time, count, scale)
5. Skills section must cover ALL technologies/tools mentioned in the JD
6. Use both acronyms and full forms for all technical terms
7. Professional Summary must mirror the EXACT job title from the JD
8. Output must compile cleanly in Overleaf with no errors

CRITICAL — LATEX SPECIAL CHARACTER ESCAPING:
You MUST escape ALL special characters in text content. LaTeX will FAIL to compile if you don't:
• & must be written as \\& in ALL text (company names, bullets, skills). Only use bare & inside tabular column specs.
• % must be written as \\% in ALL text content. Only use bare % for LaTeX comments (lines starting with %).
  - WRONG: "reduced costs by 30%" inside \\resumeItem → causes everything after % to be treated as comment
  - RIGHT: "reduced costs by 30\\%" inside \\resumeItem
• $ must be written as \\$ when referring to currency (e.g., \\$1.2M savings). Only use bare $ for math mode.
• # must be written as \\# in text. Only use bare # inside \\newcommand definitions for parameters.
• _ must be written as \\_ in text unless inside math mode or \\href URLs.
• { and } are only for LaTeX grouping. In text use \\{ and \\}.
• ~ is a non-breaking space in LaTeX. Use \\textasciitilde{} if you need a literal tilde in text.
• ^ is superscript. Use \\textasciicircum{} if you need a literal caret in text.
DOUBLE CHECK: Before outputting, scan every \\resumeItem, \\textbf, and heading for unescaped &, %, $, #, _ characters.`);

  return sections.join("\n\n");
};

/* ═══════════════════════════════════════════════════════════════════════════
   LATEX SANITIZER
   ═══════════════════════════════════════════════════════════════════════════ */
const sanitizeLatex = (latex) => {
  if (!latex) return latex;
  const lines = latex.split("\n");
  const sanitized = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("%")) return line;
    if (/^\\(documentclass|usepackage|begin|end|newcommand|renewcommand|setlength|addtolength|definecolor|titleformat|pagestyle|fancyhf|fancyfoot|urlstyle|raggedbottom|raggedright|pdfgentounicode|input|section|resumeSubHeadingListStart|resumeSubHeadingListEnd|resumeItemListStart|resumeItemListEnd)\b/.test(trimmed)) {
      return line;
    }

    let result = "";
    let i = 0;
    while (i < line.length) {
      if (line[i] === "\\" && i + 1 < line.length) {
        result += line[i] + line[i + 1];
        i += 2;
        continue;
      }
      if (line[i] === "&") {
        if (/\\begin\{tabular/.test(line) || /\\extracolsep/.test(line) || /l@\{/.test(line)) {
          result += "&";
        } else {
          result += "\\&";
        }
        i++;
        continue;
      }
      if (line[i] === "%") {
        const before = line.substring(0, i);
        const isInTextContent = /\\resumeItem\{|\\textbf\{|\\text/.test(before) &&
          (before.match(/\{/g) || []).length > (before.match(/\}/g) || []).length;
        if (isInTextContent) result += "\\%"; else result += "%";
        i++;
        continue;
      }
      if (line[i] === "#") {
        const before = line.substring(0, i);
        const isInDefinition = /\\newcommand|\\renewcommand/.test(line);
        if (!isInDefinition) {
          const isInTextContent = /\\resumeItem\{|\\textbf\{/.test(before) &&
            (before.match(/\{/g) || []).length > (before.match(/\}/g) || []).length;
          if (isInTextContent) { result += "\\#"; i++; continue; }
        }
        result += "#"; i++; continue;
      }
      if (line[i] === "$") {
        const before = line.substring(0, i);
        const isInTextContent = /\\resumeItem\{|\\textbf\{/.test(before) &&
          (before.match(/\{/g) || []).length > (before.match(/\}/g) || []).length;
        if (isInTextContent && /\d/.test(line[i + 1])) { result += "\\$"; i++; continue; }
        result += "$"; i++; continue;
      }
      result += line[i];
      i++;
    }
    return result;
  });
  return sanitized.join("\n");
};

/* ═══════════════════════════════════════════════════════════════════════════
   API CALLERS — generic content blocks already prepared by attachments helper
   ═══════════════════════════════════════════════════════════════════════════ */
const callAnthropic = async (provider, systemPrompt, userContent) => {
  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: provider.model,
      max_completion_tokens: provider.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Anthropic API error");
  return data.content?.map((b) => b.text || "").join("") || "";
};

const callOpenAI = async (provider, systemPrompt, userContent) => {
  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      max_completion_tokens: provider.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "OpenAI API error");
  return data.choices?.[0]?.message?.content || "";
};

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function ResumeForge() {
  const [view, setView] = useState("input"); // input | sessions | chat | generating | output
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [jobInput, setJobInput] = useState("");
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState([]); // [{id, name, kind, mediaType, base64?, text?}]
  const [dragOver, setDragOver] = useState(false);
  const [output, setOutput] = useState({ ats: "", latex: "", tips: "" });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chatContext, setChatContext] = useState("");
  const [questionMode, setQuestionMode] = useState("standard");
  const [profile, setProfile] = useState(emptyProfile());
  const [chatMessages, setChatMessages] = useState([]); // persisted chat history
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const fileRef = useRef();
  const progressRef = useRef();

  /* ── load sessions list & restore active session on mount ── */
  useEffect(() => {
    setSessions(listSessions());
    const activeId = getActiveSessionId();
    if (activeId) {
      const s = getSession(activeId);
      if (s) hydrateSession(s, /*navigate*/ false);
    }
  }, []);

  const refreshSessions = () => setSessions(listSessions());

  const hydrateSession = (s, navigate = true) => {
    if (!s) return;
    setSessionId(s.id);
    setActiveSessionId(s.id);
    setProvider(s.provider || DEFAULT_PROVIDER);
    setQuestionMode(s.questionMode || "standard");
    setJobInput(s.jobInput || "");
    setNotes(s.notes || "");
    setAttachments(s.attachments || []);
    setProfile(s.profile || emptyProfile());
    setChatMessages(s.messages || []);
    setChatContext(s.chatContext || "");
    setOutput(s.output || { ats: "", latex: "", tips: "" });
    setError("");
    if (navigate) {
      if (s.output?.latex) setView("output");
      else if ((s.messages || []).length > 0) setView("chat");
      else setView("input");
    }
  };

  const persistSession = (patch) => {
    if (!sessionId) return;
    try {
      const updated = updateSession(sessionId, patch);
      if (updated) refreshSessions();
    } catch (err) {
      setError(err.message);
    }
  };

  const ensureSession = (patch = {}) => {
    if (sessionId) {
      persistSession(patch);
      return sessionId;
    }
    try {
      const s = createSession({
        name: deriveSessionName({ jobInput: patch.jobInput ?? jobInput, attachments: patch.attachments ?? attachments }),
        provider,
        questionMode,
        jobInput,
        notes,
        attachments,
        profile,
        ...patch,
      });
      setSessionId(s.id);
      refreshSessions();
      return s.id;
    } catch (err) {
      setError(err.message);
      return "";
    }
  };

  /* ── multi-file handling ── */
  const handleFiles = async (filesList) => {
    if (!filesList?.length) return;
    setError("");
    const incoming = Array.from(filesList);
    const accepted = [];
    const errors = [];
    for (const f of incoming) {
      const result = await processFile(f);
      if (result.ok) accepted.push(result.attachment);
      else errors.push(result.error);
    }
    const combined = [...attachments, ...accepted];
    if (totalAttachmentSize(combined) > MAX_TOTAL_SIZE) {
      errors.push(`Total attachment size exceeds ${(MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)} MB. Remove some files.`);
    } else if (accepted.length) {
      setAttachments(combined);
      if (sessionId) persistSession({ attachments: combined });
    }
    if (errors.length) setError(errors.join("\n"));
  };

  const removeAttachment = (id) => {
    const next = attachments.filter((a) => a.id !== id);
    setAttachments(next);
    if (sessionId) persistSession({ attachments: next });
  };

  /* ── output parsing ── */
  const parseOutput = (text) => {
    const ats = text.match(/##\s*ATS_ANALYSIS\s*([\s\S]*?)(?=##\s*LATEX_CODE|##\s*TIPS|$)/i)?.[1]?.trim() || "";
    let latex = text.match(/##\s*LATEX_CODE\s*([\s\S]*?)(?=##\s*TIPS|$)/i)?.[1]?.trim() || text;
    const tips = text.match(/##\s*TIPS\s*([\s\S]*?)$/i)?.[1]?.trim() || "";
    latex = latex.replace(/^```(?:latex|tex)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    latex = sanitizeLatex(latex);
    return { ats, latex, tips };
  };

  const startProgress = () => {
    setProgress(0);
    let p = 0;
    progressRef.current = setInterval(() => {
      p += Math.random() * 3;
      if (p > 90) p = 90;
      setProgress(Math.round(p));
    }, 400);
  };

  const stopProgress = () => {
    clearInterval(progressRef.current);
    setProgress(100);
  };

  const startChat = () => {
    if (!jobInput.trim() && attachments.length === 0 && !notes.trim()) {
      setError("Please provide a job title, description, or upload at least one document to get started.");
      return;
    }
    const activeProvider = PROVIDERS[provider];
    if (!activeProvider?.apiKey) {
      setError(`Missing API key for ${activeProvider?.label || provider}. Set VITE_${provider.toUpperCase()}_API_KEY in your .env file.`);
      return;
    }
    setError("");
    // Create or refresh session before entering chat so progress is captured
    ensureSession({
      provider, questionMode, jobInput, notes, attachments,
      messages: chatMessages, profile,
    });
    setView("chat");
  };

  const handleChatStateChange = ({ messages, profile: nextProfile }) => {
    setChatMessages(messages);
    setProfile(nextProfile);
    if (sessionId) persistSession({ messages, profile: nextProfile });
  };

  const handleChatReady = (transcript, finalProfile) => {
    setChatContext(transcript);
    setProfile(finalProfile);
    if (sessionId) persistSession({ chatContext: transcript, profile: finalProfile });
    generate(transcript, finalProfile);
  };

  const handleChatSkip = () => generate("", profile);

  const generate = async (chatCtx = "", currentProfile = profile) => {
    if (!jobInput.trim() && attachments.length === 0 && !notes.trim() && !chatCtx) {
      setError("Please provide a job title, description, or upload your resume to get started.");
      return;
    }

    const activeProvider = PROVIDERS[provider];
    if (!activeProvider?.apiKey) {
      setError(`Missing API key for ${activeProvider?.label || provider}. Set VITE_${provider.toUpperCase()}_API_KEY in your .env file.`);
      return;
    }

    ensureSession({
      provider, questionMode, jobInput, notes, attachments,
      messages: chatMessages, profile: currentProfile, chatContext: chatCtx,
    });

    setView("generating");
    setError("");
    startProgress();

    try {
      const { blocks } = buildContentBlocks(attachments, provider);
      const userContent = [
        ...blocks,
        { type: "text", text: buildUserPrompt(jobInput, notes, attachments, chatCtx, currentProfile) },
      ];

      let raw;
      if (provider === "anthropic") {
        raw = await callAnthropic(activeProvider, SYSTEM_PROMPT, userContent);
      } else {
        raw = await callOpenAI(activeProvider, SYSTEM_PROMPT, userContent);
      }

      stopProgress();
      const parsed = parseOutput(raw);
      setOutput(parsed);
      if (sessionId) persistSession({ output: parsed, chatContext: chatCtx, profile: currentProfile });
      setView("output");
    } catch (err) {
      stopProgress();
      setError(err.message || "Something went wrong. Please try again.");
      setView("input");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output.latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const newSession = () => {
    setSessionId("");
    setActiveSessionId("");
    setView("input");
    setOutput({ ats: "", latex: "", tips: "" });
    setChatContext("");
    setChatMessages([]);
    setProfile(emptyProfile());
    setAttachments([]);
    setJobInput("");
    setNotes("");
    setError("");
    setProgress(0);
  };

  const reset = () => {
    // Keep current session for further iterations; just go back to input.
    setView("input");
    setOutput({ ats: "", latex: "", tips: "" });
    setError("");
    setProgress(0);
  };

  const regenerate = () => {
    // Re-run the resume pipeline using current chat transcript & profile
    setError("");
    generate(chatContext, profile);
  };

  const handleRenameSession = (id) => {
    const current = sessions.find((s) => s.id === id);
    const name = window.prompt("Rename session:", current?.name || "");
    if (name == null) return;
    renameSession(id, name);
    refreshSessions();
  };

  const handleDeleteSession = (id) => {
    if (!window.confirm("Delete this session permanently?")) return;
    deleteSession(id);
    if (id === sessionId) newSession();
    else refreshSessions();
  };

  const progressSteps = [
    "Extracting resume data & parsing experience...",
    "Reverse-engineering ATS keyword requirements...",
    "Injecting JD keywords across all sections...",
    "Engineering CAR-format bullets with metrics...",
    "Optimizing keyword density & section order...",
    "Generating ATS-safe LaTeX document...",
    "Running final quality checks...",
  ];
  const stepIndex = Math.floor((progress / 100) * progressSteps.length);

  /* ── derived ── */
  const currentSession = useMemo(
    () => sessions.find((s) => s.id === sessionId),
    [sessions, sessionId]
  );

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#080808", minHeight: "100vh", color: "#ddd5c8" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
        textarea:focus, input:focus { outline: 1px solid #c9991a !important; }
        textarea::placeholder { color: #444; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .btn-gold { transition: background 0.15s, transform 0.1s; }
        .btn-gold:hover { background: #e0b020 !important; }
        .btn-gold:active { transform: scale(0.98); }
        .btn-ghost:hover { background: #1a1a1a !important; color: #aaa !important; }
      `}</style>

      {/* ── NAV ── */}
      <div style={{ borderBottom: "1px solid #1c1c1c", padding: "1rem 2rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 7, height: 7, background: "#c9991a", borderRadius: "50%" }} />
          <div style={{ width: 5, height: 5, background: "#c9991a", opacity: 0.4, borderRadius: "50%" }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#e0d0b8" }}>
          ResumeForge
        </span>

        {currentSession && (
          <span style={{ fontSize: 11, color: "#666", marginLeft: 6, padding: "3px 8px", border: "1px solid #2a2a2a", borderRadius: 3 }}>
            ◈ {currentSession.name}
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowSessions((s) => !s)}
            className="btn-ghost"
            style={{
              background: showSessions ? "#1a1508" : "transparent",
              border: `1px solid ${showSessions ? "#c9991a" : "#222"}`,
              color: showSessions ? "#c9991a" : "#666",
              padding: "4px 12px",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: "0.05em",
              fontFamily: "inherit",
            }}
          >
            🗂 Sessions ({sessions.length})
          </button>
          <button
            onClick={newSession}
            className="btn-ghost"
            style={{
              background: "transparent",
              border: "1px solid #222",
              color: "#666",
              padding: "4px 12px",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "inherit",
            }}
          >
            + New
          </button>
          {Object.values(PROVIDERS).map((p) => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); if (sessionId) persistSession({ provider: p.id }); }}
              style={{
                background: provider === p.id ? "#1a1508" : "transparent",
                border: `1px solid ${provider === p.id ? "#c9991a" : "#222"}`,
                color: provider === p.id ? "#c9991a" : "#444",
                padding: "4px 12px",
                borderRadius: 3,
                cursor: "pointer",
                fontSize: 11,
                letterSpacing: "0.05em",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SESSIONS DRAWER ── */}
      {showSessions && (
        <div style={{ borderBottom: "1px solid #1c1c1c", background: "#0a0a0a", padding: "1rem 2rem" }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", textTransform: "uppercase", marginBottom: 10 }}>
              Saved Sessions — resume any chat & regenerate
            </div>
            {sessions.length === 0 ? (
              <div style={{ fontSize: 12, color: "#555" }}>No saved sessions yet. Start a chat — it auto-saves.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: s.id === sessionId ? "#1a1508" : "#0d0d0d",
                      border: `1px solid ${s.id === sessionId ? "#c9991a" : "#1e1e1e"}`,
                      borderRadius: 3,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: s.id === sessionId ? "#c9991a" : "#ccc8c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 10, color: "#555" }}>
                        {new Date(s.updatedAt).toLocaleString()} ·{" "}
                        {(s.messages || []).filter((m) => !m.isContext).length} msgs ·{" "}
                        {(s.attachments || []).length} files ·{" "}
                        {s.output?.latex ? "✓ generated" : "draft"}
                      </div>
                    </div>
                    <button
                      onClick={() => { hydrateSession(s); setShowSessions(false); }}
                      className="btn-ghost"
                      style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#888", padding: "4px 10px", borderRadius: 3, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleRenameSession(s.id)}
                      className="btn-ghost"
                      style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#666", padding: "4px 10px", borderRadius: 3, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDeleteSession(s.id)}
                      className="btn-ghost"
                      style={{ background: "transparent", border: "1px solid #3a1515", color: "#a55", padding: "4px 10px", borderRadius: 3, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* ══════════ INPUT VIEW ══════════ */}
        {view === "input" && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: "3rem", paddingTop: "1rem" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#c9991a", marginBottom: "1rem", textTransform: "uppercase" }}>
                Career Intelligence Platform
              </div>
              <h1 style={{ fontSize: 38, fontWeight: 400, lineHeight: 1.25, margin: "0 0 1rem", color: "#e8ddd0" }}>
                Your Next Role,<br />
                <em style={{ color: "#c9991a", fontStyle: "italic" }}>Perfectly Written.</em>
              </h1>
              <p style={{ color: "#555", fontSize: 13, lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
                Drop in PDFs, Word docs, screenshots, and a job description — we extract every detail,
                route it to the right resume section, and forge a job-ready LaTeX resume in seconds.
                Sessions are auto-saved so you can return, edit, and regenerate.
              </p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: "2.5rem" }}>
              {["Multi-Document Ingestion", "Structured Profile Routing", "ATS 95%+ Score", "Saved Sessions", "Dual AI Engine", "LaTeX / Overleaf-Ready"].map(p => (
                <span key={p} style={{ fontSize: 11, padding: "4px 12px", border: "1px solid #2a2a2a", borderRadius: 20, color: "#666", letterSpacing: "0.05em" }}>{p}</span>
              ))}
            </div>

            {/* ── JOB INPUT ── */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", marginBottom: "0.6rem", textTransform: "uppercase" }}>
                <span style={{ width: 18, height: 18, border: "1px solid #c9991a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>1</span>
                Target Role / Job Description
              </label>
              <textarea
                value={jobInput}
                onChange={(e) => { setJobInput(e.target.value); if (sessionId) persistSession({ jobInput: e.target.value }); }}
                placeholder={'e.g. "Senior ML Engineer at OpenAI"\n\nor paste the full job description here...'}
                rows={6}
                style={{ width: "100%", background: "#0d0d0d", border: "1px solid #222", borderRadius: 3, color: "#ccc8c0", padding: "0.9rem 1rem", fontSize: 13, resize: "vertical", fontFamily: "monospace", boxSizing: "border-box", lineHeight: 1.6 }}
              />
            </div>

            {/* ── MULTI-FILE UPLOAD ── */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", marginBottom: "0.6rem", textTransform: "uppercase" }}>
                <span style={{ width: 18, height: 18, border: "1px solid #c9991a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>2</span>
                Upload Documents
                <span style={{ color: "#444", fontWeight: 400 }}>— PDF · DOCX · Images · TXT/MD (multi-file)</span>
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current.click()}
                style={{
                  border: `1px dashed ${dragOver ? "#c9991a" : attachments.length ? "#3a7a4a" : "#2a2a2a"}`,
                  borderRadius: 3,
                  padding: "1.5rem",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "#150f00" : attachments.length ? "#030d06" : "#0a0a0a",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ color: dragOver ? "#c9991a" : "#333", fontSize: 26, marginBottom: 8 }}>↑</div>
                <div style={{ color: "#666", fontSize: 13, marginBottom: 4 }}>
                  Drag & drop multiple files here
                </div>
                <div style={{ color: "#333", fontSize: 11 }}>
                  PDFs, Word (.docx), images (PNG/JPG/WEBP), text — max 10MB each, 25MB total
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/*"
                onChange={(e) => handleFiles(e.target.files)}
                style={{ display: "none" }}
              />

              {attachments.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {attachments.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 10px",
                        background: "#0d0d0d",
                        border: "1px solid #1e1e1e",
                        borderRadius: 3,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>
                        {a.kind === "pdf" ? "📄" : a.kind === "image" ? "🖼" : a.kind === "docx" ? "📝" : "📃"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#ccc8c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                        <div style={{ color: "#555", fontSize: 10 }}>
                          {a.kind.toUpperCase()} · {(a.size / 1024).toFixed(1)} KB
                          {a.text ? ` · ${a.text.length.toLocaleString()} chars extracted` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => removeAttachment(a.id)}
                        style={{ background: "transparent", border: "none", color: "#a55", cursor: "pointer", fontSize: 16, fontFamily: "inherit", padding: "0 6px" }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── NOTES TOGGLE ── */}
            <div style={{ marginBottom: "2rem" }}>
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="btn-ghost"
                style={{ background: "transparent", border: "1px solid #1e1e1e", color: "#555", padding: "0.5rem 1rem", borderRadius: 3, cursor: "pointer", fontSize: 12, letterSpacing: "0.05em", width: "100%", textAlign: "left" }}
              >
                <span style={{ marginRight: 8 }}>{showNotes ? "▾" : "▸"}</span>
                <span style={{ color: "#c9991a", marginRight: 6 }}>3</span>
                Extra Notes (name, contact, skills to highlight, certifications...)
              </button>
              {showNotes && (
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); if (sessionId) persistSession({ notes: e.target.value }); }}
                  placeholder="Your name · Email · Phone · LinkedIn · GitHub · Years of experience · Key skills to emphasize · Target companies · Certifications you hold · Anything else..."
                  rows={4}
                  style={{ width: "100%", marginTop: 8, background: "#0d0d0d", border: "1px solid #222", borderTop: "none", borderRadius: "0 0 3px 3px", color: "#ccc8c0", padding: "0.9rem 1rem", fontSize: 13, resize: "vertical", fontFamily: "monospace", boxSizing: "border-box" }}
                />
              )}
            </div>

            {/* ── PROFILE PEEK (when there's accumulated knowledge) ── */}
            {profileToPromptBlock(profile) && (
              <div style={{ marginBottom: "2rem", background: "#0a0a0a", border: "1px solid #1e1e1e", borderLeft: "3px solid #c9991a", borderRadius: 3, padding: "0.85rem 1rem" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#c9991a", marginBottom: 6, textTransform: "uppercase" }}>
                  🧩 Structured profile from previous chat
                </div>
                <pre style={{ margin: 0, fontSize: 11, color: "#8a7a5a", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6, maxHeight: 160, overflowY: "auto" }}>
                  {profileToPromptBlock(profile)}
                </pre>
                <div style={{ fontSize: 10, color: "#555", marginTop: 6 }}>
                  Will be passed to the chat & resume engine as ground-truth.
                </div>
              </div>
            )}

            {/* ── QUESTION MODE SELECTOR ── */}
            <div style={{ marginBottom: "2rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", marginBottom: "0.75rem", textTransform: "uppercase" }}>
                <span style={{ width: 18, height: 18, border: "1px solid #c9991a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>4</span>
                Interview Depth
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { id: "express", label: "Express", desc: "3–4 questions · Just the essentials", icon: "⚡" },
                  { id: "standard", label: "Standard", desc: "6–8 questions · Balanced coverage", icon: "◈" },
                  { id: "detailed", label: "Detailed", desc: "10–12 questions · Deep dive", icon: "◆" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => { setQuestionMode(mode.id); if (sessionId) persistSession({ questionMode: mode.id }); }}
                    style={{
                      flex: "1 1 0",
                      minWidth: 140,
                      background: questionMode === mode.id ? "#1a1508" : "#0a0a0a",
                      border: `1px solid ${questionMode === mode.id ? "#c9991a" : "#222"}`,
                      borderRadius: 3,
                      padding: "0.85rem 1rem",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.2s",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{mode.icon}</span>
                      <span style={{ fontSize: 13, color: questionMode === mode.id ? "#c9991a" : "#888", fontWeight: 600 }}>{mode.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: questionMode === mode.id ? "#8a7a5a" : "#444", lineHeight: 1.4 }}>{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div style={{ background: "#110505", border: "1px solid #3a1515", borderRadius: 3, padding: "0.75rem 1rem", color: "#c55", fontSize: 13, marginBottom: "1rem", whiteSpace: "pre-wrap" }}>
                ⚠ {error}
              </div>
            )}

            {chatMessages.length > 0 && (
              <button
                onClick={() => setView("chat")}
                className="btn-gold"
                style={{ width: "100%", marginBottom: "0.5rem", background: "#1a1508", color: "#c9991a", border: "1px solid #c9991a", borderRadius: 3, padding: "0.85rem", fontSize: 13, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Georgia', serif" }}
              >
                ↻ Resume Chat ({chatMessages.filter((m) => !m.isContext).length} msgs)
              </button>
            )}

            <button
              onClick={startChat}
              className="btn-gold"
              style={{ width: "100%", background: "#c9991a", color: "#000", border: "none", borderRadius: 3, padding: "1rem", fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Georgia', serif" }}
            >
              {chatMessages.length > 0 ? "Start a Fresh Chat →" : "Start Career Advisor Chat →"}
            </button>

            <button
              onClick={() => { setError(""); generate("", profile); }}
              className="btn-ghost"
              style={{ width: "100%", marginTop: "0.5rem", background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "0.75rem", borderRadius: 3, cursor: "pointer", fontSize: 12, letterSpacing: "0.05em", fontFamily: "inherit" }}
            >
              Skip Chat & Generate Directly
            </button>

            <p style={{ textAlign: "center", color: "#333", fontSize: 11, marginTop: "1rem" }}>
              Sessions auto-save · Multi-format ingestion · Structured profile routing
            </p>
          </div>
        )}

        {/* ══════════ CHAT VIEW ══════════ */}
        {view === "chat" && (
          <ChatBot
            key={sessionId || "new"}
            provider={PROVIDERS[provider]}
            jobInput={jobInput}
            notes={notes}
            attachments={attachments}
            questionMode={questionMode}
            initialMessages={chatMessages}
            initialProfile={profile}
            onReady={handleChatReady}
            onBack={() => { setView("input"); setError(""); }}
            onSkip={handleChatSkip}
            onStateChange={handleChatStateChange}
          />
        )}

        {/* ══════════ GENERATING VIEW ══════════ */}
        {view === "generating" && (
          <div className="fade-in" style={{ textAlign: "center", padding: "5rem 0" }}>
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ width: 52, height: 52, border: "1.5px solid #2a2a2a", borderTop: "1.5px solid #c9991a", borderRadius: "50%", margin: "0 auto 2rem", animation: "spin 1.2s linear infinite" }} />
              <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#c9991a", textTransform: "uppercase", marginBottom: "1rem", animation: "pulse 2s ease infinite" }}>
                {progressSteps[Math.min(stepIndex, progressSteps.length - 1)]}
              </div>
              <div style={{ fontSize: 32, color: "#c9991a", fontWeight: 300, marginBottom: "0.5rem" }}>{progress}%</div>
            </div>

            <div style={{ width: "100%", maxWidth: 400, margin: "0 auto 2rem", background: "#1a1a1a", borderRadius: 2, height: 2 }}>
              <div style={{ width: `${progress}%`, background: "#c9991a", height: 2, borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360, margin: "0 auto" }}>
              {progressSteps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, color: i < stepIndex ? "#c9991a" : i === stepIndex ? "#888" : "#2a2a2a", fontSize: 12, transition: "color 0.3s" }}>
                  <span>{i < stepIndex ? "✓" : i === stepIndex ? "›" : "○"}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {attachments.length > 0 && (
              <div style={{ marginTop: "2rem", fontSize: 11, color: "#444" }}>
                {attachments.length} attachment{attachments.length > 1 ? "s" : ""} sent · Extracting all data...
              </div>
            )}
            <div style={{ marginTop: attachments.length ? "0.5rem" : "2rem", fontSize: 11, color: "#333" }}>
              Using {PROVIDERS[provider]?.label} ({PROVIDERS[provider]?.model})
            </div>
          </div>
        )}

        {/* ══════════ OUTPUT VIEW ══════════ */}
        {view === "output" && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", textTransform: "uppercase", marginBottom: 6 }}>
                  Resume Generated · {PROVIDERS[provider]?.label}
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: "#e0d0b8" }}>
                  Ready to <em style={{ color: "#c9991a" }}>Launch.</em>
                </h2>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setView("chat")}
                  className="btn-ghost"
                  style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#888", padding: "0.5rem 1rem", borderRadius: 3, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
                  title="Re-open the chat to tweak details"
                >
                  ↩ Edit Chat
                </button>
                <button
                  onClick={regenerate}
                  className="btn-ghost"
                  style={{ background: "#1a1508", border: "1px solid #c9991a", color: "#c9991a", padding: "0.5rem 1rem", borderRadius: 3, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
                  title="Re-run the same pipeline with current data"
                >
                  ↻ Regenerate
                </button>
                <button
                  onClick={reset}
                  className="btn-ghost"
                  style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "0.5rem 1rem", borderRadius: 3, cursor: "pointer", fontSize: 12 }}
                >
                  ← Back
                </button>
              </div>
            </div>

            {output.ats && (
              <div style={{ background: "#0d0900", border: "1px solid #2a2000", borderLeft: "3px solid #c9991a", borderRadius: 3, padding: "1.25rem 1.5rem", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", marginBottom: "0.75rem", textTransform: "uppercase" }}>
                  ◈ ATS Analysis
                </div>
                <pre style={{ margin: 0, fontSize: 12, color: "#8a7a5a", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.8 }}>{output.ats}</pre>
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", textTransform: "uppercase" }}>
                  ◈ LaTeX Code — Complete Document
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={copy}
                    className="btn-ghost"
                    style={{
                      background: copied ? "#081508" : "transparent",
                      border: `1px solid ${copied ? "#3a6a3a" : "#2a2a2a"}`,
                      color: copied ? "#5a9a5a" : "#666",
                      padding: "0.4rem 1rem",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: 12,
                      transition: "all 0.2s",
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy LaTeX"}
                  </button>
                  <a
                    href="https://www.overleaf.com/latex/templates"
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#666", padding: "0.4rem 1rem", borderRadius: 3, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Overleaf ↗
                  </a>
                </div>
              </div>
              <textarea
                value={output.latex}
                readOnly
                rows={30}
                style={{ width: "100%", background: "#050505", border: "1px solid #1e1e1e", borderRadius: 3, color: "#8fb870", padding: "1rem", fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
              />
            </div>

            {output.tips && (
              <div style={{ background: "#030d06", border: "1px solid #0d2a12", borderLeft: "3px solid #3a8a4a", borderRadius: 3, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#4a9a5a", marginBottom: "0.75rem", textTransform: "uppercase" }}>
                  ◈ Personalization Tips
                </div>
                <pre style={{ margin: 0, fontSize: 12, color: "#4a6a4a", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.8 }}>{output.tips}</pre>
              </div>
            )}

            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 3, padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#555", marginBottom: "0.75rem", textTransform: "uppercase" }}>How to compile</div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {[
                  { step: "1", label: "Copy LaTeX", desc: "Click 'Copy LaTeX' above" },
                  { step: "2", label: "Open Overleaf", desc: "overleaf.com → New Project → Blank" },
                  { step: "3", label: "Paste & Compile", desc: "Paste code → click Recompile" },
                  { step: "4", label: "Download PDF", desc: "Replace % EXAMPLE content, then export" },
                ].map(s => (
                  <div key={s.step} style={{ flex: "1 1 140px", padding: "0.75rem", background: "#0d0d0d", borderRadius: 3, border: "1px solid #1a1a1a" }}>
                    <div style={{ fontSize: 18, color: "#c9991a", fontWeight: 300, marginBottom: 4 }}>{s.step}</div>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "#3a3a3a" }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: "1.5rem" }}>
              <button
                onClick={newSession}
                className="btn-ghost"
                style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "0.75rem", borderRadius: 3, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
              >
                + New Session
              </button>
              <button
                onClick={reset}
                className="btn-ghost"
                style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "0.75rem", borderRadius: 3, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
              >
                ← Edit & Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
