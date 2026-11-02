import { LEVELS, VOCAB, QUIZ, PHRASES, TUTOR_MODES } from "./data.js";

/* =========================================================
   ที่เก็บข้อมูล (บันทึกในเครื่องผู้ใช้ด้วย localStorage)
   ========================================================= */
const KEY = "english-coach-v1";
const DAILY_GOAL = 50; // XP ต่อวัน
const NEW_PER_DAY = 10; // คำใหม่ต่อวันต่อระดับ

const defaultState = () => ({
  level: "beginner",
  cards: {},            // id -> { interval, ease, due, reps, lapses }
  days: {},             // "YYYY-MM-DD" -> xp
  newSeen: {},          // "YYYY-MM-DD|level" -> จำนวนคำใหม่ที่เปิดวันนี้
  quiz: { correct: 0, total: 0 },
  speak: { attempts: 0, sum: 0 },
  tutorMsgs: 0,
  passcode: "",
  profile: { name: "", job: "", goal: "", interests: "" },
  notes: "",            // สิ่งที่ครู AI จำได้เกี่ยวกับผู้เรียน (สรุปอัตโนมัติ)
  notesAt: 0,
});

let S = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = defaultState(), o = JSON.parse(raw); return { ...d, ...o, profile: { ...d.profile, ...(o.profile || {}) } }; }
  } catch (e) {}
  return defaultState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}

const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
function addXP(n) {
  const t = today();
  S.days[t] = (S.days[t] || 0) + n;
  save();
}
function streak() {
  let n = 0;
  const d = new Date();
  if (!S.days[today(d)]) d.setDate(d.getDate() - 1); // ยังไม่ได้เรียนวันนี้ ก็ยังไม่ขาด
  while (S.days[today(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* =========================================================
   เครื่องมือช่วย
   ========================================================= */
const $view = document.getElementById("view");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- อ่านออกเสียง (Text-to-Speech) ---------- */
let voices = [];
function loadVoices() { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(text, rate = 0.95) {
  if (!window.speechSynthesis) { toast("เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const v = voices.find((v) => v.lang === "en-US" && /Google|Samantha|Natural/i.test(v.name)) ||
            voices.find((v) => v.lang && v.lang.startsWith("en"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* ---------- ฟังเสียงพูด (Speech Recognition) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen({ onResult, onEnd, onError }) {
  if (!SR) { onError && onError("unsupported"); return null; }
  const r = new SR();
  r.lang = "en-US";
  r.interimResults = false;
  r.maxAlternatives = 3;
  r.onresult = (e) => {
    const alts = [...e.results[0]].map((a) => a.transcript);
    onResult(alts);
  };
  r.onerror = (e) => onError && onError(e.error);
  r.onend = () => onEnd && onEnd();
  r.start();
  return r;
}

/* =========================================================
   การนำทาง
   ========================================================= */
let current = "home";
let cleanup = null;
const tabs = { home: renderHome, vocab: renderVocab, quiz: renderQuiz, speak: renderSpeak, tutor: renderTutor, profile: renderProfile };

function go(tab) {
  if (cleanup) { cleanup(); cleanup = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (current === "tutor" && tab !== "tutor") summarizeChat();
  current = tab;
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === (tab === "profile" ? "home" : tab)));
  $view.classList.remove("has-composer");
  document.querySelector(".composer")?.remove();
  tabs[tab]();
  window.scrollTo(0, 0);
  history.replaceState(null, "", "#" + tab);
}
document.querySelectorAll(".tabbar button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));

function renderLevelChip() {
  document.getElementById("levelBtn").textContent = LEVELS[S.level].name;
}
document.getElementById("levelBtn").addEventListener("click", () => {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet stack">
    <h2>เลือกระดับ</h2>
    ${Object.entries(LEVELS).map(([k, v]) => `
      <button class="opt ${k === S.level ? "sel" : ""}" data-l="${k}">
        <span style="font-size:26px">${k === "beginner" ? "🌱" : "💼"}</span>
        <span><b>${v.name}</b><br><span class="muted small">${v.desc}</span></span>
      </button>`).join("")}
  </div>`;
  bg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-l]");
    if (b) { S.level = b.dataset.l; save(); renderLevelChip(); go(current); }
    if (b || e.target === bg) bg.remove();
  });
  document.body.appendChild(bg);
});

/* =========================================================
   1) หน้าหลัก / ความคืบหน้า
   ========================================================= */
function renderHome() {
  const xpToday = S.days[today()] || 0;
  const pct = Math.min(100, Math.round((xpToday / DAILY_GOAL) * 100));
  const allCards = Object.values(S.cards);
  const learned = allCards.filter((c) => c.reps > 0).length;
  const mastered = allCards.filter((c) => c.interval >= 21).length;
  const due = dueCards(S.level).length;
  const acc = S.quiz.total ? Math.round((S.quiz.correct / S.quiz.total) * 100) : 0;
  const spk = S.speak.attempts ? Math.round(S.speak.sum / S.speak.attempts) : 0;

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    week.push({ key: today(d), label: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][d.getDay()], xp: S.days[today(d)] || 0, isToday: i === 0 });
  }
  const max = Math.max(DAILY_GOAL, ...week.map((w) => w.xp));

  const nm = S.profile.name;
  $view.innerHTML = `
    <button class="card row profile-card" id="toProfile">
      <span style="font-size:28px">👤</span>
      <span class="grow" style="text-align:left">${nm ? `<b>สวัสดี ${esc(nm)}</b><br><span class="muted small">แก้โปรไฟล์ / ดูสิ่งที่ครู AI จำได้</span>` : `<b>ตั้งโปรไฟล์ผู้เรียน</b><br><span class="muted small">ให้ครู AI รู้จักและจำจุดที่คุณผิดบ่อย</span>`}</span>
      <span class="muted">›</span>
    </button>
    <div class="card hero" style="margin-top:12px">
      <div class="row">
        <div class="grow">
          <div class="small" style="opacity:.85">วันนี้ได้</div>
          <div class="big">${xpToday} <span style="font-size:16px;font-weight:500">/ ${DAILY_GOAL} XP</span></div>
        </div>
        <div class="center">
          <div style="font-size:30px">🔥</div>
          <div><b>${streak()}</b> วันติด</div>
        </div>
      </div>
      <div class="goalbar"><i style="width:${pct}%"></i></div>
      <div class="small" style="margin-top:8px;opacity:.9">${pct >= 100 ? "ครบเป้าวันนี้แล้ว เก่งมาก! 🎉" : `อีก ${DAILY_GOAL - xpToday} XP จะครบเป้าวันนี้`}</div>
    </div>

    <h2>เริ่มเรียนเลย</h2>
    <div class="quick">
      <button data-go="vocab"><div class="qi">🃏</div><b>ทบทวนคำศัพท์</b><small>${due ? `ถึงรอบ ${due} คำ` : "ไม่มีคำค้าง"}</small></button>
      <button data-go="quiz"><div class="qi">✅</div><b>ควิซไวยากรณ์</b><small>ข้อละ +5 XP</small></button>
      <button data-go="speak"><div class="qi">🎤</div><b>ฝึกฟัง-พูด</b><small>ตรวจการออกเสียง</small></button>
      <button data-go="tutor"><div class="qi">🤖</div><b>คุยกับครู AI</b><small>ฝึกสนทนาจริง</small></button>
    </div>

    <h2>7 วันที่ผ่านมา</h2>
    <div class="card">
      <div class="week">
        ${week.map((w) => `<div class="bar ${w.isToday ? "today" : ""}"><i style="height:${Math.round((w.xp / max) * 85)}%"></i><span>${w.label}</span></div>`).join("")}
      </div>
    </div>

    <h2>สถิติรวม</h2>
    <div class="stats">
      <div class="card stat"><div class="n">${learned}</div><div class="l">คำที่เคยเรียน</div></div>
      <div class="card stat"><div class="n">${mastered}</div><div class="l">คำที่จำแม่น (21+ วัน)</div></div>
      <div class="card stat"><div class="n">${acc}%</div><div class="l">ควิซตอบถูก (${S.quiz.total} ข้อ)</div></div>
      <div class="card stat"><div class="n">${spk}</div><div class="l">คะแนนออกเสียงเฉลี่ย</div></div>
    </div>

    <div style="margin-top:24px" class="center">
      <button class="btn ghost small" id="reset">ล้างข้อมูลการเรียนทั้งหมด</button>
    </div>
  `;
  $view.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  $view.querySelector("#toProfile").addEventListener("click", () => go("profile"));
  $view.querySelector("#reset").addEventListener("click", () => {
    if (confirm("ล้างความคืบหน้าทั้งหมดในเครื่องนี้? ย้อนกลับไม่ได้")) {
      const lvl = S.level; S = defaultState(); S.level = lvl; save(); go("home"); toast("ล้างข้อมูลแล้ว");
    }
  });
}

/* =========================================================
   2) แฟลชการ์ด + ระบบทบทวนตามรอบ (Spaced Repetition)
   ========================================================= */
const cardId = (level, w) => level + ":" + w.en;
const DAY = 86400000;

function dueCards(level) {
  const now = Date.now();
  return VOCAB[level].filter((w) => { const c = S.cards[cardId(level, w)]; return c && c.due <= now; });
}
function newCards(level) {
  const used = S.newSeen[today() + "|" + level] || 0;
  const left = Math.max(0, NEW_PER_DAY - used);
  return VOCAB[level].filter((w) => !S.cards[cardId(level, w)]).slice(0, left);
}

// grade: 0 = จำไม่ได้, 1 = ยาก, 2 = ได้, 3 = ง่าย (แบบย่อของ SM-2)
function gradeCard(level, w, grade) {
  const id = cardId(level, w);
  const isNew = !S.cards[id];
  const c = S.cards[id] || { interval: 0, ease: 2.5, due: 0, reps: 0, lapses: 0 };
  if (grade === 0) {
    c.interval = 0; c.lapses++; c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = Date.now() + 60 * 1000; // กลับมาอีกครั้งในรอบนี้
  } else {
    if (c.interval === 0) c.interval = grade === 3 ? 4 : grade === 2 ? 1 : 0.5;
    else c.interval = c.interval * (grade === 1 ? 1.2 : grade === 2 ? c.ease : c.ease * 1.3);
    if (grade === 1) c.ease = Math.max(1.3, c.ease - 0.15);
    if (grade === 3) c.ease += 0.15;
    c.interval = Math.round(c.interval * 10) / 10;
    c.due = Date.now() + c.interval * DAY;
  }
  c.reps++;
  S.cards[id] = c;
  if (isNew) { const k = today() + "|" + level; S.newSeen[k] = (S.newSeen[k] || 0) + 1; }
  addXP(grade >= 2 ? 2 : 1);
}
const fmtInterval = (d) => d < 1 ? "<1 วัน" : d < 30 ? Math.round(d) + " วัน" : Math.round(d / 30) + " เดือน";
function preview(level, w, grade) {
  const c = S.cards[cardId(level, w)] || { interval: 0, ease: 2.5 };
  if (grade === 0) return "อีกครั้ง";
  let i = c.interval === 0 ? (grade === 3 ? 4 : grade === 2 ? 1 : 0.5) : c.interval * (grade === 1 ? 1.2 : grade === 2 ? c.ease : c.ease * 1.3);
  return fmtInterval(i);
}

function renderVocab() {
  const level = S.level;
  let queue = shuffle([...dueCards(level), ...newCards(level)]);
  const total = queue.length;
  let done = 0;
  let flipped = false;

  if (!total) {
    const learned = VOCAB[level].filter((w) => S.cards[cardId(level, w)]).length;
    const next = Object.entries(S.cards).filter(([k]) => k.startsWith(level + ":")).map(([, c]) => c.due).sort((a, b) => a - b)[0];
    $view.innerHTML = `
      <h1>คำศัพท์ · ${LEVELS[level].name}</h1>
      <div class="card empty">
        <div class="e">🎉</div>
        <h2>ทบทวนครบแล้วสำหรับตอนนี้</h2>
        <p class="muted">เรียนไปแล้ว ${learned}/${VOCAB[level].length} คำ${next ? ` · รอบถัดไป ${new Date(next).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
        <button class="btn primary" id="more">เรียนคำใหม่เพิ่มอีก 5 คำ</button>
      </div>
      ${wordList(level)}`;
    $view.querySelector("#more").addEventListener("click", () => {
      const k = today() + "|" + level;
      S.newSeen[k] = Math.max(0, (S.newSeen[k] || 0) - 5); save();
      if (!newCards(level).length) toast("เรียนครบทุกคำในระดับนี้แล้ว ลองเปลี่ยนระดับดู");
      else renderVocab();
    });
    bindSay();
    return;
  }

  function draw() {
    const w = queue[0];
    if (!w) { toast(`ทบทวนครบ ${total} คำ +XP`); renderVocab(); return; }
    const isNew = !S.cards[cardId(level, w)];
    flipped = false;
    $view.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <div class="grow progress"><i style="width:${(done / total) * 100}%"></i></div>
        <span class="small muted">${done}/${total}</span>
      </div>
      <div class="card flash" id="flash">
        <button class="icon-btn speak" id="sayWord" aria-label="ฟังเสียง">🔊</button>
        ${isNew ? `<span class="pill" style="margin-bottom:10px">คำใหม่</span>` : ""}
        <div class="word">${esc(w.en)}</div>
        <div class="pos">${esc(w.pos)}</div>
        <div id="back" hidden style="width:100%">
          <div class="meaning">${esc(w.th)}</div>
          <div class="ex">
            <div class="en">${esc(w.ex)} <button class="say" data-say="${esc(w.ex)}" style="border:0;background:none">🔊</button></div>
            <div class="muted small">${esc(w.exTh)}</div>
          </div>
        </div>
        <div class="hint" id="hint">แตะการ์ดเพื่อดูความหมาย</div>
      </div>
      <div id="actions" style="margin-top:14px">
        <button class="btn primary block" id="show">ดูความหมาย</button>
      </div>`;
    const flip = () => {
      if (flipped) return;
      flipped = true;
      $view.querySelector("#back").hidden = false;
      $view.querySelector("#hint").hidden = true;
      $view.querySelector("#actions").innerHTML = `
        <div class="grades">
          ${["จำไม่ได้", "ยาก", "ได้", "ง่าย"].map((t, g) => `<button class="btn g${g}" data-g="${g}">${t}<small>${preview(level, w, g)}</small></button>`).join("")}
        </div>`;
      $view.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => {
        const g = +b.dataset.g;
        gradeCard(level, w, g);
        queue.shift();
        if (g === 0) queue.splice(Math.min(3, queue.length), 0, w); // ถามซ้ำอีกไม่กี่ใบถัดไป
        else done++;
        draw();
      }));
    };
    $view.querySelector("#flash").addEventListener("click", (e) => { if (!e.target.closest("button")) flip(); });
    $view.querySelector("#show").addEventListener("click", flip);
    $view.querySelector("#sayWord").addEventListener("click", () => speak(w.en, 0.85));
    bindSay();
    speak(w.en, 0.85);
  }
  draw();
}
function wordList(level) {
  return `<h2>คำทั้งหมดในระดับนี้</h2>
    <div class="card" style="padding:4px 16px">
      ${VOCAB[level].map((w) => {
        const c = S.cards[cardId(level, w)];
        const tag = !c ? `<span class="pill">ยังไม่เรียน</span>` : c.interval >= 21 ? `<span class="pill" style="color:var(--good)">จำแม่น</span>` : `<span class="pill" style="color:var(--brand)">กำลังเรียน</span>`;
        return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)">
          <button class="say" data-say="${esc(w.en)}" style="border:0;background:none;font-size:18px">🔊</button>
          <div class="grow"><b>${esc(w.en)}</b> <span class="muted small">${esc(w.th)}</span></div>${tag}</div>`;
      }).join("")}
    </div>`;
}
function bindSay() {
  $view.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); speak(b.dataset.say); }));
}

/* =========================================================
   3) ควิซไวยากรณ์
   ========================================================= */
function renderQuiz() {
  const level = S.level;
  $view.innerHTML = `
    <h1>ควิซ · ${LEVELS[level].name}</h1>
    <p class="sub">เลือกคำตอบที่ถูก มีคำอธิบายภาษาไทยทุกข้อ</p>
    <div class="stack">
      <button class="btn primary block" data-n="10">เริ่มควิซ 10 ข้อ</button>
      <button class="btn block" data-n="5">ควิซสั้น 5 ข้อ</button>
      <button class="btn block" data-n="${QUIZ[level].length}">ทำทั้งหมด (${QUIZ[level].length} ข้อ)</button>
    </div>`;
  $view.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => runQuiz(level, +b.dataset.n)));
}
function runQuiz(level, n) {
  const qs = shuffle(QUIZ[level]).slice(0, n).map((q) => {
    const order = shuffle(q.c.map((_, i) => i));
    return { ...q, c: order.map((i) => q.c[i]), a: order.indexOf(q.a) };
  });
  let i = 0, score = 0;
  const wrong = [];

  function draw() {
    if (i >= qs.length) return finish();
    const q = qs[i];
    $view.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <div class="grow progress"><i style="width:${(i / qs.length) * 100}%"></i></div>
        <span class="small muted">${i + 1}/${qs.length}</span>
      </div>
      <div class="card stack">
        <div class="q-text">${esc(q.q).replace("___", '<span style="color:var(--brand)">_____</span>')}</div>
        <div class="choices">
          ${q.c.map((c, k) => `<button class="choice" data-k="${k}">${esc(c)}</button>`).join("")}
        </div>
        <div id="after"></div>
      </div>`;
    $view.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      if ($view.querySelector(".choice.correct")) return;
      const k = +b.dataset.k;
      const ok = k === q.a;
      $view.querySelectorAll(".choice").forEach((x) => { x.disabled = true; });
      $view.querySelector(`[data-k="${q.a}"]`).classList.add("correct");
      if (!ok) { b.classList.add("wrong"); wrong.push(q); }
      else { score++; addXP(5); }
      S.quiz.total++; if (ok) S.quiz.correct++; save();
      const full = q.q.replace("___", q.c[q.a]);
      $view.querySelector("#after").innerHTML = `
        <div class="explain"><b>${ok ? "✅ ถูกต้อง!" : "❌ ยังไม่ถูก"}</b><br>${esc(q.why)}
          <div style="margin-top:6px"><button class="say" data-say="${esc(full)}" style="border:0;background:none;padding:0">🔊</button> <i>${esc(full)}</i></div>
        </div>
        <button class="btn primary block" id="next" style="margin-top:12px">${i + 1 < qs.length ? "ข้อต่อไป" : "ดูผล"}</button>`;
      bindSay();
      $view.querySelector("#next").addEventListener("click", () => { i++; draw(); });
    }));
  }
  function finish() {
    const pct = Math.round((score / qs.length) * 100);
    $view.innerHTML = `
      <div class="card empty">
        <div class="e">${pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "💪"}</div>
        <div class="score">${score}/${qs.length}</div>
        <p class="muted">${pct >= 80 ? "ยอดเยี่ยม!" : pct >= 50 ? "ดีแล้ว ฝึกอีกนิด" : "ไม่เป็นไร ลองอีกรอบนะ"} · ได้ ${score * 5} XP</p>
      </div>
      ${wrong.length ? `<h2>ข้อที่ควรทบทวน</h2><div class="stack">${wrong.map((q) => `
        <div class="card"><div><b>${esc(q.q.replace("___", q.c[q.a]))}</b></div><div class="muted small">${esc(q.why)}</div></div>`).join("")}</div>` : ""}
      <div class="stack" style="margin-top:16px">
        <button class="btn primary block" id="again">ทำควิซอีกรอบ</button>
        ${wrong.length ? `<button class="btn block" id="tutor">ให้ครู AI อธิบายเพิ่ม</button>` : ""}
      </div>`;
    $view.querySelector("#again").addEventListener("click", () => runQuiz(level, n));
    $view.querySelector("#tutor")?.addEventListener("click", () => {
      const list = wrong.map((q) => `- ${q.q.replace("___", q.c[q.a])}`).join("\n");
      pendingTutor = { mode: "correct", text: `ช่วยอธิบายไวยากรณ์ในประโยคเหล่านี้เป็นภาษาไทย พร้อมยกตัวอย่างเพิ่ม:\n${list}` };
      go("tutor");
    });
  }
  draw();
}

/* =========================================================
   4) ฝึกฟังและพูด
   ========================================================= */
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
function compare(target, said) {
  const t = norm(target), s = norm(said);
  // LCS เพื่อจับคู่คำตามลำดับ
  const dp = Array.from({ length: t.length + 1 }, () => Array(s.length + 1).fill(0));
  for (let i = 1; i <= t.length; i++) for (let j = 1; j <= s.length; j++)
    dp[i][j] = t[i - 1] === s[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const hit = new Set();
  for (let i = t.length, j = s.length; i > 0 && j > 0;) {
    if (t[i - 1] === s[j - 1]) { hit.add(i - 1); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  const extra = Math.max(0, s.length - hit.size);
  const score = t.length ? Math.max(0, Math.round(((hit.size - extra * 0.25) / t.length) * 100)) : 0;
  return { score, hit, words: target.split(/\s+/) };
}

function renderSpeak() {
  const level = S.level;
  const list = PHRASES[level];
  let idx = Math.floor(Math.random() * list.length);
  let rec = null;
  cleanup = () => { try { rec && rec.abort(); } catch (e) {} };

  function draw(result) {
    const p = list[idx];
    $view.innerHTML = `
      <h1>ฟัง-พูด · ${LEVELS[level].name}</h1>
      <p class="sub">ฟังตัวอย่าง แล้วกดไมค์พูดตาม ระบบจะเทียบคำที่คุณพูด</p>
      <div class="card stack center">
        <div class="phrase">${result ? `<span class="words">${result.words.map((w, i) => `<span class="${result.hit.has(i) ? "ok" : "miss"}">${esc(w)}</span>`).join(" ")}</span>` : esc(p.en)}</div>
        <div class="muted">${esc(p.th)}</div>
        <div class="row" style="justify-content:center">
          <button class="btn" id="play">🔊 ฟัง</button>
          <button class="btn" id="slow">🐢 ฟังช้า</button>
        </div>
      </div>
      <div class="center" style="margin:22px 0 10px">
        <button class="mic" id="mic" aria-label="กดเพื่อพูด">🎤</button>
        <div class="muted small" id="micHint" style="margin-top:8px">${SR ? "กดแล้วพูดประโยคด้านบน" : "เบราว์เซอร์นี้ไม่รองรับการฟังเสียง แนะนำ Chrome บน Android"}</div>
      </div>
      <div id="res">${result ? `
        <div class="card center">
          <div class="score" style="color:${result.score >= 80 ? "var(--good)" : result.score >= 50 ? "var(--warn)" : "var(--bad)"}">${result.score}</div>
          <div>${result.score >= 80 ? "ชัดเจนมาก! 🎉" : result.score >= 50 ? "ใกล้แล้ว ลองอีกครั้ง" : "ลองฟังช้าๆ แล้วพูดตามอีกที"}</div>
          <div class="muted small" style="margin-top:6px">ระบบได้ยินว่า: “${esc(result.heard)}”</div>
        </div>` : ""}</div>
      <div class="row" style="margin-top:14px">
        <button class="btn grow" id="prev">◀ ก่อนหน้า</button>
        <button class="btn grow primary" id="next">ประโยคถัดไป ▶</button>
      </div>`;
    $view.querySelector("#play").addEventListener("click", () => speak(p.en, 0.95));
    $view.querySelector("#slow").addEventListener("click", () => speak(p.en, 0.6));
    $view.querySelector("#prev").addEventListener("click", () => { idx = (idx - 1 + list.length) % list.length; draw(); });
    $view.querySelector("#next").addEventListener("click", () => { idx = (idx + 1) % list.length; draw(); });
    const mic = $view.querySelector("#mic");
    mic.addEventListener("click", () => {
      if (!SR) { toast("ใช้ Chrome บนมือถือ Android เพื่อฝึกพูด"); return; }
      if (rec) { rec.stop(); return; }
      if (window.speechSynthesis) speechSynthesis.cancel();
      mic.classList.add("on");
      $view.querySelector("#micHint").textContent = "กำลังฟัง... พูดได้เลย";
      rec = listen({
        onResult: (alts) => {
          const best = alts.map((a) => ({ a, r: compare(p.en, a) })).sort((x, y) => y.r.score - x.r.score)[0];
          S.speak.attempts++; S.speak.sum += best.r.score; save();
          addXP(best.r.score >= 80 ? 5 : 1);
          draw({ ...best.r, heard: best.a });
        },
        onError: (err) => {
          toast(err === "not-allowed" ? "กรุณาอนุญาตให้ใช้ไมโครโฟน" : err === "no-speech" ? "ไม่ได้ยินเสียง ลองใหม่อีกครั้ง" : "ฟังเสียงไม่สำเร็จ ลองใหม่");
        },
        onEnd: () => { rec = null; mic.classList.remove("on"); const h = $view.querySelector("#micHint"); if (h && h.textContent.startsWith("กำลังฟัง")) h.textContent = "กดแล้วพูดประโยคด้านบน"; },
      });
    });
  }
  draw();
}

/* =========================================================
   5) ครู AI
   ========================================================= */
let pendingTutor = null;
let chat = null; // { mode, messages: [{role, content}] }

function renderTutor() {
  if (pendingTutor) {
    chat = { mode: pendingTutor.mode, messages: [], summarizedAt: 0 };
    const text = pendingTutor.text; pendingTutor = null;
    drawChat();
    send(text);
    return;
  }
  if (chat) return drawChat();
  $view.innerHTML = `
    <h1>ครู AI</h1>
    <p class="sub">เลือกสถานการณ์ที่อยากฝึก ครูจะตอบเป็นภาษาอังกฤษ และแก้จุดผิดพร้อมอธิบายเป็นภาษาไทย</p>
    <button class="card row profile-card" id="toProfile" style="margin-bottom:12px">
      <span style="font-size:24px">🧠</span>
      <span class="grow" style="text-align:left"><b>${S.profile.name ? `ครูรู้จัก ${esc(S.profile.name)} แล้ว` : "ยังไม่ได้ตั้งโปรไฟล์"}</b><br><span class="muted small">${S.notes ? "ครูจำจุดที่คุณผิดบ่อยไว้แล้ว แตะเพื่อดู" : "แตะเพื่อตั้งโปรไฟล์ให้ครูรู้จักคุณ"}</span></span>
      <span class="muted">›</span>
    </button>
    <div class="modes">
      ${TUTOR_MODES.map((m) => `<button class="mode" data-m="${m.id}"><span class="mi">${m.icon}</span><span><b>${m.name}</b><br><span class="muted small">${m.desc}</span></span></button>`).join("")}
    </div>`;
  $view.querySelector("#toProfile").addEventListener("click", () => go("profile"));
  $view.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
    const m = TUTOR_MODES.find((x) => x.id === b.dataset.m);
    chat = newChat(m);
    drawChat();
    speak(chat.messages[0].content);
  }));
}

function newChat(m) {
  let opener = m.opener;
  const nm = S.profile.name.trim();
  if (nm && m.id === "chat") opener = opener.replace(/^Hi!/, `Hi ${nm}!`);
  return { mode: m.id, messages: [{ role: "assistant", content: opener }], summarizedAt: 0 };
}

function splitReply(text) {
  // บรรทัดที่ขึ้นต้นด้วย ✏️ หรือ 💡 คือส่วนแก้คำผิด/คำอธิบายภาษาไทย
  const lines = text.split("\n");
  const main = [], notes = [];
  for (const l of lines) (/^\s*(✏️|💡)/.test(l) ? notes : main).push(l);
  return { main: main.join("\n").trim(), notes: notes.join("\n").trim() };
}

function drawChat() {
  const m = TUTOR_MODES.find((x) => x.id === chat.mode);
  $view.classList.add("has-composer");
  $view.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <button class="icon-btn" id="back" aria-label="กลับ">←</button>
      <div class="grow"><b>${m.icon} ${m.name}</b><div class="muted small">${LEVELS[S.level].name}</div></div>
      <button class="btn ghost small" id="newChat">เริ่มใหม่</button>
    </div>
    <div class="chat" id="chat">
      ${chat.messages.map((msg) => {
        if (msg.role === "user") return `<div class="msg me">${esc(msg.content)}</div>`;
        const { main, notes } = splitReply(msg.content);
        return `<div class="msg bot">${esc(main)}<button class="say" data-say="${esc(main)}" aria-label="ฟัง">🔊</button>${notes ? `<span class="fix">${esc(notes)}</span>` : ""}</div>`;
      }).join("")}
      ${chat.busy ? `<div class="msg bot typing">กำลังพิมพ์...</div>` : ""}
    </div>`;
  bindSay();
  $view.querySelector("#back").addEventListener("click", () => { summarizeChat(); chat = null; go("tutor"); });
  $view.querySelector("#newChat").addEventListener("click", () => { summarizeChat(); chat = newChat(m); drawChat(); });

  if (!document.querySelector(".composer")) {
    const c = document.createElement("div");
    c.className = "composer";
    c.innerHTML = `<div class="inner">
      <button class="icon-btn" id="talk" aria-label="พูด">🎤</button>
      <textarea id="msg" rows="1" placeholder="พิมพ์อังกฤษ หรือถามเป็นไทย"></textarea>
      <button class="icon-btn" id="send" aria-label="ส่ง" style="background:var(--brand);color:#fff;border-color:var(--brand)">➤</button>
    </div>`;
    document.body.appendChild(c);
    const ta = c.querySelector("#msg");
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); c.querySelector("#send").click(); } });
    c.querySelector("#send").addEventListener("click", () => { const t = ta.value.trim(); if (!t || chat.busy) return; ta.value = ""; ta.style.height = "auto"; send(t); });
    let rec = null;
    const talk = c.querySelector("#talk");
    talk.addEventListener("click", () => {
      if (!SR) { toast("ใช้ Chrome บน Android เพื่อพูดแทนการพิมพ์"); return; }
      if (rec) { rec.stop(); return; }
      talk.style.background = "var(--accent)";
      rec = listen({
        onResult: (alts) => { ta.value = (ta.value ? ta.value + " " : "") + alts[0]; ta.dispatchEvent(new Event("input")); },
        onError: (err) => toast(err === "not-allowed" ? "กรุณาอนุญาตให้ใช้ไมโครโฟน" : "ไม่ได้ยินเสียง ลองใหม่"),
        onEnd: () => { rec = null; talk.style.background = ""; },
      });
    });
    cleanup = () => { try { rec && rec.abort(); } catch (e) {} };
  }
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}

async function send(text) {
  chat.messages.push({ role: "user", content: text });
  chat.busy = true;
  drawChat();
  S.tutorMsgs++; addXP(3);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch("/api/tutor", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-app-passcode": S.passcode || "" },
      body: JSON.stringify({ mode: chat.mode, level: S.level, profile: S.profile, notes: S.notes, messages: chat.messages.filter((m) => !m.err).slice(-20).map(({ role, content }) => ({ role, content })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      chat.messages.pop();
      chat.busy = false;
      const code = prompt("แอพนี้ตั้งรหัสผ่านสำหรับครู AI ไว้ กรุณาใส่รหัส:");
      if (code) { S.passcode = code.trim(); save(); return send(text); }
      drawChat();
      return;
    }
    if (!res.ok) throw new Error(data.error || `เชื่อมต่อครู AI ไม่สำเร็จ (รหัส ${res.status})`);
    chat.messages.push({ role: "assistant", content: data.reply });
    chat.busy = false;
    const sinceSum = chat.messages.slice(chat.summarizedAt || 0).filter((m) => m.role === "user").length;
    if (sinceSum >= 8) summarizeChat();
    if (current === "tutor") { drawChat(); speak(splitReply(data.reply).main); }
  } catch (e) {
    chat.busy = false;
    const msg = e.name === "AbortError" ? "ครู AI ไม่ตอบภายใน 1 นาที ลองส่งใหม่อีกครั้ง" : (e.message || "เกิดข้อผิดพลาด");
    chat.messages.push({ role: "assistant", err: true, content: "💡 " + msg });
    if (current === "tutor") drawChat();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- ความจำของครู: สรุปจุดเด่น/จุดที่ผิดบ่อยหลังคุย ---------- */
async function summarizeChat() {
  const c = chat;
  if (!c) return;
  const fresh = c.messages.slice(c.summarizedAt || 0).filter((m) => !m.err);
  if (fresh.filter((m) => m.role === "user").length < 2) return;
  c.summarizedAt = c.messages.length;
  try {
    const res = await fetch("/api/tutor", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", "x-app-passcode": S.passcode || "" },
      body: JSON.stringify({ action: "summarize", level: S.level, profile: S.profile, notes: S.notes, messages: fresh.slice(-30).map(({ role, content }) => ({ role, content })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.notes === "string" && data.notes.trim()) {
      S.notes = data.notes.trim(); S.notesAt = Date.now(); save();
    }
  } catch (e) { /* ไม่เป็นไร รอบหน้าค่อยสรุปใหม่ */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && current === "tutor") summarizeChat(); });

/* =========================================================
   6) โปรไฟล์ผู้เรียน
   ========================================================= */
function renderProfile() {
  const p = S.profile;
  const field = (k, label, ph) => `<label class="stack" style="display:block"><b class="small">${label}</b>
    <input class="field" data-k="${k}" value="${esc(p[k] || "")}" placeholder="${ph}" maxlength="120" /></label>`;
  $view.innerHTML = `
    <div class="row" style="margin-bottom:8px">
      <button class="icon-btn" id="back" aria-label="กลับ">←</button>
      <h1 class="grow" style="margin:0">โปรไฟล์ผู้เรียน</h1>
    </div>
    <p class="sub">ครู AI จะใช้ข้อมูลนี้เพื่อคุยให้ตรงกับคุณ ไม่ต้องกรอกครบทุกช่องก็ได้</p>
    <div class="card stack">
      ${field("name", "ชื่อเล่น (ภาษาอังกฤษ)", "เช่น Top")}
      ${field("job", "อาชีพ / สิ่งที่ทำ", "เช่น พนักงานขาย, นักศึกษา")}
      ${field("goal", "อยากใช้ภาษาอังกฤษเพื่อ", "เช่น สัมภาษณ์งาน, เที่ยวญี่ปุ่น")}
      ${field("interests", "เรื่องที่สนใจ", "เช่น ฟุตบอล, ทำอาหาร, เกม")}
      <button class="btn primary block" id="saveP">บันทึกโปรไฟล์</button>
    </div>

    <h2>🧠 สิ่งที่ครู AI จำได้</h2>
    <div class="card stack">
      <p class="muted small" style="margin:0">ครูสรุปให้อัตโนมัติหลังคุยจบแต่ละครั้ง (จุดที่ผิดบ่อย จุดแข็ง เรื่องที่ชอบคุย) แก้ไขหรือลบได้</p>
      <textarea class="field" id="notes" rows="7" maxlength="1500" placeholder="ยังไม่มี ลองคุยกับครู AI สักพัก แล้วกลับมาดูนะ">${esc(S.notes)}</textarea>
      ${S.notesAt ? `<div class="muted small">อัปเดตล่าสุด ${new Date(S.notesAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>` : ""}
      <div class="row">
        <button class="btn grow" id="clearN">ลบความจำ</button>
        <button class="btn primary grow" id="saveN">บันทึก</button>
      </div>
    </div>
    <p class="muted small center" style="margin-top:16px">ข้อมูลทั้งหมดเก็บไว้ในเครื่องนี้เท่านั้น และจะส่งไปให้ AI ตอนคุยกับครูเท่านั้น<br>ไม่ควรกรอกข้อมูลส่วนตัวที่ละเอียดอ่อน</p>`;
  $view.querySelector("#back").addEventListener("click", () => go("home"));
  $view.querySelector("#saveP").addEventListener("click", () => {
    $view.querySelectorAll("[data-k]").forEach((i) => { S.profile[i.dataset.k] = i.value.trim(); });
    save(); toast("บันทึกโปรไฟล์แล้ว");
  });
  $view.querySelector("#saveN").addEventListener("click", () => { S.notes = $view.querySelector("#notes").value.trim(); S.notesAt = Date.now(); save(); toast("บันทึกแล้ว"); });
  $view.querySelector("#clearN").addEventListener("click", () => {
    if (confirm("ลบสิ่งที่ครู AI จำได้ทั้งหมด?")) { S.notes = ""; S.notesAt = 0; save(); renderProfile(); toast("ลบความจำแล้ว"); }
  });
}

/* =========================================================
   เริ่มแอพ
   ========================================================= */
renderLevelChip();
const start = location.hash.slice(1);
go(tabs[start] ? start : "home");
