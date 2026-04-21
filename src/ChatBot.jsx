import { useState, useRef, useEffect, useMemo } from "react";
import { buildContentBlocks } from "./attachments.js";
import { mergeProfile, profileToPromptBlock, emptyProfile } from "./sessions.js";

const MEMORY_KEY = "resumeforge_chat_memory";

function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return { facts: [], conversations: [] };
    const parsed = JSON.parse(raw);
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
    };
  } catch {
    return { facts: [], conversations: [] };
  }
}

function saveMemory(memory) {
  try {
    if (memory.conversations.length > 5) memory.conversations = memory.conversations.slice(-5);
    if (memory.facts.length > 20) memory.facts = memory.facts.slice(-20);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}

const CHAT_SYSTEM_PROMPT = `You are ResumeForge's intelligent career advisor. Interview the candidate warmly to gather everything needed for a perfect ATS-optimized resume.

CONVERSATION RULES:
1. Ask ONE focused question at a time (max 2 if closely related)
2. Keep messages concise: 2-4 sentences max
3. Acknowledge the user's answer before asking the next question
4. Be encouraging and professional
5. When enough info is gathered, include the EXACT token [READY_TO_GENERATE] at the END of your message

INFORMATION PRIORITY:
1. Personal: Full name, email, phone, LinkedIn, GitHub, location
2. Target role: Specific role/level and motivation
3. Work experience: company, title, dates, projects, tech, team size, quantified achievements
4. Key achievements with metrics (%, $, time, users, scale)
5. Technical skills & proficiency
6. Education
7. Certifications
8. Notable projects
9. Career narrative
10. Preferences (tone, emphasis)

STRUCTURED LEARNING — CRITICAL:
After your visible reply, append a hidden block classifying any NEW info learned (from the user's reply, attached documents, or inference). Route each fact to its correct resume section.

Format EXACTLY:
[PROFILE_UPDATE]{ valid JSON here }[/PROFILE_UPDATE]

The JSON may include any of these top-level keys (omit keys you have no new info for):
{
  "personal":      { "fullName": "...", "email": "...", "phone": "...", "location": "...", "linkedin": "...", "github": "...", "website": "..." },
  "targetRole":    "Senior ML Engineer at OpenAI",
  "summary":       "one-sentence professional summary",
  "experience":    [ { "company": "...", "title": "...", "location": "...", "start": "Jan 2022", "end": "Present", "achievements": ["..."], "tech": ["..."] } ],
  "education":     [ { "degree": "...", "school": "...", "year": "...", "gpa": "...", "coursework": ["..."] } ],
  "skills":        { "Languages": ["Python","TypeScript"], "Cloud": ["AWS","GCP"] },
  "projects":      [ { "name": "...", "description": "...", "tech": ["..."], "outcomes": ["..."] } ],
  "certifications":[ { "name": "...", "issuer": "...", "year": "..." } ],
  "achievements":  [ "Reduced inference latency 4x" ],
  "preferences":   { "tone": "...", "emphasize": "..." }
}

PROFILE_UPDATE rules:
- Only include NEW or CHANGED fields. Don't repeat info already present in the profile snapshot below.
- Place each fact in the CORRECT bucket.
- For experience/projects/education, return one object per entry.
- If no new structured info this turn, omit the block entirely.
- MUST be valid JSON. No code fences.
- Hidden from user; don't reference in visible reply.`;

const QUESTION_MODE_INSTRUCTIONS = {
  express: `\n\nQUESTION MODE: EXPRESS (3-4 exchanges MAXIMUM). Combine related questions. Speed priority. Include [READY_TO_GENERATE] within 3-4 exchanges.`,
  standard: `\n\nQUESTION MODE: STANDARD (6-8 exchanges). Cover all major areas: personal, target role, 2-3 work roles, achievements, skills, education. Balance depth with efficiency.`,
  detailed: `\n\nQUESTION MODE: DETAILED (10-12 exchanges). Go deep into each role individually, ask follow-ups about metrics/team/tech, career narrative, projects, certifications, preferences. Ask follow-ups to extract specific metrics from vague answers.`,
};

function buildChatSystemPrompt(questionMode, profile) {
  const smart = `

SMART BEHAVIOR:
- If a JD was provided, align their experience with its requirements.
- If documents were uploaded, extract their content — never re-ask for present facts.
- If notes were provided, use them; don't re-ask known info.
- If returning user (memory present), greet by name and build on what's known.
- Skip questions already answered by provided context.
- Infer seniority from the JD and tailor depth accordingly.

CURRENT STRUCTURED PROFILE (already known — do NOT re-ask):
${profileToPromptBlock(profile) || "(empty — start fresh)"}

READINESS SIGNAL:
When you have enough info per the question mode, deliver an encouraging summary and include [READY_TO_GENERATE] at the end. The resume will generate IMMEDIATELY after — make sure you have enough info.

CRITICAL: Do NOT generate the resume yourself. Only gather information.`;

  return CHAT_SYSTEM_PROMPT + (QUESTION_MODE_INSTRUCTIONS[questionMode] || QUESTION_MODE_INSTRUCTIONS.standard) + smart;
}

async function chatAnthropic(provider, systemPrompt, messages, attachments) {
  const { blocks: fileBlocks } = buildContentBlocks(attachments, "anthropic");
  const apiMessages = messages.map((msg, i) => {
    if (i === 0 && msg.role === "user" && fileBlocks.length) {
      return { role: "user", content: [...fileBlocks, { type: "text", text: msg.content }] };
    }
    return { role: msg.role, content: msg.content };
  });
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
      max_completion_tokens: 1536,
      system: systemPrompt,
      messages: apiMessages,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Anthropic API error");
  return data.content?.map((b) => b.text || "").join("") || "";
}

async function chatOpenAI(provider, systemPrompt, messages, attachments) {
  const { blocks: fileBlocks } = buildContentBlocks(attachments, "openai");
  const apiMessages = [{ role: "system", content: systemPrompt }];
  messages.forEach((msg, i) => {
    if (i === 0 && msg.role === "user" && fileBlocks.length) {
      apiMessages.push({ role: "user", content: [...fileBlocks, { type: "text", text: msg.content }] });
    } else {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  });
  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model: provider.model, max_completion_tokens: 1536, messages: apiMessages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "OpenAI API error");
  return data.choices?.[0]?.message?.content || "";
}

function extractProfileUpdate(raw) {
  if (!raw) return { clean: raw, update: null };
  const re = /\[PROFILE_UPDATE\]([\s\S]*?)\[\/PROFILE_UPDATE\]/i;
  const m = raw.match(re);
  if (!m) return { clean: raw, update: null };
  let parsed = null;
  try {
    parsed = JSON.parse(m[1].trim());
  } catch {
    try {
      const inner = m[1].trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(inner);
    } catch {
      parsed = null;
    }
  }
  return { clean: raw.replace(re, "").trim(), update: parsed };
}

function extractFacts(messages) {
  const userText = messages.filter((m) => m.role === "user" && !m.isContext).map((m) => m.content).join(" ");
  const facts = [];
  const nameMatch = userText.match(/(?:my name is|I'm|I am|name:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i);
  if (nameMatch) facts.push(`Name: ${nameMatch[1].trim()}`);
  const emailMatch = userText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch) facts.push(`Email: ${emailMatch[0]}`);
  const phoneMatch = userText.match(/(?:phone|mobile|cell|tel)[:\s]*([+\d\s()-]{7,})/i);
  if (phoneMatch) facts.push(`Phone: ${phoneMatch[1].trim()}`);
  const linkedinMatch = userText.match(/(linkedin\.com\/in\/[\w-]+)/i);
  if (linkedinMatch) facts.push(`LinkedIn: ${linkedinMatch[1]}`);
  const githubMatch = userText.match(/(github\.com\/[\w-]+)/i);
  if (githubMatch) facts.push(`GitHub: ${githubMatch[1]}`);
  const yearsMatch = userText.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|exp)/i);
  if (yearsMatch) facts.push(`Experience: ${yearsMatch[1]}+ years`);
  return facts;
}

export default function ChatBot({
  provider,
  jobInput,
  notes,
  attachments,
  questionMode,
  initialMessages,
  initialProfile,
  onReady,
  onBack,
  onSkip,
  onStateChange,
}) {
  const [messages, setMessages] = useState(initialMessages || []);
  const [profile, setProfile] = useState(initialProfile || emptyProfile());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [exchangeCount, setExchangeCount] = useState(
    (initialMessages || []).filter((m) => m.role === "user" && !m.isContext).length
  );
  const [memoryCleared, setMemoryCleared] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const memoryRef = useRef(loadMemory());
  const initRef = useRef(false);
  const autoGenerateRef = useRef(false);
  const handleGenerateRef = useRef(null);

  useEffect(() => {
    onStateChange?.({ messages, profile });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, profile]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => { if (!isLoading && inputRef.current) inputRef.current.focus(); }, [isLoading]);

  useEffect(() => {
    if (isReady && !isLoading && !autoGenerateRef.current && handleGenerateRef.current) {
      autoGenerateRef.current = true;
      const t = setTimeout(() => handleGenerateRef.current(), 800);
      return () => clearTimeout(t);
    }
  }, [isReady, isLoading]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if ((initialMessages || []).length > 0) return;

    const memory = memoryRef.current;
    const contextParts = [];
    if (memory.facts.length > 0) {
      contextParts.push(`REMEMBERED FROM PREVIOUS SESSIONS:\n${memory.facts.map((f) => `• ${f}`).join("\n")}`);
    }
    if (memory.conversations.length > 0) {
      const last = memory.conversations[memory.conversations.length - 1];
      contextParts.push(`LAST SESSION: ${new Date(last.timestamp).toLocaleDateString()}\nPrevious discussion summary: ${last.summary || "Resume creation"}`);
    }
    if (jobInput?.trim()) contextParts.push(`TARGET ROLE / JOB DESCRIPTION:\n${jobInput.trim()}`);
    if (notes?.trim()) contextParts.push(`USER NOTES:\n${notes.trim()}`);
    if (attachments?.length) {
      const list = attachments
        .map((a) => `• ${a.name} (${a.kind})${a.kind === "docx" || a.kind === "text" ? " — text extracted below" : " — attached for direct analysis"}`)
        .join("\n");
      contextParts.push(`UPLOADED DOCUMENTS:\n${list}`);
      const inlineTexts = attachments
        .filter((a) => a.kind === "docx" || a.kind === "text")
        .map((a) => `--- ${a.name} ---\n${a.text}`)
        .join("\n\n");
      if (inlineTexts) contextParts.push(`EXTRACTED DOCUMENT TEXT:\n${inlineTexts}`);
    }
    if (contextParts.length === 0) {
      contextParts.push("No initial context provided. Start by asking what role the user is targeting.");
    }

    const initMessage = {
      role: "user",
      content: `[CONTEXT — auto-generated, not typed by the user]\n\n${contextParts.join("\n\n---\n\n")}\n\nPlease greet me and begin the interview to gather information for my resume.`,
      isContext: true,
    };

    setMessages([initMessage]);
    setIsLoading(true);

    (async () => {
      try {
        const fn = provider.id === "anthropic" ? chatAnthropic : chatOpenAI;
        const response = await fn(
          provider,
          buildChatSystemPrompt(questionMode, profile),
          [{ role: initMessage.role, content: initMessage.content }],
          attachments
        );
        const { clean: noProfile, update } = extractProfileUpdate(response);
        if (update) setProfile((p) => mergeProfile(p, update));
        let clean = noProfile;
        if (clean.includes("[READY_TO_GENERATE]")) {
          clean = clean.replace(/\[READY_TO_GENERATE\]/g, "").trim();
          setIsReady(true);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: clean }]);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;
    const userMsg = { role: "user", content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setIsLoading(true);
    setError("");
    setExchangeCount((c) => c + 1);

    try {
      const apiMessages = updated.map((m) => ({ role: m.role, content: m.content }));
      const fn = provider.id === "anthropic" ? chatAnthropic : chatOpenAI;
      const response = await fn(provider, buildChatSystemPrompt(questionMode, profile), apiMessages, attachments);
      const { clean: noProfile, update } = extractProfileUpdate(response);
      if (update) setProfile((p) => mergeProfile(p, update));
      let clean = noProfile;
      if (clean.includes("[READY_TO_GENERATE]")) {
        clean = clean.replace(/\[READY_TO_GENERATE\]/g, "").trim();
        setIsReady(true);
      }
      setMessages((prev) => [...prev, { role: "assistant", content: clean }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = () => {
    const memory = memoryRef.current;
    const newFacts = extractFacts(messages);
    for (const fact of newFacts) {
      const prefix = fact.split(":")[0] + ":";
      memory.facts = memory.facts.filter((f) => !f.startsWith(prefix));
      memory.facts.push(fact);
    }
    const userAnswers = messages.filter((m) => m.role === "user" && !m.isContext).map((m) => m.content);
    memory.conversations.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      summary: userAnswers.join(" | ").slice(0, 500),
    });
    saveMemory(memory);

    const transcript = messages
      .filter((m) => !m.isContext)
      .map((m) => `${m.role === "user" ? "Candidate" : "Advisor"}: ${m.content}`)
      .join("\n\n");

    onReady(transcript, profile);
  };
  handleGenerateRef.current = handleGenerate;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearMemory = () => {
    localStorage.removeItem(MEMORY_KEY);
    memoryRef.current = { facts: [], conversations: [] };
    setMemoryCleared(true);
    setTimeout(() => setMemoryCleared(false), 2000);
  };

  const visibleMessages = messages.filter((m) => !m.isContext);
  const showManualReady = exchangeCount >= 2 && !isReady;
  const hasFacts = memoryRef.current.facts.length > 0;

  const profileSummary = useMemo(() => {
    const parts = [];
    if (profile.personal?.fullName) parts.push(profile.personal.fullName);
    if (profile.targetRole) parts.push(profile.targetRole);
    if (profile.experience?.length) parts.push(`${profile.experience.length} role${profile.experience.length > 1 ? "s" : ""}`);
    if (profile.education?.length) parts.push(`${profile.education.length} degree${profile.education.length > 1 ? "s" : ""}`);
    const skillCount = Object.values(profile.skills || {}).reduce((s, arr) => s + (arr?.length || 0), 0);
    if (skillCount) parts.push(`${skillCount} skills`);
    if (profile.projects?.length) parts.push(`${profile.projects.length} projects`);
    return parts.join(" · ");
  }, [profile]);

  const suggestions = exchangeCount === 0 || isLoading || isReady ? [] : [
    "Tell me more about that",
    "I'd rather skip this",
    "That's all I have — let's generate!",
  ];

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 140px)", minHeight: 500 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} className="btn-ghost"
            style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "6px 14px", borderRadius: 3, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#c9991a", textTransform: "uppercase" }}>
              Career Advisor Chat
              <span style={{ color: "#666", marginLeft: 8, fontSize: 10 }}>
                {questionMode === "express" ? "⚡ Express" : questionMode === "detailed" ? "◆ Detailed" : "◈ Standard"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#444" }}>
              {profileSummary
                ? `🧩 Learned: ${profileSummary}`
                : hasFacts
                  ? `🧠 ${memoryRef.current.facts.length} facts remembered from past sessions`
                  : "Gathering information for your perfect resume"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowProfile((s) => !s)} className="btn-ghost"
            style={{ background: showProfile ? "#1a1508" : "transparent", border: `1px solid ${showProfile ? "#c9991a" : "#2a2a2a"}`, color: showProfile ? "#c9991a" : "#555", padding: "6px 14px", borderRadius: 3, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
            title="Show what the advisor has learned so far">
            🧩 Profile
          </button>
          <button onClick={onSkip} className="btn-ghost"
            style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#555", padding: "6px 14px", borderRadius: 3, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            Skip Chat →
          </button>
        </div>
      </div>

      {showProfile && (
        <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 4, padding: "0.85rem 1rem", marginBottom: "0.75rem", maxHeight: 220, overflowY: "auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#c9991a", marginBottom: 6, textTransform: "uppercase" }}>
            Structured Knowledge — auto-routed to resume sections
          </div>
          <pre style={{ margin: 0, fontSize: 11, color: "#8a7a5a", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6 }}>
            {profileToPromptBlock(profile) || "(nothing learned yet — keep chatting)"}
          </pre>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0", display: "flex", flexDirection: "column", gap: 16 }}>
        {visibleMessages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", animation: "fadeIn 0.3s ease forwards" }}>
            <div style={{
              maxWidth: "80%", padding: "0.85rem 1.1rem",
              borderRadius: msg.role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
              background: msg.role === "user" ? "#1a1508" : "#0d0d0d",
              border: `1px solid ${msg.role === "user" ? "#2a2000" : "#1e1e1e"}`,
              color: msg.role === "user" ? "#d4c8a0" : "#bbb0a0",
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {msg.role === "assistant" && (
                <div style={{ fontSize: 10, color: "#c9991a", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
                  ◈ ResumeForge Advisor
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "0.85rem 1.1rem", borderRadius: "14px 14px 14px 3px", background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
              <div style={{ fontSize: 10, color: "#c9991a", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
                ◈ ResumeForge Advisor
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: "50%", background: "#c9991a", opacity: 0.6,
                    animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={{ background: "#110505", border: "1px solid #3a1515", borderRadius: 3, padding: "0.65rem 1rem", color: "#c55", fontSize: 12, margin: "0.5rem 0" }}>
          ⚠ {error}
        </div>
      )}

      {suggestions.length > 0 && !isLoading && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0.4rem 0" }}>
          {suggestions.map((s) => (
            <button key={s} onClick={() => sendMessage(s)}
              style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#666", padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontSize: 11, transition: "all 0.2s", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.target.style.borderColor = "#c9991a"; e.target.style.color = "#c9991a"; }}
              onMouseLeave={(e) => { e.target.style.borderColor = "#2a2a2a"; e.target.style.color = "#666"; }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "0.75rem 0 0.25rem" }}>
        <textarea ref={inputRef} value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder={isReady ? "Add more details or click Generate below..." : "Type your answer... (Enter to send, Shift+Enter for new line)"}
          rows={1}
          style={{ flex: 1, background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, color: "#ccc8c0", padding: "0.7rem 1rem", fontSize: 13, resize: "none", fontFamily: "'Georgia', 'Times New Roman', serif", minHeight: 44, maxHeight: 120, boxSizing: "border-box", lineHeight: 1.5 }}
          onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }} />
        <button onClick={() => sendMessage()} disabled={isLoading || !input.trim()}
          style={{
            background: input.trim() && !isLoading ? "#c9991a" : "#1a1a1a",
            color: input.trim() && !isLoading ? "#000" : "#555",
            border: "none", borderRadius: 8, padding: "0.7rem 1.25rem",
            cursor: input.trim() && !isLoading ? "pointer" : "default",
            fontSize: 14, fontWeight: 700, transition: "all 0.2s", minHeight: 44, fontFamily: "inherit",
          }}>↑</button>
      </div>

      {isReady && (
        <div style={{ padding: "0.75rem 0", textAlign: "center" }}>
          <div style={{ background: "#1a1508", border: "1px solid #c9991a", borderRadius: 3, padding: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 18, height: 18, border: "2px solid #2a2a2a", borderTop: "2px solid #c9991a", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <span style={{ color: "#c9991a", fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Generating your resume...
            </span>
          </div>
        </div>
      )}

      {showManualReady && !isReady && (
        <div style={{ padding: "0.5rem 0" }}>
          <button onClick={handleGenerate} className="btn-gold"
            style={{ width: "100%", background: "#1a1508", color: "#c9991a", border: "1px solid #c9991a", borderRadius: 3, padding: "0.9rem", fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Georgia', 'Times New Roman', serif", transition: "all 0.3s" }}>
            I'm Ready — Generate Resume →
          </button>
          <p style={{ textAlign: "center", fontSize: 11, color: "#444", margin: "0.5rem 0 0" }}>
            The advisor recommends a few more questions for the best result
          </p>
        </div>
      )}

      {hasFacts && (
        <div style={{ textAlign: "center", padding: "0.25rem 0 0.5rem" }}>
          <button onClick={clearMemory}
            style={{ background: "transparent", border: "none", color: memoryCleared ? "#5a9a5a" : "#333", fontSize: 10, cursor: "pointer", fontFamily: "inherit", transition: "color 0.2s" }}>
            {memoryCleared ? "✓ Memory cleared" : `🧠 Remembered: ${memoryRef.current.facts.join(" · ")} — click to clear`}
          </button>
        </div>
      )}
    </div>
  );
}
