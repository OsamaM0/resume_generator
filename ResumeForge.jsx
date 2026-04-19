import { useState, useRef } from "react";
import ChatBot from "./src/ChatBot.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   PROVIDER CONFIGURATION — reads from .env (VITE_ prefix for client-side)
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
    label: "OpenAI GPT-4o",
    model: import.meta.env.VITE_OPENAI_MODEL || "gpt-4o",
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
    • If PDF resume provided: extract ALL content and ENHANCE every bullet with stronger verbs, metrics, and JD keywords
    • If no resume provided: generate REALISTIC, PLAUSIBLE example content with a "% EXAMPLE — REPLACE" comment on a SEPARATE LINE above every generated entry (never inline inside \\resumeItem{})
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
   ENHANCED USER PROMPT BUILDER
   ═══════════════════════════════════════════════════════════════════════════ */
const buildUserPrompt = (jobInput, notes, hasPDF, chatContext = "") => {
  const sections = [];

  if (hasPDF) {
    sections.push(`RESUME EXTRACTION INSTRUCTIONS:
I have attached my previous resume as a PDF. You MUST:
1. Extract EVERY piece of information: all jobs, titles, dates, companies, bullet points, skills, education, projects, certifications, achievements, and contact info
2. Preserve all factual content (dates, company names, titles, metrics) exactly as written
3. ENHANCE every bullet point by: adding stronger power verbs, injecting JD keywords naturally, adding/improving quantified metrics, restructuring to CAR format
4. Re-order skills sections to prioritize JD-relevant technologies
5. If my resume has weak or missing metrics, infer realistic ones based on the role/project scope and mark them with a LaTeX comment on its OWN SEPARATE LINE above the item: % VERIFY: [reason]. NEVER put % VERIFY inside \resumeItem{} text — it will break compilation.
6. Add any JD-required skills I possess (inferred from my experience) that are missing from my resume`);
  } else {
    sections.push(`NO RESUME ATTACHED — GENERATION MODE:
Generate realistic, plausible example content for a strong candidate at the appropriate seniority level.
Mark EVERY generated entry with a LaTeX comment on its OWN SEPARATE LINE above the entry: % EXAMPLE — REPLACE WITH YOUR REAL EXPERIENCE. NEVER put this marker inside \resumeItem{} text.
Generate 4-5 job positions with realistic progression, each with project sub-headings and quantified bullets.`);
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
   LATEX SANITIZER — Fix common LaTeX special character issues
   ═══════════════════════════════════════════════════════════════════════════ */
const sanitizeLatex = (latex) => {
  if (!latex) return latex;

  // Split into lines for line-by-line processing
  const lines = latex.split("\n");
  const sanitized = lines.map((line) => {
    // Skip lines that are LaTeX commands/preamble (start with \)
    const trimmed = line.trim();

    // Skip comment lines entirely (% at start of trimmed line)
    if (trimmed.startsWith("%")) return line;

    // Skip lines that are pure LaTeX structural commands
    if (/^\\(documentclass|usepackage|begin|end|newcommand|renewcommand|setlength|addtolength|definecolor|titleformat|pagestyle|fancyhf|fancyfoot|urlstyle|raggedbottom|raggedright|pdfgentounicode|input|section|resumeSubHeadingListStart|resumeSubHeadingListEnd|resumeItemListStart|resumeItemListEnd)\b/.test(trimmed)) {
      return line;
    }

    // For content lines, fix unescaped special characters
    // Process the line in segments — skip anything inside \command{} patterns and \href{} URLs
    let result = "";
    let i = 0;
    while (i < line.length) {
      // Skip backslash-escaped characters (already escaped properly)
      if (line[i] === "\\" && i + 1 < line.length) {
        result += line[i] + line[i + 1];
        i += 2;
        continue;
      }

      // Fix unescaped & in text content (but not in tabular alignment like l@{})
      if (line[i] === "&") {
        // Check if this is inside a tabular spec (l@{\extracolsep...}r) — leave alone
        if (/\\begin\{tabular/.test(line) || /\\extracolsep/.test(line) || /l@\{/.test(line)) {
          result += "&";
        } else {
          result += "\\&";
        }
        i++;
        continue;
      }

      // Fix unescaped % in text (but not comment % at end of line / commands)
      if (line[i] === "%") {
        // If it's preceded by whitespace or at start and followed by text that looks like a comment, leave as comment
        const before = line.substring(0, i);
        const isInTextContent = /\\resumeItem\{|\\textbf\{|\\text/.test(before) &&
          (before.match(/\{/g) || []).length > (before.match(/\}/g) || []).length;
        if (isInTextContent) {
          result += "\\%";
        } else {
          result += "%";
        }
        i++;
        continue;
      }

      // Fix unescaped # in text content
      if (line[i] === "#") {
        const before = line.substring(0, i);
        const isInDefinition = /\\newcommand|\\renewcommand/.test(line);
        if (!isInDefinition) {
          const isInTextContent = /\\resumeItem\{|\\textbf\{/.test(before) &&
            (before.match(/\{/g) || []).length > (before.match(/\}/g) || []).length;
          if (isInTextContent) {
            result += "\\#";
            i++;
            continue;
          }
        }
        result += "#";
        i++;
        continue;
      }

      // Fix unescaped $ in text content (not math mode)
      if (line[i] === "$") {
        const before = line.substring(0, i);
        const isInTextContent = /\\resumeItem\{|\\textbf\{/.test(before) &&
          (before.match(/\{/g) || []).length > (before.match(/\}/g) || []).length;
        // Check if it looks like a currency amount (e.g., $50M, $1.2B)
        if (isInTextContent && /\d/.test(line[i + 1])) {
          result += "\\$";
          i++;
          continue;
        }
        result += "$";
        i++;
        continue;
      }

      // Fix unescaped ~ used as text (not as non-breaking space in LaTeX)
      // Leave ~ alone as it's commonly used intentionally in LaTeX

      result += line[i];
      i++;
    }

    return result;
  });

  return sanitized.join("\n");
};

/* ═══════════════════════════════════════════════════════════════════════════
   API CALLERS — Anthropic & OpenAI
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
  // OpenAI expects messages array; convert content blocks to OpenAI format
  const userMessages = [];
  for (const block of userContent) {
    if (block.type === "text") {
      userMessages.push({ type: "text", text: block.text });
    } else if (block.type === "document" || block.type === "file") {
      // GPT-4o supports PDF via file content type
      userMessages.push({
        type: "file",
        file: {
          filename: "resume.pdf",
          file_data: `data:application/pdf;base64,${block.source?.data || block.file?.file_data || ""}`,
        },
      });
    }
  }

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
        { role: "user", content: userMessages },
      ],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "OpenAI API error");
  return data.choices?.[0]?.message?.content || "";
};

export default function ResumeForge() {
  const [view, setView] = useState("input");
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [jobInput, setJobInput] = useState("");
  const [notes, setNotes] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfBase64, setPdfBase64] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [output, setOutput] = useState({ ats: "", latex: "", tips: "" });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chatContext, setChatContext] = useState("");
  const [questionMode, setQuestionMode] = useState("standard");
  const fileRef = useRef();
  const progressRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Please use a PDF under 10MB.");
      return;
    }
    setError("");
    setPdfName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPdfBase64(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  const parseOutput = (text) => {
    const ats = text.match(/##\s*ATS_ANALYSIS\s*([\s\S]*?)(?=##\s*LATEX_CODE|##\s*TIPS|$)/i)?.[1]?.trim() || "";
    let latex = text.match(/##\s*LATEX_CODE\s*([\s\S]*?)(?=##\s*TIPS|$)/i)?.[1]?.trim() || text;
    const tips = text.match(/##\s*TIPS\s*([\s\S]*?)$/i)?.[1]?.trim() || "";

    // Strip markdown code fences if present
    latex = latex.replace(/^```(?:latex|tex)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    // Sanitize LaTeX special characters
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
    if (!jobInput.trim() && !pdfBase64 && !notes.trim()) {
      setError("Please provide a job title, description, or upload your resume to get started.");
      return;
    }
    const activeProvider = PROVIDERS[provider];
    if (!activeProvider?.apiKey) {
      setError(`Missing API key for ${activeProvider?.label || provider}. Set VITE_${provider.toUpperCase()}_API_KEY in your .env file.`);
      return;
    }
    setError("");
    setView("chat");
  };

  const handleChatReady = (transcript) => {
    setChatContext(transcript);
    generate(transcript);
  };

  const handleChatSkip = () => {
    generate("");
  };

  const generate = async (chatCtx = "") => {
    if (!jobInput.trim() && !pdfBase64 && !notes.trim()) {
      setError("Please provide a job title, description, or upload your resume to get started.");
      return;
    }

    const activeProvider = PROVIDERS[provider];
    if (!activeProvider?.apiKey) {
      setError(`Missing API key for ${activeProvider?.label || provider}. Set VITE_${provider.toUpperCase()}_API_KEY in your .env file.`);
      return;
    }

    setView("generating");
    setError("");
    startProgress();

    try {
      const content = [];
      if (pdfBase64) {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        });
      }
      content.push({ type: "text", text: buildUserPrompt(jobInput, notes, !!pdfBase64, chatCtx) });

      let raw;
      if (provider === "anthropic") {
        raw = await callAnthropic(activeProvider, SYSTEM_PROMPT, content);
      } else {
        raw = await callOpenAI(activeProvider, SYSTEM_PROMPT, content);
      }

      stopProgress();
      setOutput(parseOutput(raw));
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

  const reset = () => {
    setView("input");
    setOutput({ ats: "", latex: "", tips: "" });
    setChatContext("");
    setError("");
    setProgress(0);
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
      <div style={{ borderBottom: "1px solid #1c1c1c", padding: "1rem 2rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 7, height: 7, background: "#c9991a", borderRadius: "50%" }} />
          <div style={{ width: 5, height: 5, background: "#c9991a", opacity: 0.4, borderRadius: "50%" }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#e0d0b8" }}>
          ResumeForge
        </span>

        {/* ── PROVIDER TOGGLE ── */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {Object.values(PROVIDERS).map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
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
              <p style={{ color: "#555", fontSize: 13, lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
                Give us a job title, a full JD, your old CV — or all three.
                We extract, enhance, and produce a job-ready LaTeX resume in seconds.
              </p>
            </div>

            {/* ── CAPABILITY PILLS ── */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: "2.5rem" }}>
              {["ATS 95%+ Score", "Keyword Injection", "CAR-Format Bullets", "Dual AI Engine", "LaTeX / Overleaf-Ready"].map(p => (
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
                onChange={(e) => setJobInput(e.target.value)}
                placeholder={'e.g. "Senior ML Engineer at OpenAI"\n\nor paste the full job description here...'}
                rows={6}
                style={{ width: "100%", background: "#0d0d0d", border: "1px solid #222", borderRadius: 3, color: "#ccc8c0", padding: "0.9rem 1rem", fontSize: 13, resize: "vertical", fontFamily: "monospace", boxSizing: "border-box", lineHeight: 1.6 }}
              />
            </div>

            {/* ── PDF UPLOAD ── */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", marginBottom: "0.6rem", textTransform: "uppercase" }}>
                <span style={{ width: 18, height: 18, border: "1px solid #c9991a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>2</span>
                Upload Previous Resume
                <span style={{ color: "#444", fontWeight: 400 }}>— PDF (optional but recommended)</span>
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current.click()}
                style={{
                  border: `1px dashed ${dragOver ? "#c9991a" : pdfName ? "#3a7a4a" : "#2a2a2a"}`,
                  borderRadius: 3,
                  padding: "1.75rem",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "#150f00" : pdfName ? "#030d06" : "#0a0a0a",
                  transition: "all 0.2s",
                }}
              >
                {pdfName ? (
                  <div>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>📄</div>
                    <div style={{ color: "#5a9a6a", fontSize: 14, marginBottom: 4 }}>{pdfName}</div>
                    <div style={{ color: "#3a5a3a", fontSize: 11 }}>Click to replace · Extracted at generation time</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: "#333", fontSize: 28, marginBottom: 8 }}>↑</div>
                    <div style={{ color: "#666", fontSize: 14, marginBottom: 4 }}>Drag & drop your PDF resume here</div>
                    <div style={{ color: "#333", fontSize: 11 }}>or click to browse · Max 10MB</div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf" onChange={(e) => handleFile(e.target.files[0])} style={{ display: "none" }} />
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
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Your name · Email · Phone · LinkedIn · GitHub · Years of experience · Key skills to emphasize · Target companies · Certifications you hold · Anything else..."
                  rows={4}
                  style={{ width: "100%", marginTop: 8, background: "#0d0d0d", border: "1px solid #222", borderTop: "none", borderRadius: "0 0 3px 3px", color: "#ccc8c0", padding: "0.9rem 1rem", fontSize: 13, resize: "vertical", fontFamily: "monospace", boxSizing: "border-box" }}
                />
              )}
            </div>

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
                    onClick={() => setQuestionMode(mode.id)}
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
              <div style={{ background: "#110505", border: "1px solid #3a1515", borderRadius: 3, padding: "0.75rem 1rem", color: "#c55", fontSize: 13, marginBottom: "1rem" }}>
                ⚠ {error}
              </div>
            )}

            <button
              onClick={startChat}
              className="btn-gold"
              style={{ width: "100%", background: "#c9991a", color: "#000", border: "none", borderRadius: 3, padding: "1rem", fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Georgia', serif" }}
            >
              Start Career Advisor Chat →
            </button>

            <button
              onClick={() => { setError(""); generate(""); }}
              className="btn-ghost"
              style={{ width: "100%", marginTop: "0.5rem", background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "0.75rem", borderRadius: 3, cursor: "pointer", fontSize: 12, letterSpacing: "0.05em", fontFamily: "inherit" }}
            >
              Skip Chat & Generate Directly
            </button>

            <p style={{ textAlign: "center", color: "#333", fontSize: 11, marginTop: "1rem" }}>
              The advisor chat helps create a more personalized resume · You can skip if in a hurry
            </p>
          </div>
        )}

        {/* ══════════ CHAT VIEW ══════════ */}
        {view === "chat" && (
          <ChatBot
            provider={PROVIDERS[provider]}
            jobInput={jobInput}
            notes={notes}
            pdfBase64={pdfBase64}
            pdfName={pdfName}
            questionMode={questionMode}
            onReady={handleChatReady}
            onBack={() => { setView("input"); setError(""); }}
            onSkip={handleChatSkip}
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

            {/* Progress bar */}
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

            {pdfBase64 && (
              <div style={{ marginTop: "2rem", fontSize: 11, color: "#444" }}>
                PDF attached: {pdfName} · Extracting all experience data...
              </div>
            )}
            <div style={{ marginTop: pdfBase64 ? "0.5rem" : "2rem", fontSize: 11, color: "#333" }}>
              Using {PROVIDERS[provider]?.label} ({PROVIDERS[provider]?.model})
            </div>
          </div>
        )}

        {/* ══════════ OUTPUT VIEW ══════════ */}
        {view === "output" && (
          <div className="fade-in">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", textTransform: "uppercase", marginBottom: 6 }}>
                  Resume Generated · {PROVIDERS[provider]?.label}
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: "#e0d0b8" }}>
                  Ready to <em style={{ color: "#c9991a" }}>Launch.</em>
                </h2>
              </div>
              <button
                onClick={reset}
                className="btn-ghost"
                style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "0.5rem 1.25rem", borderRadius: 3, cursor: "pointer", fontSize: 12 }}
              >
                ← Start Over
              </button>
            </div>

            {/* ── ATS ANALYSIS ── */}
            {output.ats && (
              <div style={{ background: "#0d0900", border: "1px solid #2a2000", borderLeft: "3px solid #c9991a", borderRadius: 3, padding: "1.25rem 1.5rem", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", marginBottom: "0.75rem", textTransform: "uppercase" }}>
                  ◈ ATS Analysis
                </div>
                <pre style={{ margin: 0, fontSize: 12, color: "#8a7a5a", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.8 }}>{output.ats}</pre>
              </div>
            )}

            {/* ── LATEX CODE ── */}
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
              <div style={{ position: "relative" }}>
                <textarea
                  value={output.latex}
                  readOnly
                  rows={30}
                  style={{ width: "100%", background: "#050505", border: "1px solid #1e1e1e", borderRadius: 3, color: "#8fb870", padding: "1rem", fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
                />
              </div>
            </div>

            {/* ── TIPS ── */}
            {output.tips && (
              <div style={{ background: "#030d06", border: "1px solid #0d2a12", borderLeft: "3px solid #3a8a4a", borderRadius: 3, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#4a9a5a", marginBottom: "0.75rem", textTransform: "uppercase" }}>
                  ◈ Personalization Tips
                </div>
                <pre style={{ margin: 0, fontSize: 12, color: "#4a6a4a", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.8 }}>{output.tips}</pre>
              </div>
            )}

            {/* ── HOW TO USE ── */}
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

            <button
              onClick={reset}
              className="btn-ghost"
              style={{ width: "100%", marginTop: "1.5rem", background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "0.75rem", borderRadius: 3, cursor: "pointer", fontSize: 13 }}
            >
              ← Generate Another Resume
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
