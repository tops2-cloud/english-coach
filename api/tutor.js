// Vercel Serverless Function: /api/tutor
// ส่งข้อความไปหา Claude แล้วส่งคำตอบกลับให้แอพ
// รองรับ 2 ผู้ให้บริการ ใส่คีย์อย่างใดอย่างหนึ่ง (หรือทั้งคู่) ใน Vercel → Settings → Environment Variables:
//   GEMINI_API_KEY     คีย์ฟรีจาก aistudio.google.com (Google Gemini)
//   ANTHROPIC_API_KEY  คีย์แบบเติมเงินจาก console.anthropic.com (Claude)
// ตัวเลือกเพิ่มเติม (ไม่บังคับ):
//   AI_PROVIDER        "gemini" หรือ "claude" ถ้ามีทั้งสองคีย์ (ค่าเริ่มต้น: ใช้ Claude ถ้ามีคีย์ ไม่งั้นใช้ Gemini)
//   GEMINI_MODEL       ค่าเริ่มต้น gemini-flash-latest
//   ANTHROPIC_MODEL    ค่าเริ่มต้น claude-haiku-5-5
//   APP_PASSCODE       ถ้าตั้งไว้ ผู้ใช้ต้องใส่รหัสนี้ก่อนคุยกับครู AI

const LEVEL_TEXT = {
  beginner: "The learner is a Thai adult beginner (about CEFR A1–A2). Use short, simple sentences and common words.",
  work: "The learner is a Thai working professional (about CEFR A2–B1) who needs English for meetings, emails and interviews. Use clear, natural business English.",
};

const MODE_TEXT = {
  chat: "Have a friendly everyday conversation. Ask one simple follow-up question each turn to keep the learner talking.",
  correct: "The learner sends sentences to check, or asks grammar questions (possibly in Thai). Give the corrected sentence, then explain the grammar point in Thai with one or two extra examples. In this mode you may write the explanation mainly in Thai.",
  interview: "Role-play a friendly job interviewer. Ask one common interview question per turn, react briefly to the learner's answer, then ask the next question. After about 6 questions, give overall feedback in Thai.",
  meeting: "Role-play a team lead running a short work meeting. Ask the learner for updates, opinions, and next steps, one thing per turn.",
  restaurant: "Role-play a staff member at a restaurant or a hotel/tourist counter. Keep it realistic and simple, one step of the interaction per turn.",
};

function systemPrompt(mode, level) {
  return [
    "You are a warm, encouraging English coach for Thai speakers inside a learning app.",
    LEVEL_TEXT[level] || LEVEL_TEXT.beginner,
    MODE_TEXT[mode] || MODE_TEXT.chat,
    "",
    "Reply format rules (important):",
    "1. Write your conversational reply in English first, 1–3 short sentences. Do not use markdown, bullet points or headings.",
    "2. If the learner's last message has grammar, vocabulary or wording mistakes, add a new line that starts with ✏️ followed by the corrected sentence, then a short explanation in Thai.",
    "3. If a useful word or phrase would help them, you may add one more line that starts with 💡 with the phrase and its Thai meaning.",
    "4. If the learner writes in Thai, help them say it in English: give the English version on a ✏️ line, then continue the conversation.",
    "5. Never correct things that are already fine. Keep corrections kind and brief.",
    "Stay on topic as an English coach and keep the content appropriate for all ages.",
  ].join("\n");
}

// แปลงประวัติแชทให้ถูกรูปแบบของ API: ขึ้นต้นด้วย user และสลับ user/assistant
function normalize(messages) {
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const content = String(m.content || "").slice(0, 1500).trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n" + content;
    else out.push({ role: m.role, content });
  }
  if (out.length && out[0].role === "assistant") out.unshift({ role: "user", content: "(The learner opened the lesson.)" });
  return out;
}

function pickProvider() {
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  if (want === "gemini" && hasGemini) return "gemini";
  if (want === "claude" && hasClaude) return "claude";
  if (hasClaude) return "claude";
  if (hasGemini) return "gemini";
  return null;
}

async function askClaude(system, msgs) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 500,
      system,
      messages: msgs,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
}

async function geminiCall(model, system, msgs) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || `HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
}

async function askGemini(system, msgs) {
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  try {
    return await geminiCall(model, system, msgs);
  } catch (e) {
    if (e.status === 429) throw new Error("ใช้ครู AI ครบโควตาฟรีของ Gemini แล้ว รอสักครู่หรือพรุ่งนี้แล้วลองใหม่");
    // ถ้ารุ่นที่ตั้งไว้ใช้ไม่ได้ ลองรุ่นสำรอง
    if (!process.env.GEMINI_MODEL && (e.status === 404 || e.status === 400)) return geminiCall("gemini-3.5-flash-lite", system, msgs);
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const passcode = process.env.APP_PASSCODE;
  if (passcode && req.headers["x-app-passcode"] !== passcode) {
    return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  }

  const provider = pickProvider();
  if (!provider) {
    return res.status(500).json({ error: "ครู AI ยังไม่เปิดใช้งาน: ใส่ GEMINI_API_KEY (ฟรี) หรือ ANTHROPIC_API_KEY ใน Vercel → Settings → Environment Variables แล้ว Redeploy" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { mode = "chat", level = "beginner", messages = [] } = body || {};
  const msgs = normalize(Array.isArray(messages) ? messages.slice(-20) : []);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") {
    return res.status(400).json({ error: "ไม่มีข้อความให้ตอบ" });
  }

  try {
    const system = systemPrompt(mode, level);
    const reply = provider === "claude" ? await askClaude(system, msgs) : await askGemini(system, msgs);
    return res.status(200).json({ reply: reply || "Sorry, could you say that again?", provider });
  } catch (e) {
    return res.status(502).json({ error: "ครู AI ตอบไม่ได้ตอนนี้: " + (e.message || "เชื่อมต่อไม่สำเร็จ") });
  }
}
