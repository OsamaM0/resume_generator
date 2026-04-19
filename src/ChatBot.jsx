import { useState, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   MEMORY PERSISTENCE — localStorage
   ═══════════════════════════════════════════════════════════════════════════ */
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
    if (memory.conversations.length > 5) {
      memory.conversations = memory.conversations.slice(-5);
    }
    if (memory.facts.length > 20) {
      memory.facts = memory.facts.slice(-20);
    }
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // localStorage unavailable
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT SYSTEM PROMPT
   ═══════════════════════════════════════════════════════════════════════════ */
const CHAT_SYSTEM_PROMPT = `You are ResumeForge's intelligent career advisor. Your job is to interview the candidate in a warm, professional conversation to gather everything needed to create the perfect ATS-optimized resume.

CONVERSATION RULES:
1. Ask ONE focused question at a time (max 2 if closely related)
2. Keep messages concise: 2-4 sentences max
3. Acknowledge the user's answer before asking the next question
4. Be encouraging and professional — like a supportive career coach
5. After gathering sufficient information, include the EXACT token [READY_TO_GENERATE] at the END of your message

INFORMATION TO GATHER (priority order):
1. Personal details: Full name, email, phone, LinkedIn URL, GitHub URL, location
2. Target role clarification: What specific role/level are they targeting? Why this role? What excites them?
3. Work experience: For each role — company, title, dates, specific projects, technologies used, team size, quantified achievements (numbers!)
4. Key achievements: Biggest wins, metrics (%, $, time saved, users impacted, scale)
5. Technical skills: Strongest technologies, proficiency levels, any JD-required skills they haven't mentioned
6. Education: Degree, university, graduation year, GPA (if strong), relevant coursework
7. Certifications: Any relevant certifications or training
8. Projects: Side projects, open source contributions, hackathon wins, notable personal work
9. Career narrative: What story should the resume tell? What's their unique value proposition?
10. Preferences: Sections to emphasize/de-emphasize, specific achievements to highlight, tone`;

const QUESTION_MODE_INSTRUCTIONS = {
  express: `\n\nQUESTION MODE: EXPRESS (3-4 exchanges MAXIMUM)
You MUST reach [READY_TO_GENERATE] within 3-4 exchanges total. Be efficient:
- Exchange 1: Ask for name, contact info, and target role in one message
- Exchange 2: Ask about their most recent/relevant work experience + key achievements
- Exchange 3: Ask about education and top technical skills
- Exchange 3 or 4: Summarize what you have and include [READY_TO_GENERATE]
Do NOT ask more than 4 questions total. Combine related questions. Speed is the priority.`,

  standard: `\n\nQUESTION MODE: STANDARD (6-8 exchanges)
Aim for 6-8 exchanges before including [READY_TO_GENERATE]. Cover all major areas:
personal details, target role, work experience (2-3 roles), key achievements, technical skills, education.
Skip certifications/projects if context already provides them. Balance depth with efficiency.`,

  detailed: `\n\nQUESTION MODE: DETAILED (10-12 exchanges)
Take your time — aim for 10-12 exchanges. Go deep into:
- Each work experience individually (ask follow-ups about metrics, team size, tech stack)
- Career narrative and unique value proposition
- Projects and certifications in detail
- Specific preferences for resume tone, sections to emphasize
- Leadership, mentoring, architecture decisions for senior roles
Ask follow-up questions to extract more specific metrics and details from vague answers.`,
};

function buildChatSystemPrompt(questionMode) {
  const smartBehavior = `

SMART BEHAVIOR:
- If a JD was provided, focus on aligning their experience with JD requirements — call out specific JD keywords you'd like them to address
- If a PDF resume was uploaded, you can see its content — focus on enhancing existing info and filling gaps rather than re-collecting basics
- If notes were provided, use them and don't re-ask what's already known
- If returning user (memory available), greet them by name and build on what you know
- Skip questions where you already have clear answers from provided context
- Infer seniority level from JD and tailor question depth accordingly
- For senior roles, ask about leadership, architecture decisions, mentoring
- For junior roles, focus on projects, education, internships, learning trajectory

READINESS SIGNAL:
When you have gathered enough information per the question mode, deliver an encouraging summary of what you've gathered (key strengths, target role alignment, standout achievements) and include [READY_TO_GENERATE] at the very end of your message. The resume will be generated IMMEDIATELY after you include this token, so make sure you have enough info.

CRITICAL: Do NOT generate the resume yourself. Only gather information. The resume will be generated by a specialized engine after this conversation.`;

  return CHAT_SYSTEM_PROMPT + (QUESTION_MODE_INSTRUCTIONS[questionMode] || QUESTION_MODE_INSTRUCTIONS.standard) + smartBehavior;
}

/* ═══════════════════════════════════════════════════════════════════════════
   API CALLERS (chat-specific — smaller max_completion_tokens)
   ═══════════════════════════════════════════════════════════════════════════ */
async function chatAnthropic(provider, systemPrompt, messages, pdfBase64) {
  const apiMessages = messages.map((msg, i) => {
    if (i === 0 && msg.role === "user" && pdfBase64) {
      return {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: msg.content },
        ],
      };
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
      max_completion_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Anthropic API error");
  return data.content?.map((b) => b.text || "").join("") || "";
}

async function chatOpenAI(provider, systemPrompt, messages, pdfBase64) {
  const apiMessages = [{ role: "system", content: systemPrompt }];

  messages.forEach((msg, i) => {
    if (i === 0 && msg.role === "user" && pdfBase64) {
      apiMessages.push({
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: "resume.pdf",
              file_data: `data:application/pdf;base64,${pdfBase64}`,
            },
          },
          { type: "text", text: msg.content },
        ],
      });
    } else {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  });

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      max_completion_tokens: 1024,
      messages: apiMessages,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "OpenAI API error");
  return data.choices?.[0]?.message?.content || "";
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACT EXTRACTION — extract key facts from user messages for long-term memory
   ═══════════════════════════════════════════════════════════════════════════ */
function extractFacts(messages) {
  const userText = messages
    .filter((m) => m.role === "user" && !m.isContext)
    .map((m) => m.content)
    .join(" ");

  const facts = [];

  const nameMatch = userText.match(
    /(?:my name is|I'm|I am|name:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i
  );
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

/* ═══════════════════════════════════════════════════════════════════════════
   CHATBOT COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function ChatBot({
  provider,
  jobInput,
  notes,
  pdfBase64,
  pdfName,
  questionMode,
  onReady,
  onBack,
  onSkip,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [exchangeCount, setExchangeCount] = useState(0);
  const [memoryCleared, setMemoryCleared] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const memoryRef = useRef(loadMemory());
  const initRef = useRef(false);

  /* ── scroll to bottom on new messages ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  /* ── focus input after AI responds ── */
  useEffect(() => {
    if (!isLoading && inputRef.current) inputRef.current.focus();
  }, [isLoading]);

  /* ── auto-generate when ready (no waiting for user to click) ── */
  const autoGenerateRef = useRef(false);
  const handleGenerateRef = useRef(null);
  useEffect(() => {
    if (isReady && !isLoading && !autoGenerateRef.current && handleGenerateRef.current) {
      autoGenerateRef.current = true;
      // Small delay so the final message renders before transitioning
      const timer = setTimeout(() => handleGenerateRef.current(), 800);
      return () => clearTimeout(timer);
    }
  }, [isReady, isLoading]);

  /* ── initialize chat with context ── */
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const memory = memoryRef.current;
    const contextParts = [];

    if (memory.facts.length > 0) {
      contextParts.push(
        `REMEMBERED FROM PREVIOUS SESSIONS:\n${memory.facts.map((f) => `• ${f}`).join("\n")}`
      );
    }
    if (memory.conversations.length > 0) {
      const last = memory.conversations[memory.conversations.length - 1];
      contextParts.push(
        `LAST SESSION: ${new Date(last.timestamp).toLocaleDateString()}\nPrevious discussion summary: ${last.summary || "Resume creation"}`
      );
    }
    if (jobInput?.trim()) {
      contextParts.push(`TARGET ROLE / JOB DESCRIPTION:\n${jobInput.trim()}`);
    }
    if (notes?.trim()) {
      contextParts.push(`USER NOTES:\n${notes.trim()}`);
    }
    if (pdfBase64) {
      contextParts.push(
        `PDF RESUME UPLOADED: "${pdfName}" (attached below for your analysis — extract and reference its content)`
      );
    }
    if (contextParts.length === 0) {
      contextParts.push(
        "No initial context provided. Start by asking what role the user is targeting."
      );
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
          buildChatSystemPrompt(questionMode),
          [{ role: initMessage.role, content: initMessage.content }],
          pdfBase64
        );

        let clean = response;
        if (response.includes("[READY_TO_GENERATE]")) {
          clean = response.replace(/\[READY_TO_GENERATE\]/g, "").trim();
          setIsReady(true);
        }

        setMessages((prev) => [...prev, { role: "assistant", content: clean }]);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── send a user message ── */
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
      // Build API messages (strip isContext flag)
      const apiMessages = updated.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const fn = provider.id === "anthropic" ? chatAnthropic : chatOpenAI;
      const response = await fn(provider, buildChatSystemPrompt(questionMode), apiMessages, pdfBase64);

      let clean = response;
      if (response.includes("[READY_TO_GENERATE]")) {
        clean = response.replace(/\[READY_TO_GENERATE\]/g, "").trim();
        setIsReady(true);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: clean }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /* ── finalize and trigger resume generation ── */
  const handleGenerate = () => {
    const memory = memoryRef.current;

    // Extract facts for long-term memory
    const newFacts = extractFacts(messages);
    for (const fact of newFacts) {
      const prefix = fact.split(":")[0] + ":";
      memory.facts = memory.facts.filter((f) => !f.startsWith(prefix));
      memory.facts.push(fact);
    }

    // Save conversation summary
    const userAnswers = messages
      .filter((m) => m.role === "user" && !m.isContext)
      .map((m) => m.content);

    memory.conversations.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      summary: userAnswers.join(" | ").slice(0, 500),
    });

    saveMemory(memory);

    // Build transcript for resume generation
    const transcript = messages
      .filter((m) => !m.isContext)
      .map((m) => `${m.role === "user" ? "Candidate" : "Advisor"}: ${m.content}`)
      .join("\n\n");

    onReady(transcript);
  };
  handleGenerateRef.current = handleGenerate;

  /* ── keyboard handling ── */
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── clear memory ── */
  const clearMemory = () => {
    localStorage.removeItem(MEMORY_KEY);
    memoryRef.current = { facts: [], conversations: [] };
    setMemoryCleared(true);
    setTimeout(() => setMemoryCleared(false), 2000);
  };

  /* ── derived state ── */
  const visibleMessages = messages.filter((m) => !m.isContext);
  const showManualReady = exchangeCount >= 2 && !isReady;
  const hasFacts = memoryRef.current.facts.length > 0;

  const suggestions =
    exchangeCount === 0 || isLoading
      ? []
      : isReady
        ? []
        : [
            "Tell me more about that",
            "I'd rather skip this",
            "That's all I have — let's generate!",
          ];

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 140px)",
        minHeight: 500,
      }}
    >
      {/* ── HEADER ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            className="btn-ghost"
            style={{
              background: "transparent",
              border: "1px solid #2a2a2a",
              color: "#555",
              padding: "6px 14px",
              borderRadius: 3,
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            ← Back
          </button>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.15em",
                color: "#c9991a",
                textTransform: "uppercase",
              }}
            >
              Career Advisor Chat
              <span style={{ color: "#666", marginLeft: 8, fontSize: 10 }}>
                {questionMode === "express" ? "⚡ Express" : questionMode === "detailed" ? "◆ Detailed" : "◈ Standard"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#444" }}>
              {hasFacts
                ? `🧠 ${memoryRef.current.facts.length} facts remembered from past sessions`
                : "Gathering information for your perfect resume"}
            </div>
          </div>
        </div>
        <button
          onClick={onSkip}
          className="btn-ghost"
          style={{
            background: "transparent",
            border: "1px solid #2a2a2a",
            color: "#555",
            padding: "6px 14px",
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Skip Chat →
        </button>
      </div>

      {/* ── MESSAGES ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.5rem 0",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {visibleMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              animation: "fadeIn 0.3s ease forwards",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "0.85rem 1.1rem",
                borderRadius:
                  msg.role === "user"
                    ? "14px 14px 3px 14px"
                    : "14px 14px 14px 3px",
                background: msg.role === "user" ? "#1a1508" : "#0d0d0d",
                border: `1px solid ${msg.role === "user" ? "#2a2000" : "#1e1e1e"}`,
                color: msg.role === "user" ? "#d4c8a0" : "#bbb0a0",
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.role === "assistant" && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#c9991a",
                    marginBottom: 6,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  ◈ ResumeForge Advisor
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {/* ── typing indicator ── */}
        {isLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "0.85rem 1.1rem",
                borderRadius: "14px 14px 14px 3px",
                background: "#0d0d0d",
                border: "1px solid #1e1e1e",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#c9991a",
                  marginBottom: 6,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                ◈ ResumeForge Advisor
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#c9991a",
                      opacity: 0.6,
                      animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div
          style={{
            background: "#110505",
            border: "1px solid #3a1515",
            borderRadius: 3,
            padding: "0.65rem 1rem",
            color: "#c55",
            fontSize: 12,
            margin: "0.5rem 0",
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* ── QUICK SUGGESTIONS ── */}
      {suggestions.length > 0 && !isLoading && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            padding: "0.4rem 0",
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              style={{
                background: "transparent",
                border: "1px solid #2a2a2a",
                color: "#666",
                padding: "5px 14px",
                borderRadius: 20,
                cursor: "pointer",
                fontSize: 11,
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = "#c9991a";
                e.target.style.color = "#c9991a";
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = "#2a2a2a";
                e.target.style.color = "#666";
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── INPUT AREA ── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          padding: "0.75rem 0 0.25rem",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isReady
              ? "Add more details or click Generate below..."
              : "Type your answer... (Enter to send, Shift+Enter for new line)"
          }
          rows={1}
          style={{
            flex: 1,
            background: "#0d0d0d",
            border: "1px solid #222",
            borderRadius: 8,
            color: "#ccc8c0",
            padding: "0.7rem 1rem",
            fontSize: 13,
            resize: "none",
            fontFamily: "'Georgia', 'Times New Roman', serif",
            minHeight: 44,
            maxHeight: 120,
            boxSizing: "border-box",
            lineHeight: 1.5,
          }}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height =
              Math.min(e.target.scrollHeight, 120) + "px";
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={isLoading || !input.trim()}
          style={{
            background: input.trim() && !isLoading ? "#c9991a" : "#1a1a1a",
            color: input.trim() && !isLoading ? "#000" : "#555",
            border: "none",
            borderRadius: 8,
            padding: "0.7rem 1.25rem",
            cursor: input.trim() && !isLoading ? "pointer" : "default",
            fontSize: 14,
            fontWeight: 700,
            transition: "all 0.2s",
            minHeight: 44,
            fontFamily: "inherit",
          }}
        >
          ↑
        </button>
      </div>

      {/* ── AUTO-GENERATING NOTICE ── */}
      {isReady && (
        <div style={{ padding: "0.75rem 0", textAlign: "center" }}>
          <div style={{
            background: "#1a1508",
            border: "1px solid #c9991a",
            borderRadius: 3,
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}>
            <div style={{
              width: 18,
              height: 18,
              border: "2px solid #2a2a2a",
              borderTop: "2px solid #c9991a",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }} />
            <span style={{ color: "#c9991a", fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Generating your resume...
            </span>
          </div>
        </div>
      )}

      {/* ── MANUAL GENERATE BUTTON (before AI signals ready) ── */}
      {showManualReady && !isReady && (
        <div style={{ padding: "0.5rem 0" }}>
          <button
            onClick={handleGenerate}
            className="btn-gold"
            style={{
              width: "100%",
              background: "#1a1508",
              color: "#c9991a",
              border: "1px solid #c9991a",
              borderRadius: 3,
              padding: "0.9rem",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              transition: "all 0.3s",
            }}
          >
            I'm Ready — Generate Resume →
          </button>
          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "#444",
              margin: "0.5rem 0 0",
            }}
          >
            The advisor recommends a few more questions for the best result
          </p>
        </div>
      )}

      {/* ── MEMORY FOOTER ── */}
      {hasFacts && (
        <div style={{ textAlign: "center", padding: "0.25rem 0 0.5rem" }}>
          <button
            onClick={clearMemory}
            style={{
              background: "transparent",
              border: "none",
              color: memoryCleared ? "#5a9a5a" : "#333",
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.2s",
            }}
          >
            {memoryCleared
              ? "✓ Memory cleared"
              : `🧠 Remembered: ${memoryRef.current.facts.join(" · ")} — click to clear`}
          </button>
        </div>
      )}
    </div>
  );
}
