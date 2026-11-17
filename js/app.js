import { LEVELS, VOCAB, QUIZ, PHRASES, TUTOR_MODES, LANG_META, PARTNER_UI } from "./data.js";
import { LANG_CONTENT } from "./data-langs.js";
import { EN_INTER, LANG_INTER } from "./data-inter.js";
import { JA_EXTRA, JA_KANA_MAP, JA_KANA_OPENERS } from "./data-ja.js";
import { CHARTS } from "./data-chart.js";

// ระดับกลางของภาษาอังกฤษใช้โครงเดียวกับระดับอื่น
VOCAB.intermediate = EN_INTER.vocab;
QUIZ.intermediate = EN_INTER.quiz;
PHRASES.intermediate = EN_INTER.phrases;
const LANG_LEVELS = { beginner: "ผู้เริ่มต้น", intermediate: "ระดับกลาง" }; // ระดับของภาษาอื่น

const LEARN_LANGS = ["en", "ko", "ja", "zh", "vi"];

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
  notes: "",            // (เวอร์ชันเก่า) ย้ายไป notesBy.en
  notesBy: {},          // lang -> สิ่งที่ครู AI จำได้เกี่ยวกับผู้เรียน (สรุปอัตโนมัติ)
  notesAtBy: {},
  lang: "en",           // ภาษาที่กำลังเรียน
});

let S = load();
if (S.notes && !S.notesBy.en) { S.notesBy.en = S.notes; S.notesAtBy.en = S.notesAt || Date.now(); S.notes = ""; }
if (!LEARN_LANGS.includes(S.lang)) S.lang = "en";
const getNotes = (l = S.lang) => S.notesBy[l] || "";
const setNotes = (l, t) => { S.notesBy[l] = t; S.notesAtBy[l] = t ? Date.now() : 0; save(); };

/* ---------- ชุดบทเรียน (deck) ----------
   อังกฤษ: ชื่อระดับ (beginner/intermediate/work)
   ภาษาอื่น: ผู้เริ่มต้น = ชื่อภาษา (เช่น "ko"), ระดับกลาง = "ko-int"
   ญี่ปุ่นมีชุดเพิ่ม: "ja-hira" ฮิรางานะ, "ja-kata" คาตาคานะ, "ja-sign" ป้ายที่เจอบ่อย */
const LEVEL_NAME = { beginner: "ผู้เริ่มต้น", intermediate: "ระดับกลาง", hira: "ฮิรางานะ", kata: "คาตาคานะ", sign: "ป้ายที่เจอบ่อย" };
const LEVEL_SHORT = { beginner: "เริ่มต้น", intermediate: "กลาง", hira: "ฮิรางานะ", kata: "คาตาคานะ", sign: "ป้าย" };
const SUFFIX = { intermediate: "int", hira: "hira", kata: "kata", sign: "sign" };
const LEVEL_OF_SUFFIX = { int: "intermediate", hira: "hira", kata: "kata", sign: "sign" };
const langLevel = (l = S.lang) => (S.langLevel && S.langLevel[l]) || "beginner";
const levelOf = (l = S.lang) => (l === "en" ? S.level : langLevel(l));
const deckFor = (l, lv) => (l === "en" ? lv : lv === "beginner" || !SUFFIX[lv] ? l : l + "-" + SUFFIX[lv]);
const deck = () => deckFor(S.lang, levelOf());
const deckLang = (d) => (LEVELS[d] ? "en" : d.split("-")[0]);
const deckLevel = (d) => (LEVELS[d] ? d : LEVEL_OF_SUFFIX[d.split("-")[1]] || "beginner");
const deckLabel = (d = deck()) => LEVELS[d]
  ? `${LANG_META.en.flag} อังกฤษ · ${LEVELS[d].name}`
  : `${LANG_META[deckLang(d)].flag} ${LANG_META[deckLang(d)].name} · ${LEVEL_NAME[deckLevel(d)]}`;
function langSet(d) {
  const [l, suf] = d.split("-");
  if (!suf) return LANG_CONTENT[l];
  if (suf === "int") return LANG_INTER[l];
  return JA_EXTRA[suf];
}

// ---------- ญี่ปุ่น: แสดงคันจิเป็นฮิรางานะ (ค่าเริ่มต้น: เปิด) ----------
const jaKanaOn = (d) => S.jaKana !== false && (d === "ja" || d === "ja-int");
// ตารางแปลง: ประโยคจาก JA_KANA_MAP + คำศัพท์ (เอาคานะจากคำอ่าน "mizu · みず") เรียงยาวไปสั้น
const KANA_PAIRS = (() => {
  const pairs = Object.entries(JA_KANA_MAP);
  for (const set of [LANG_CONTENT.ja, LANG_INTER.ja]) {
    for (const x of set.vocab) {
      const k = (x.r || "").split("·")[1];
      if (k && /[一-鿿]/.test(x.w)) pairs.push([x.w, k.trim()]);
    }
  }
  return pairs.sort((a, b) => b[0].length - a[0].length);
})();
function kanaize(text) {
  let t = String(text || "");
  if (!/[一-鿿]/.test(t)) return t;
  for (const [k, v] of KANA_PAIRS) if (t.includes(k)) t = t.split(k).join(v);
  return t;
}

const _vc = {};
function deckVocab(d) {
  const key = d + (jaKanaOn(d) ? ":kana" : "");
  if (_vc[key]) return _vc[key];
  let list = LEVELS[d]
    ? VOCAB[d].map((x) => ({ w: x.en, r: "", pos: x.pos, th: x.th, ex: x.ex, exR: "", exTh: x.exTh }))
    : langSet(d).vocab.map((x) => ({ ...x, pos: "" }));
  if (jaKanaOn(d)) {
    list = list.map((x) => {
      const [roma, kana] = (x.r || "").split("·").map((t) => t.trim());
      if (!kana) return { ...x, ex: kanaize(x.ex) };
      return { ...x, id: x.w, kanji: x.w, w: kana, r: roma, ex: kanaize(x.ex) };
    });
  }
  return (_vc[key] = list);
}
const deckQuiz = (d) => {
  const qs = LEVELS[d] ? QUIZ[d] : langSet(d).quiz;
  return jaKanaOn(d) ? qs.map((x) => ({ ...x, q: kanaize(x.q), c: x.c.map(kanaize), why: kanaize(x.why) })) : qs;
};
// show = ข้อความที่แสดง (คานะ), t = ข้อความจริงที่ใช้อ่านออกเสียงและเทียบเสียงพูด
const deckPhrases = (d) => {
  const ps = LEVELS[d] ? PHRASES[d].map((x) => ({ t: x.en, r: "", th: x.th })) : langSet(d).phrases;
  return jaKanaOn(d) ? ps.map((x) => ({ ...x, show: kanaize(x.t) })) : ps;
};
// ชุดที่ให้ทายคำอ่าน: ซ่อนคำอ่านไว้หลังการ์ด
const hideReadingFront = (d) => ["ja-hira", "ja-kata", "ja-sign"].includes(d);
const hasThai = (t) => /[\u0E00-\u0E7F]/.test(t);
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
const MAIN_VIEW = document.getElementById("view");
let $view = MAIN_VIEW; // แท็บที่มีแท็บย่อยจะชี้ไปที่กล่องเนื้อหาด้านใน
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
const ttsLang = (lang) => (LANG_META[lang] || LANG_META.en).tts;
function speak(text, rate = 0.95, lang = "en") {
  if (!window.speechSynthesis) { toast("เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const tag = ttsLang(lang);
  u.lang = tag;
  u.rate = rate;
  const norm2 = (x) => (x || "").replace("_", "-").toLowerCase();
  const pre = tag.slice(0, 2).toLowerCase();
  const v = voices.find((v) => norm2(v.lang) === tag.toLowerCase() && /Google|Samantha|Natural/i.test(v.name)) ||
            voices.find((v) => norm2(v.lang) === tag.toLowerCase()) ||
            voices.find((v) => norm2(v.lang).startsWith(pre));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* ---------- ฟังเสียงพูด (Speech Recognition) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen({ onResult, onEnd, onError, lang = "en" }) {
  if (!SR) { onError && onError("unsupported"); return null; }
  const r = new SR();
  r.lang = ttsLang(lang);
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
const tabs = { home: renderHome, vocab: renderPractice, quiz: renderQuiz, tutor: renderTutor, profile: renderProfile, translate: renderTranslate, chart: renderChart };
const NAV_OF = { profile: "home", chart: "home" };

function go(tab) {
  // ลิงก์เก่า/ปุ่มลัด "speak" และ "write" ไปที่แท็บฝึกคำ แล้วเปิดแท็บย่อยนั้น
  if (tab === "speak" || tab === "write" || tab === "cards") { S.pMode = tab; save(); tab = "vocab"; }
  if (tab === "chart" && current !== "chart") { S.chartLang = ""; S.chartTab = ""; }
  if (tab === "dict" || tab === "talk") { S.trMode = tab === "dict" ? "type" : "face"; save(); tab = "translate"; }
  if (cleanup) { cleanup(); cleanup = null; }
  $view = MAIN_VIEW;
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (current === "tutor" && tab !== "tutor") summarizeChat();
  current = tab;
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === (NAV_OF[tab] || tab)));
  $view.classList.remove("has-composer", "tr-face", "home");
  if (tab === "home") $view.classList.add("home");
  document.querySelector(".composer")?.remove();
  tabs[tab]();
  window.scrollTo(0, 0);
  history.replaceState(null, "", "#" + tab);
}
document.querySelectorAll(".tabbar button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));

function renderLevelChip() {
  document.getElementById("levelBtn").textContent = S.lang === "en" ? `${LANG_META.en.flag} ${LEVELS[S.level].name}` : `${LANG_META[S.lang].flag} ${LANG_META[S.lang].name} · ${LEVEL_SHORT[langLevel()] || "เริ่มต้น"}`;
}
document.getElementById("levelBtn").addEventListener("click", () => {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  const opts = [
    ...Object.entries(LEVELS).map(([k, v]) => ({ lang: "en", level: k, icon: LANG_META.en.flag, name: `อังกฤษ · ${v.name}`, desc: v.desc })),
    ...LEARN_LANGS.filter((l) => l !== "en").flatMap((l) => [
      { lang: l, level: "beginner", icon: LANG_META[l].flag, name: `${LANG_META[l].name} · ผู้เริ่มต้น`, desc: "ชีวิตประจำวันและท่องเที่ยว" },
      { lang: l, level: "intermediate", icon: LANG_META[l].flag, name: `${LANG_META[l].name} · ระดับกลาง`, desc: "สนทนาคล่องขึ้น ไวยากรณ์ที่ใช้บ่อย" },
      ...(l === "ja" ? [
        { lang: l, level: "hira", icon: "あ", name: "ญี่ปุ่น · ฮิรางานะ", desc: "ตัวอักษร 46 ตัว พร้อมคำตัวอย่าง" },
        { lang: l, level: "kata", icon: "ア", name: "ญี่ปุ่น · คาตาคานะ", desc: "ตัวอักษร + คำทับศัพท์อังกฤษที่เจอบ่อย" },
        { lang: l, level: "sign", icon: "🚻", name: "ญี่ปุ่น · ป้ายที่เจอบ่อย", desc: "คันจิ 30 คำตามสถานี ร้านค้า ห้องน้ำ" },
      ] : []),
    ]),
  ];
  bg.innerHTML = `<div class="sheet stack" style="max-height:85dvh;overflow-y:auto">
    <h2>เลือกภาษาที่จะเรียน</h2>
    ${opts.map((o, i) => `
      <button class="opt ${o.lang === S.lang && o.level === levelOf(o.lang) ? "sel" : ""}" data-o="${i}">
        <span style="font-size:26px">${o.icon}</span>
        <span><b>${o.name}</b><br><span class="muted small">${o.desc}</span></span>
      </button>`).join("")}
    <label class="opt" style="cursor:pointer">
      <input type="checkbox" id="jaKana" ${S.jaKana !== false ? "checked" : ""} style="width:22px;height:22px;flex:none" />
      <span><b>🇯🇵 แสดงคันจิเป็นฮิรางานะ</b><br><span class="muted small">ใช้กับญี่ปุ่นระดับผู้เริ่มต้นและระดับกลาง (คันจิจะแสดงตัวเล็กไว้ให้ดู)</span></span>
    </label>
  </div>`;
  bg.querySelector("#jaKana").addEventListener("change", (e) => {
    S.jaKana = e.target.checked; save();
    if (chat && chat.lang === "ja") { summarizeChat(); chat = null; }
    toast(S.jaKana ? "แสดงคันจิเป็นฮิรางานะแล้ว" : "แสดงคันจิตามปกติ");
    go(current);
  });
  bg.addEventListener("click", (e) => {
    if (e.target.closest("label")) return;
    const b = e.target.closest("[data-o]");
    if (b) {
      const o = opts[+b.dataset.o];
      if (chat && (chat.lang !== o.lang || chat.level !== o.level)) { summarizeChat(); chat = null; }
      S.lang = o.lang;
      if (o.lang === "en") S.level = o.level;
      else { S.langLevel = { ...(S.langLevel || {}), [o.lang]: o.level }; }
      save(); renderLevelChip(); go(current);
    }
    if (b || e.target === bg) bg.remove();
  });
  document.body.appendChild(bg);
});

/* =========================================================
   1) หน้าหลัก / ความคืบหน้า
   ========================================================= */
// ปุ่มลัดในหน้าหลัก: เพิ่มปุ่มใหม่ได้ง่ายๆ โดยเพิ่มรายการในนี้ (go = ปลายทาง, badge = ตัวเลขมุมขวาบน)
function homeShortcuts(due) {
  return [
    { go: "cards", icon: "🃏", label: "ทบทวนคำ", badge: due },
    { go: "speak", icon: "🎤", label: "ฟัง-พูด" },
    { go: "write", icon: "✍️", label: "ฝึกเขียน" },
    { go: "chart", icon: "🔤", label: "ตัวอักษร" },
    { go: "quiz", icon: "✅", label: "ควิซ" },
    { go: "tutor", icon: "🤖", label: "ครู AI" },
    { go: "talk", icon: "🌐", label: "แปลคุยกัน" },
    { go: "dict", icon: "📖", label: "ค้นคำ/แปล" },
    { go: "profile", icon: "👤", label: "โปรไฟล์" },
  ];
}

function renderHome() {
  const xpToday = S.days[today()] || 0;
  const pct = Math.min(100, Math.round((xpToday / DAILY_GOAL) * 100));
  const allCards = Object.values(S.cards);
  const learned = allCards.filter((c) => c.reps > 0).length;
  const mastered = allCards.filter((c) => c.interval >= 21).length;
  const due = dueCards(deck()).length;
  const acc = S.quiz.total ? Math.round((S.quiz.correct / S.quiz.total) * 100) : 0;
  const spk = S.speak.attempts ? Math.round(S.speak.sum / S.speak.attempts) : 0;

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    week.push({ label: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][d.getDay()], xp: S.days[today(d)] || 0, isToday: i === 0 });
  }
  const max = Math.max(DAILY_GOAL, ...week.map((w) => w.xp));
  const nm = S.profile.name;

  $view.innerHTML = `
    <div class="card hero compact">
      <div class="row" style="gap:8px">
        <div class="hi grow">${nm ? `สวัสดี ${esc(nm)} 👋` : "สวัสดี 👋"} · ${deckLabel()}</div>
        <div class="streak">🔥 <b>${streak()}</b> วัน</div>
      </div>
      <div class="row" style="gap:10px;margin-top:6px">
        <div class="xp">${xpToday}<span>/${DAILY_GOAL} XP</span></div>
        <div class="goalbar grow" style="margin-top:0"><i style="width:${pct}%"></i></div>
      </div>
      <div class="hi" style="margin-top:6px">${pct >= 100 ? "ครบเป้าวันนี้แล้ว เก่งมาก! 🎉" : `อีก ${DAILY_GOAL - xpToday} XP จะครบเป้าวันนี้`}</div>
    </div>

    <h2 class="sm">เริ่มเรียนเลย</h2>
    <div class="apps">
      ${homeShortcuts(due).map((a) => `
        <button data-go="${a.go}">
          ${a.badge ? `<span class="badge">${a.badge}</span>` : ""}
          <span class="ai">${a.icon}</span><span>${a.label}</span>
        </button>`).join("")}
    </div>

    <h2 class="sm">7 วันที่ผ่านมา</h2>
    <div class="card" style="padding:8px 12px 6px">
      <div class="week sm">
        ${week.map((w) => `<div class="bar ${w.isToday ? "today" : ""}"><i style="height:${Math.round((w.xp / max) * 80)}%"></i><span>${w.label}</span></div>`).join("")}
      </div>
    </div>

    <h2 class="sm">สถิติรวม</h2>
    <div class="stats4">
      <div class="card"><div class="n">${learned}</div><div class="l">คำที่เคยเรียน</div></div>
      <div class="card"><div class="n">${mastered}</div><div class="l">คำที่จำแม่น</div></div>
      <div class="card"><div class="n">${acc}%</div><div class="l">ควิซถูก</div></div>
      <div class="card"><div class="n">${spk}</div><div class="l">ออกเสียงเฉลี่ย</div></div>
    </div>

    ${installPrompt ? `<button class="btn block" id="install" style="margin-top:12px;min-height:42px;padding:8px">📲 ติดตั้งเป็นแอพบนมือถือ (ใช้ออฟไลน์ได้)</button>` : ""}
    <div style="margin-top:28px" class="center" id="resetWrap">
      <button class="linkbtn" id="reset">ล้างข้อมูลการเรียนทั้งหมด</button>
    </div>
  `;
  $view.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  $view.querySelector("#install")?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch (e) {}
    installPrompt = null; go("home");
  });
  // ดันลิงก์ล้างข้อมูลให้อยู่ใต้ขอบจอ ต้องเลื่อนลงถึงจะเห็น (กันกดโดยไม่ตั้งใจ)
  const rw = $view.querySelector("#resetWrap");
  const bar = document.querySelector(".tabbar")?.offsetHeight || 64;
  const need = window.innerHeight - bar + 24 - rw.getBoundingClientRect().top;
  if (need > 0) rw.style.marginTop = 28 + need + "px";
  $view.querySelector("#reset").addEventListener("click", () => {
    if (confirm("ล้างความคืบหน้าทั้งหมดในเครื่องนี้? ย้อนกลับไม่ได้")) {
      const lvl = S.level, lng = S.lang, pc = S.passcode, pf = S.profile, ll = S.langLevel; S = defaultState(); S.level = lvl; S.lang = lng; S.passcode = pc; S.profile = pf; S.langLevel = ll; save(); go("home"); toast("ล้างข้อมูลการเรียนแล้ว");
    }
  });
}

/* =========================================================
   2) แฟลชการ์ด + ระบบทบทวนตามรอบ (Spaced Repetition)
   ========================================================= */
const cardId = (d, w) => d + ":" + (w.id || w.w);
const DAY = 86400000;

function dueCards(level) {
  const now = Date.now();
  return deckVocab(level).filter((w) => { const c = S.cards[cardId(level, w)]; return c && c.due <= now; });
}
function newCards(level) {
  const used = S.newSeen[today() + "|" + level] || 0;
  const left = Math.max(0, NEW_PER_DAY - used);
  return deckVocab(level).filter((w) => !S.cards[cardId(level, w)]).slice(0, left);
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
  const level = deck(), L = deckLang(level);
  let queue = shuffle([...dueCards(level), ...newCards(level)]);
  const total = queue.length;
  let done = 0;
  let flipped = false;

  if (!total) {
    const learned = deckVocab(level).filter((w) => S.cards[cardId(level, w)]).length;
    const next = Object.entries(S.cards).filter(([k]) => k.startsWith(level + ":")).map(([, c]) => c.due).sort((a, b) => a - b)[0];
    $view.innerHTML = `
      <h1>คำศัพท์ · ${deckLabel(level)}</h1>
      <div class="card empty">
        <div class="e">🎉</div>
        <h2>ทบทวนครบแล้วสำหรับตอนนี้</h2>
        <p class="muted">เรียนไปแล้ว ${learned}/${deckVocab(level).length} คำ${next ? ` · รอบถัดไป ${new Date(next).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
        <button class="btn primary" id="more">เรียนคำใหม่เพิ่มอีก 5 คำ</button>
      </div>
      ${wordList(level)}`;
    $view.querySelector("#more").addEventListener("click", () => {
      const k = today() + "|" + level;
      S.newSeen[k] = Math.max(0, (S.newSeen[k] || 0) - 5); save();
      if (!newCards(level).length) toast("เรียนครบทุกคำในชุดนี้แล้ว ลองเปลี่ยนภาษาหรือระดับดู");
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
        <div class="word">${esc(w.w)}</div>
        ${w.r && !hideReadingFront(level) ? `<div class="reading">${esc(w.r)}</div>` : ""}
        ${w.kanji ? `<div class="muted small">คันจิ ${esc(w.kanji)}</div>` : ""}
        ${w.pos ? `<div class="pos">${esc(w.pos)}</div>` : ""}
        <div id="back" hidden style="width:100%">
          ${w.r && hideReadingFront(level) ? `<div class="reading" style="font-size:22px;margin-top:6px">${esc(w.r)}</div>` : ""}
          <div class="meaning">${esc(w.th)}</div>
          <div class="ex">
            <div class="en">${esc(w.ex)} <button class="say" data-say="${esc(w.ex)}" data-lang="${L}">🔊</button></div>
            ${w.exR ? `<div class="reading small">${esc(w.exR)}</div>` : ""}
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
    $view.querySelector("#sayWord").addEventListener("click", () => speak(w.w, 0.85, L));
    bindSay();
    speak(w.w, 0.85, L);
  }
  draw();
}
function wordList(level) {
  const L = deckLang(level);
  return `<h2>คำทั้งหมดในชุดนี้</h2>
    <div class="card" style="padding:4px 16px">
      ${deckVocab(level).map((w) => {
        const c = S.cards[cardId(level, w)];
        const tag = !c ? `<span class="pill">ยังไม่เรียน</span>` : c.interval >= 21 ? `<span class="pill" style="color:var(--good)">จำแม่น</span>` : `<span class="pill" style="color:var(--brand)">กำลังเรียน</span>`;
        return `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)">
          <button class="say" data-say="${esc(w.w)}" data-lang="${L}" style="font-size:18px">🔊</button>
          <div class="grow"><b>${esc(w.w)}</b>${w.r ? ` <span class="small reading">${esc(w.r)}</span>` : ""} <span class="muted small">${esc(w.th)}</span></div>${tag}</div>`;
      }).join("")}
    </div>`;
}
function bindSay() {
  $view.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); speak(b.dataset.say, 0.95, b.dataset.lang || deckLang(deck())); }));
}

/* =========================================================
   3) ควิซไวยากรณ์
   ========================================================= */
function renderQuiz() {
  const level = deck();
  $view.innerHTML = `
    <h1>ควิซ · ${deckLabel(level)}</h1>
    <p class="sub">เลือกคำตอบที่ถูก มีคำอธิบายภาษาไทยทุกข้อ</p>
    <div class="stack">
      <button class="btn primary block" data-n="10">เริ่มควิซ 10 ข้อ</button>
      <button class="btn block" data-n="5">ควิซสั้น 5 ข้อ</button>
      <button class="btn block" data-n="${deckQuiz(level).length}">ทำทั้งหมด (${deckQuiz(level).length} ข้อ)</button>
    </div>`;
  $view.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => runQuiz(level, +b.dataset.n)));
}
function runQuiz(level, n) {
  const L = deckLang(level);
  const qs = shuffle(deckQuiz(level)).slice(0, n).map((q) => {
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
      const full = L === "en" ? q.q.replace("___", q.c[q.a]) : q.c[q.a];
      const sayable = !hasThai(full);
      $view.querySelector("#after").innerHTML = `
        <div class="explain"><b>${ok ? "✅ ถูกต้อง!" : "❌ ยังไม่ถูก"}</b><br>${esc(q.why)}
          ${sayable ? `<div style="margin-top:6px"><button class="say" data-say="${esc(full)}" data-lang="${L}" style="padding:0">🔊</button> <i>${esc(full)}</i></div>` : ""}
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
        <div class="card"><div><b>${esc(L === "en" ? q.q.replace("___", q.c[q.a]) : q.q + " → " + q.c[q.a])}</b></div><div class="muted small">${esc(q.why)}</div></div>`).join("")}</div>` : ""}
      <div class="stack" style="margin-top:16px">
        <button class="btn primary block" id="again">ทำควิซอีกรอบ</button>
        ${wrong.length ? `<button class="btn block" id="tutor">ให้ครู AI อธิบายเพิ่ม</button>` : ""}
      </div>`;
    $view.querySelector("#again").addEventListener("click", () => runQuiz(level, n));
    $view.querySelector("#tutor")?.addEventListener("click", () => {
      const list = wrong.map((q) => `- ${L === "en" ? q.q.replace("___", q.c[q.a]) : q.q + " → " + q.c[q.a]}`).join("\n");
      pendingTutor = { mode: "correct", text: `ช่วยอธิบายเรื่องในข้อเหล่านี้เป็นภาษาไทย พร้อมยกตัวอย่างเพิ่ม:\n${list}` };
      go("tutor");
    });
  }
  draw();
}

/* =========================================================
   4) ฝึกฟังและพูด
   ========================================================= */
const CHAR_LANGS = ["ko", "ja", "zh"];
// แยกเป็นหน่วยเทียบ: ภาษาที่ไม่เว้นวรรค (เกาหลี ญี่ปุ่น จีน) เทียบทีละตัวอักษร ที่เหลือเทียบทีละคำ
function units(s, lang) {
  const clean = s.normalize("NFC").toLowerCase().replace(/[’']/g, "'");
  if (CHAR_LANGS.includes(lang)) return Array.from(clean.replace(/[^\p{L}\p{N}]/gu, ""));
  return clean.replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter(Boolean);
}
function compare(target, said, lang = "en") {
  const t = units(target, lang), s = units(said, lang);
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
  // segs: ส่วนของประโยคสำหรับแสดงผล พร้อมสถานะถูก/พลาด (เว้นวรรคและเครื่องหมายคงไว้ตามต้นฉบับ)
  let segs;
  if (CHAR_LANGS.includes(lang)) {
    let k = 0;
    segs = Array.from(target.normalize("NFC")).map((ch) => /[\p{L}\p{N}]/u.test(ch) ? { text: ch, cls: hit.has(k++) ? "ok" : "miss" } : { text: ch, cls: "" });
  } else {
    segs = target.split(/\s+/).flatMap((w, i) => [...(i ? [{ text: " ", cls: "" }] : []), { text: w, cls: hit.has(i) ? "ok" : "miss" }]);
  }
  return { score, hit, segs };
}

function renderSpeak() {
  const level = deck(), L = deckLang(level);
  const list = deckPhrases(level);
  let idx = Math.floor(Math.random() * list.length);
  let rec = null;
  cleanup = () => { try { rec && rec.abort(); } catch (e) {} };

  function draw(result) {
    const p = list[idx];
    $view.innerHTML = `
      <h1>ฟัง-พูด · ${deckLabel(level)}</h1>
      <p class="sub">ฟังตัวอย่าง แล้วกดไมค์พูดตาม ระบบจะเทียบคำที่คุณพูด</p>
      <div class="card stack center">
        <div class="phrase">${result && !(p.show && p.show !== p.t) ? `<span class="words">${result.segs.map((g) => g.cls ? `<span class="${g.cls}">${esc(g.text)}</span>` : esc(g.text)).join("")}</span>` : esc(p.show || p.t)}</div>
        ${p.r ? `<div class="reading">${esc(p.r)}</div>` : ""}
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
    $view.querySelector("#play").addEventListener("click", () => speak(p.t, 0.95, L));
    $view.querySelector("#slow").addEventListener("click", () => speak(p.t, 0.6, L));
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
        lang: L,
        onResult: (alts) => {
          const best = alts.map((a) => ({ a, r: compare(p.t, a, L) })).sort((x, y) => y.r.score - x.r.score)[0];
          S.speak.attempts++; S.speak.sum += best.r.score; save();
          addXP(best.r.score >= 80 ? 5 : 1);
          draw({ ...best.r, heard: best.a });
        },
        onError: (err) => {
          toast(err === "not-allowed" ? "กรุณาอนุญาตให้ใช้ไมโครโฟน" : err === "no-speech" ? "ไม่ได้ยินเสียง ลองใหม่อีกครั้ง" : err === "language-not-supported" ? "มือถือเครื่องนี้ฟังภาษานี้ไม่ได้" : "ฟังเสียงไม่สำเร็จ ลองใหม่");
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
    chat = { mode: pendingTutor.mode, lang: S.lang, messages: [], summarizedAt: 0 };
    const text = pendingTutor.text; pendingTutor = null;
    drawChat();
    send(text);
    return;
  }
  if (chat && (chat.lang !== S.lang || (chat.level && chat.level !== levelOf()))) { summarizeChat(); chat = null; }
  if (chat) return drawChat();
  $view.innerHTML = `
    <h1>ครู AI · ${S.lang === "en" ? "อังกฤษ" : LANG_META[S.lang].name}</h1>
    <p class="sub">เลือกสถานการณ์ที่อยากฝึก ครูจะตอบเป็นภาษาอังกฤษ และแก้จุดผิดพร้อมอธิบายเป็นภาษาไทย</p>
    <button class="card row profile-card" id="toProfile" style="margin-bottom:12px">
      <span style="font-size:24px">🧠</span>
      <span class="grow" style="text-align:left"><b>${S.profile.name ? `ครูรู้จัก ${esc(S.profile.name)} แล้ว` : "ยังไม่ได้ตั้งโปรไฟล์"}</b><br><span class="muted small">${getNotes() ? "ครูจำจุดที่คุณผิดบ่อยไว้แล้ว แตะเพื่อดู" : "แตะเพื่อตั้งโปรไฟล์ให้ครูรู้จักคุณ"}</span></span>
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
    speak(chat.messages[0].content, 0.95, chat.lang);
  }));
}

function newChat(m) {
  const lang = S.lang;
  const level = levelOf(lang);
  // ญี่ปุ่น: ให้ครูเขียนแค่ฮิรางานะ/คาตาคานะ เมื่อเปิดโหมดคานะ หรือเรียนชุดคานะ/ป้าย
  const kana = lang === "ja" && (S.jaKana !== false || ["hira", "kata", "sign"].includes(level));
  let opener = lang === "en" ? m.opener : kana ? JA_KANA_OPENERS[m.id] : LANG_CONTENT[lang].openers[m.id];
  const nm = S.profile.name.trim();
  if (nm && m.id === "chat" && lang === "en") opener = opener.replace(/^Hi!/, `Hi ${nm}!`);
  return { mode: m.id, lang, level, kana, messages: [{ role: "assistant", content: opener }], summarizedAt: 0 };
}

function splitReply(text) {
  // บรรทัดที่ขึ้นต้นด้วย ✏️ หรือ 💡 คือส่วนแก้คำผิด/คำอธิบายภาษาไทย
  const lines = text.split("\n");
  const main = [], notes = [];
  for (const l of lines) (/^\s*(✏️|💡|🔤|💬)/.test(l) ? notes : main).push(l);
  return { main: main.join("\n").trim(), notes: notes.join("\n").trim() };
}

function drawChat() {
  const m = TUTOR_MODES.find((x) => x.id === chat.mode);
  $view.classList.add("has-composer");
  $view.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <button class="icon-btn" id="back" aria-label="กลับ">←</button>
      <div class="grow"><b>${m.icon} ${m.name}</b><div class="muted small">${deckLabel(deckFor(chat.lang, chat.level || levelOf(chat.lang)))}</div></div>
      <button class="btn ghost small" id="newChat">เริ่มใหม่</button>
    </div>
    <div class="chat" id="chat">
      ${chat.messages.map((msg) => {
        if (msg.role === "user") return `<div class="msg me">${esc(msg.content)}</div>`;
        const { main, notes } = splitReply(msg.content);
        return `<div class="msg bot">${esc(main)}<button class="say" data-say="${esc(main)}" data-lang="${chat.lang}" aria-label="ฟัง">🔊</button>${notes ? `<span class="fix">${esc(notes)}</span>` : ""}</div>`;
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
      <textarea id="msg" rows="1" placeholder="พิมพ์${chat.lang === "en" ? "อังกฤษ" : LANG_META[chat.lang].name} หรือถามเป็นไทย"></textarea>
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
        lang: chat.lang,
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
      body: JSON.stringify({ mode: chat.mode, lang: chat.lang, level: chat.level || levelOf(chat.lang), kana: !!chat.kana, profile: S.profile, notes: getNotes(chat.lang), messages: chat.messages.filter((m) => !m.err).slice(-20).map(({ role, content }) => ({ role, content })) }),
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
    if (current === "tutor") { drawChat(); speak(splitReply(data.reply).main, 0.95, chat.lang); }
  } catch (e) {
    chat.busy = false;
    const msg = navigator.onLine === false ? "ไม่มีอินเทอร์เน็ต: ครู AI ต้องใช้เน็ต" : e.name === "AbortError" ? "ครู AI ไม่ตอบภายใน 1 นาที ลองส่งใหม่อีกครั้ง" : (e.message || "เกิดข้อผิดพลาด");
    chat.messages.push({ role: "assistant", err: true, content: "💡 " + msg });
    if (current === "tutor") drawChat();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- เรียก AI ฝั่งเซิร์ฟเวอร์ (จัดการรหัสผ่านให้) ---------- */
async function api(body, timeoutMs = 45000) {
  if (navigator.onLine === false) throw new Error("ไม่มีอินเทอร์เน็ต: ฟีเจอร์ AI ต้องใช้เน็ต");
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res, data;
    try {
      res = await fetch("/api/tutor", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-app-passcode": S.passcode || "" },
        body: JSON.stringify(body),
      });
      data = await res.json().catch(() => ({}));
    } catch (e) {
      throw new Error(e.name === "AbortError" ? "AI ไม่ตอบ ลองใหม่อีกครั้ง" : "เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ต");
    } finally { clearTimeout(t); }
    if (res.status === 401) {
      const code = prompt("แอพนี้ตั้งรหัสผ่านสำหรับ AI ไว้ กรุณาใส่รหัส:");
      if (!code) throw new Error("ต้องใส่รหัสผ่านก่อนใช้งาน");
      S.passcode = code.trim(); save();
      continue;
    }
    if (!res.ok) throw new Error(data.error || `เชื่อมต่อ AI ไม่สำเร็จ (รหัส ${res.status})`);
    return data;
  }
  throw new Error("รหัสผ่านไม่ถูกต้อง");
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
      body: JSON.stringify({ action: "summarize", lang: c.lang, level: c.level || levelOf(c.lang), profile: S.profile, notes: getNotes(c.lang), messages: fresh.slice(-30).map(({ role, content }) => ({ role, content })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.notes === "string" && data.notes.trim()) {
      setNotes(c.lang, data.notes.trim());
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

    <h2>🧠 สิ่งที่ครู AI จำได้ · ${S.lang === "en" ? "อังกฤษ" : LANG_META[S.lang].name}</h2>
    <div class="card stack">
      <p class="muted small" style="margin:0">ครูสรุปให้อัตโนมัติหลังคุยจบแต่ละครั้ง (จุดที่ผิดบ่อย จุดแข็ง เรื่องที่ชอบคุย) แก้ไขหรือลบได้</p>
      <textarea class="field" id="notes" rows="7" maxlength="1500" placeholder="ยังไม่มี ลองคุยกับครู AI สักพัก แล้วกลับมาดูนะ">${esc(getNotes())}</textarea>
      ${S.notesAtBy[S.lang] ? `<div class="muted small">อัปเดตล่าสุด ${new Date(S.notesAtBy[S.lang]).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>` : ""}
      <div class="muted small">ความจำแยกตามภาษา เปลี่ยนภาษาที่ปุ่มมุมขวาบนเพื่อดูของภาษาอื่น</div>
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
  $view.querySelector("#saveN").addEventListener("click", () => { setNotes(S.lang, $view.querySelector("#notes").value.trim()); toast("บันทึกแล้ว"); });
  $view.querySelector("#clearN").addEventListener("click", () => {
    if (confirm("ลบสิ่งที่ครู AI จำได้ของภาษานี้?")) { setNotes(S.lang, ""); renderProfile(); toast("ลบความจำแล้ว"); }
  });
}

/* =========================================================
   ฝึกคำ: แท็บย่อย แฟลชการ์ด / ฟัง-พูด / เขียน
   ========================================================= */
function renderPractice() {
  const mode = ["cards", "speak", "write"].includes(S.pMode) ? S.pMode : "cards";
  MAIN_VIEW.innerHTML = `
    <div class="seg subtabs">
      <button data-pm="cards" class="${mode === "cards" ? "sel" : ""}">🃏 แฟลชการ์ด</button>
      <button data-pm="speak" class="${mode === "speak" ? "sel" : ""}">🎤 ฟัง-พูด</button>
      <button data-pm="write" class="${mode === "write" ? "sel" : ""}">✍️ เขียน</button>
    </div>
    <div id="sub"></div>`;
  MAIN_VIEW.querySelectorAll("[data-pm]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.pm === mode) return;
    S.pMode = b.dataset.pm; save(); go("vocab");
  }));
  $view = MAIN_VIEW.querySelector("#sub");
  ({ cards: renderVocab, speak: renderSpeak, write: renderWrite })[mode]();
}

/* ---------- ✍️ เขียน: กระดานวาดด้วยนิ้ว/ปากกา + AI อ่านลายมือ ---------- */
let writeIdx = null;
// ฟอนต์ลายมือ (ตัวเขียน) ของแต่ละภาษา จาก Google Fonts
// เฉพาะภาษาอังกฤษ: Playwrite US Trad ฟอนต์ที่ออกแบบมาสอนเขียนตัวติด (cursive) ในโรงเรียน
const HAND_FONT = {
  en: { family: "Playwrite US Trad", note: "ตัวเขียนติดแบบที่สอนในโรงเรียนอเมริกา" },
};
const _fontLinks = new Map();
function loadHandFont(lang, text) {
  const f = HAND_FONT[lang];
  if (!f) return Promise.resolve();
  // ภาษาเอเชียฟอนต์ใหญ่มาก จึงโหลดเฉพาะตัวอักษรที่ใช้ (text=)
  const url = "https://fonts.googleapis.com/css2?family=" + f.family.replace(/ /g, "+") + "&display=swap" + (f.subset ? "&text=" + encodeURIComponent(text) : "");
  let p = _fontLinks.get(url);
  if (!p) {
    p = new Promise((res) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = url; l.onload = res; l.onerror = res;
      document.head.appendChild(l);
    });
    _fontLinks.set(url, p);
  }
  // รอให้ฟอนต์โหลด (ไม่เกิน 4 วินาที ถ้าเน็ตช้าจะแสดงฟอนต์สำรองไปก่อน)
  return Promise.race([
    new Promise((r) => setTimeout(r, 4000)),
    p.then(() => document.fonts.load(`40px "${f.family}"`, text)).catch(() => {}),
  ]);
}

function renderWrite() {
  if (!S.wMode) S.wMode = "trace";
  // เส้นนำ: "print" ตัวพิมพ์, "hand" ตัวเขียน, "off" ปิด (เวอร์ชันเก่าเก็บเป็น true/false)
  if (S.wGuide === undefined || S.wGuide === true) S.wGuide = "print";
  if (S.wGuide === false) S.wGuide = "off";
  const d = deck(), L = deckLang(d);
  const words = deckVocab(d);
  if (writeIdx === null || writeIdx >= words.length) writeIdx = Math.floor(Math.random() * words.length);
  const w = words[writeIdx];
  const trace = S.wMode === "trace";
  const HF = HAND_FONT[L];
  const GUIDE_NAME = { print: "ตัวพิมพ์", hand: "ตัวเขียน", off: "ปิด" };

  $view.innerHTML = `
    <div class="wbar">
      <button class="chip ${trace ? "sel" : ""}" data-wm="trace">📝 ฝึกเขียนคำ</button>
      <button class="chip ${!trace ? "sel" : ""}" data-wm="free">🎨 วาดอิสระ</button>
      <span class="grow"></span>
      ${trace ? `<button class="chip ${S.wGuide !== "off" ? "sel" : ""}" id="guide" aria-label="เปลี่ยนเส้นนำ">เส้นนำ: ${GUIDE_NAME[S.wGuide]}</button>` : ""}
    </div>
    ${trace && S.wGuide === "off" ? `
      <div class="whint">เขียนคำว่า <b>${esc(w.th)}</b> <button class="say" id="sayW" aria-label="ฟังเสียง">🔊</button></div>` : ""}
    <div class="board-wrap" id="wrap">
      <div class="board-grid"></div>
      ${trace && S.wGuide !== "off" ? `<div class="board-ghost" id="ghost" ${S.wGuide === "hand" && HF ? `style="font-family:'${HF.family}',cursive;font-weight:400"` : ""}>${esc(w.w)}</div>` : ""}
      <canvas id="board" aria-label="กระดานเขียน"></canvas>
    </div>
    <div class="tools" id="tools">
      <button class="icon-btn sel" data-tool="pen" aria-label="ปากกา">✏️</button>
      <button class="icon-btn" data-tool="eraser" aria-label="ยางลบ">🧽</button>
      <button class="icon-btn" id="undo" aria-label="ย้อนกลับ">↶</button>
      <button class="icon-btn" id="clear" aria-label="ล้าง">🗑️</button>
      <div class="size">
        ${[3, 6, 10].map((sz, i) => `<button class="dot ${i === 1 ? "sel" : ""}" data-size="${sz}" aria-label="ขนาด ${sz}"><i style="width:${sz + 2}px;height:${sz + 2}px"></i></button>`).join("")}
      </div>
    </div>
    <div class="row" id="wbtns" style="margin-top:12px">
      ${trace ? `<button class="btn grow" id="nextW">คำถัดไป ▶</button>` : ""}
      <button class="btn primary grow" id="check">${trace ? "✅ ตรวจลายมือ" : "🔍 อ่าน/ทาย"}</button>
    </div>
    <div id="wres" style="margin-top:12px"></div>`;

  // ---- กระดาน ----
  const canvas = $view.querySelector("#board");
  const ctx = canvas.getContext("2d");
  const strokes = []; // { tool, size, pts: [[x,y,pressure]] }
  let tool = "pen", size = 6, cur = null;
  const fit = () => {
    // ความสูงกระดาน: เท่าที่เหลือบนจอ เพื่อให้ปุ่มเครื่องมือและปุ่มตรวจมองเห็นได้โดยไม่ต้องเลื่อน
    const top = canvas.getBoundingClientRect().top + window.scrollY;
    const below = ($view.querySelector("#tools")?.offsetHeight || 44) + ($view.querySelector("#wbtns")?.offsetHeight || 48) + 30;
    const bar = document.querySelector(".tabbar")?.offsetHeight || 64;
    canvas.style.height = Math.max(150, Math.min(360, window.innerHeight - top - below - bar)) + "px";
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
    sizeGhost();
  };
  // ขนาดเส้นนำ: วัดความกว้างจริงของคำด้วยฟอนต์ที่ใช้ แล้วขยายให้เต็มกระดานพอดี
  const ghost = $view.querySelector("#ghost");
  const meter = document.createElement("canvas").getContext("2d");
  function sizeGhost() {
    if (!ghost) return;
    const W = canvas.clientWidth - 28, H = canvas.clientHeight || 300;
    const cs = getComputedStyle(ghost);
    meter.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
    const at100 = Math.max(1, meter.measureText(w.w).width);
    const cursive = S.wGuide === "hand";
    const px = Math.floor(Math.min(150, H * (cursive ? 0.5 : 0.62), (W / at100) * 100));
    ghost.style.fontSize = Math.max(26, px) + "px";
    ghost.style.lineHeight = cursive ? "1.6" : "1.1";
  }
  // โหลดฟอนต์ตัวเขียน (สำหรับการ์ดคำ และเส้นนำแบบตัวเขียน) แล้วคำนวณขนาดใหม่
  if (trace && HF) loadHandFont(L, w.w).then(() => { if (canvas.isConnected) sizeGhost(); });
  function drawStroke(s) {
    ctx.save();
    ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#1c1b18"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const p = s.pts;
    if (p.length === 1) {
      ctx.beginPath(); ctx.arc(p[0][0], p[0][1], (s.size * (s.tool === "eraser" ? 3 : 1) * p[0][2]) / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#1c1b18"; ctx.fill();
    }
    for (let i = 1; i < p.length; i++) {
      ctx.beginPath();
      ctx.lineWidth = s.size * (s.tool === "eraser" ? 3 : 1) * ((p[i][2] + p[i - 1][2]) / 2);
      ctx.moveTo(p[i - 1][0], p[i - 1][1]); ctx.lineTo(p[i][0], p[i][1]); ctx.stroke();
    }
    ctx.restore();
  }
  function redraw() { ctx.clearRect(0, 0, canvas.width, canvas.height); strokes.forEach(drawStroke); }
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    // ปากกา stylus: ใช้แรงกด ทำให้เส้นหนาบาง (นิ้ว/เมาส์ใช้ค่าคงที่)
    const pr = e.pointerType === "pen" && e.pressure > 0 ? 0.4 + e.pressure * 1.2 : 1;
    return [e.clientX - r.left, e.clientY - r.top, pr];
  };
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    cur = { tool, size, pts: [pos(e)] };
    strokes.push(cur); drawStroke(cur);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!cur) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) cur.pts.push(pos(ev));
    redraw();
  });
  const end = () => { cur = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  requestAnimationFrame(fit);
  const onResize = () => fit();
  window.addEventListener("resize", onResize);
  cleanup = () => window.removeEventListener("resize", onResize);

  $view.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => {
    tool = b.dataset.tool;
    $view.querySelectorAll("[data-tool]").forEach((x) => x.classList.toggle("sel", x === b));
  }));
  $view.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
    size = +b.dataset.size;
    $view.querySelectorAll("[data-size]").forEach((x) => x.classList.toggle("sel", x === b));
  }));
  $view.querySelector("#undo").addEventListener("click", () => { strokes.pop(); redraw(); });
  $view.querySelector("#clear").addEventListener("click", () => { strokes.length = 0; redraw(); $view.querySelector("#wres").innerHTML = ""; });
  $view.querySelectorAll("[data-wm]").forEach((b) => b.addEventListener("click", () => { S.wMode = b.dataset.wm; save(); renderWrite(); }));
  $view.querySelector("#guide")?.addEventListener("click", () => {
    S.wGuide = { print: HF ? "hand" : "off", hand: "off", off: "print" }[S.wGuide] || "print";
    save(); renderWrite();
  });
  $view.querySelector("#sayW")?.addEventListener("click", () => speak(w.w, 0.8, L));
  $view.querySelector("#nextW")?.addEventListener("click", () => { writeIdx = (writeIdx + 1 + Math.floor(Math.random() * (words.length - 1))) % words.length; renderWrite(); });

  // ภาพสำหรับส่งให้ AI: พื้นขาว เส้นดำ ย่อขนาดไม่เกิน 640px (ไม่รวมเส้นนำ)
  function snapshot() {
    const maxW = 640, sc = Math.min(1, maxW / canvas.width);
    const out = document.createElement("canvas");
    out.width = Math.round(canvas.width * sc); out.height = Math.round(canvas.height * sc);
    const o = out.getContext("2d");
    o.fillStyle = "#fff"; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.85);
  }

  const res = $view.querySelector("#wres");
  const btn = $view.querySelector("#check");
  btn.addEventListener("click", async () => {
    if (!strokes.some((s) => s.tool === "pen")) { toast(trace ? "เขียนคำลงบนกระดานก่อนนะ" : "เขียนหรือวาดอะไรสักอย่างก่อนนะ"); return; }
    btn.disabled = true;
    res.innerHTML = `<div class="card center muted">AI กำลังอ่าน...</div>`;
    try {
      const data = await api(trace
        ? { action: "handwriting", mode: "check", lang: L, target: w.w, image: snapshot() }
        : { action: "handwriting", mode: "free", lang: L, image: snapshot() }, 60000);
      if (!res.isConnected) return;
      requestAnimationFrame(() => res.scrollIntoView({ behavior: "smooth", block: "center" }));
      if (trace) {
        const ok = data.correct;
        addXP(ok ? 5 : 1);
        res.innerHTML = `
          <div class="card stack">
            <div class="row res-row">
              <span class="verdict" style="color:${ok ? "var(--good)" : data.score >= 50 ? "var(--warn)" : "var(--bad)"}">${ok ? "✅" : "✏️"} ${Number(data.score) || 0}</span>
              <span class="grow">AI อ่านได้ว่า: <b style="font-size:20px">${esc(data.recognized || "(อ่านไม่ออก)")}</b></span>
            </div>
            <div class="row" style="border-top:1px dashed var(--line);padding-top:10px">
              <div class="grow">
                <div class="target-word">${esc(w.w)}</div>
                ${HF ? `<div class="hand-word"><span class="muted small">ตัวเขียน </span><span style="font-family:'${HF.family}',cursive">${esc(w.w)}</span></div>` : ""}
                ${w.r ? `<div class="reading">${esc(w.r)}</div>` : ""}
                <div class="muted small">${esc(w.th)}</div>
              </div>
              <button class="icon-btn" id="sayRes" aria-label="ฟังเสียง">🔊</button>
            </div>
            ${data.feedback_th ? `<details class="tip"><summary>💡 คำแนะนำจาก AI</summary><div>${esc(data.feedback_th)}</div></details>` : ""}
          </div>`;
        res.querySelector("#sayRes").addEventListener("click", () => speak(w.w, 0.8, L));
      } else {
        addXP(1);
        res.innerHTML = `
          <div class="card stack">
            <div class="muted small">${data.kind === "drawing" ? "🎨 ดูเหมือนรูป" : "📝 อ่านได้ว่า"}: <b>${esc(data.recognized || "-")}</b></div>
            ${data.word ? `
              <div class="row">
                <div class="grow">
                  <div class="dict-word">${esc(data.word)}</div>
                  ${data.reading ? `<div class="reading">${esc(data.reading)}</div>` : ""}
                  ${data.thai_sound ? `<div class="small">อ่านว่า <b>${esc(data.thai_sound)}</b></div>` : ""}
                </div>
                <button class="icon-btn" id="sayRes" aria-label="ฟังเสียง">🔊</button>
              </div>` : ""}
            ${data.meaning_th ? `<div><b style="font-size:18px">${esc(data.meaning_th)}</b></div>` : ""}
            ${data.note_th ? `<div class="explain">💡 ${esc(data.note_th)}</div>` : ""}
          </div>`;
        res.querySelector("#sayRes")?.addEventListener("click", () => speak(data.word, 0.8, L));
        if (data.word) speak(data.word, 0.8, L);
      }
    } catch (e) {
      if (res.isConnected) res.innerHTML = "";
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/* =========================================================
   🔤 ตารางตัวอักษร พร้อมคำอ่าน (แตะเพื่อฟังเสียง)
   ========================================================= */
function renderChart() {
  const L = S.chartLang && CHARTS[S.chartLang] ? S.chartLang : S.lang;
  const tabs = CHARTS[L];
  // ญี่ปุ่น: ถ้ากำลังเรียนชุดคาตาคานะ เปิดแท็บคาตาคานะให้ก่อน
  const defTab = L === "ja" && langLevel("ja") === "kata" ? "kata" : tabs[0].id;
  const tid = tabs.some((t) => t.id === S.chartTab) ? S.chartTab : defTab;
  const tab = tabs.find((t) => t.id === tid);
  const flags = ["en", "ko", "ja", "zh", "vi"];
  $view.innerHTML = `
    <div class="lang-chips">${flags.map((k) => `<button class="chip lang-chip ${k === L ? "sel" : ""}" data-cl="${k}">${LANG_META[k].flag} ${LANG_META[k].abbr}</button>`).join("")}</div>
    ${tabs.length > 1 ? `<div class="seg seg2" style="margin-bottom:6px">${tabs.map((t) => `<button data-ct="${t.id}" class="${t.id === tid ? "sel" : ""}">${t.name}</button>`).join("")}</div>` : ""}
    <p class="muted small" style="margin:6px 0 4px">แตะตัวอักษรเพื่อฟังเสียง</p>
    ${tab.sections.map((sec) => `
      <h2 class="sm">${esc(sec.title)}</h2>
      <div class="kgrid" style="grid-template-columns:repeat(${sec.cols},1fr)">
        ${sec.cells.map((c, i) => c ? `
          <button class="kcell" data-say="${esc(c.say)}">
            <span class="c">${esc(c.c)}</span>
            <span class="r">${esc(c.r)}</span>
            <span class="t">${esc(c.th)}</span>
          </button>` : `<span class="kcell empty"></span>`).join("")}
      </div>`).join("")}
    ${tab.notes && tab.notes.length ? `<div class="card stack" style="margin-top:14px">${tab.notes.map((n) => `<div class="small">💡 ${esc(n)}</div>`).join("")}</div>` : ""}`;
  $view.querySelectorAll(".kcell[data-say]").forEach((b) => b.addEventListener("click", () => {
    speak(b.dataset.say, 0.75, L);
    $view.querySelectorAll(".kcell.hit").forEach((x) => x.classList.remove("hit"));
    b.classList.add("hit");
  }));
  $view.querySelectorAll("[data-cl]").forEach((b) => b.addEventListener("click", () => { S.chartLang = b.dataset.cl; S.chartTab = ""; save(); renderChart(); }));
  $view.querySelectorAll("[data-ct]").forEach((b) => b.addEventListener("click", () => { S.chartTab = b.dataset.ct; save(); renderChart(); }));
}

/* =========================================================
   7) แปลภาษา (คุยต่อหน้า / พิมพ์)
   ========================================================= */
// รายการในหน้าแปล: แต่ละรายการเก็บได้ทั้งผลแปล (dst) และผลพจนานุกรม (dict) แล้วเลือกแสดงตาม view
// { src, from: "th"|partner, dst, reading, dict: {entries, note_th}, view: "tr"|"dict", busy }
let trLog = [];
let trBusy = false;

// คำเดียว/วลีสั้น → แสดงแบบพจนานุกรม, ประโยค → แสดงคำแปล
function isShortQuery(text, P) {
  const s = text.trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (/[,，、;:]/.test(s)) return false;
  if (/[.!?。！？]$/.test(s) && words.length > 1) return false;
  if (hasThai(s)) return words.length <= 2 && s.replace(/\s/g, "").length <= 14;
  if (/[぀-ヿ㐀-鿿]/.test(s)) return words.length === 1 && s.length <= 6; // ญี่ปุ่น/จีน ไม่เว้นวรรค
  if (P === "vi") return words.length <= 4; // เวียดนามเว้นวรรคทุกพยางค์
  return words.length <= 3;
}

function renderTranslate() {
  if (!S.partner) S.partner = "en";
  if (!S.trMode || S.trMode === "dict") S.trMode = S.trMode === "dict" ? "type" : "face";
  if (!S.saved) S.saved = [];
  const P = S.partner, PM = LANG_META[P], PU = PARTNER_UI[P];
  let rec = null;
  cleanup = () => { try { rec && rec.abort(); } catch (e) {} };

  const chips = Object.keys(PARTNER_UI).map((k) => `<button class="chip lang-chip ${k === P ? "sel" : ""}" data-p="${k}" aria-label="${LANG_META[k].name}">${LANG_META[k].flag} ${LANG_META[k].abbr}</button>`).join("");
  const header = `
    <div class="lang-chips">${chips}</div>
    <div class="seg seg2" style="margin-bottom:10px">
      <button data-mode="face" class="${S.trMode === "face" ? "sel" : ""}">🗣️ คุยต่อหน้า</button>
      <button data-mode="type" class="${S.trMode === "type" ? "sel" : ""}">⌨️ พิมพ์ (แปล/ค้นคำ)</button>
    </div>`;

  const line = (t, side) => {
    // side "me" = ฝั่งคนไทย, "them" = ฝั่งคนต่างชาติ
    const mineTurn = t.from === "th";
    if (side === "them") {
      const big = mineTurn ? t.dst : t.src;
      return `<div class="tl ${mineTurn ? "in" : "out"}"><div class="big">${esc(big)}</div></div>`;
    }
    const big = mineTurn ? t.src : t.dst;
    const sub = mineTurn ? `<div class="sub2">${esc(t.dst)}${t.reading ? ` <span class="muted">(${esc(t.reading)})</span>` : ""}</div>` : `<div class="sub2 muted">${esc(t.src)}</div>`;
    return `<div class="tl ${mineTurn ? "out" : "in"}"><div class="big">${esc(big)}</div>${sub}</div>`;
  };

  if (S.trMode === "face") {
    $view.classList.add("tr-face");
    const last = trLog.filter((t) => t.dst).slice(-3);
    $view.innerHTML = header + `
      <div class="face">
        <div class="panel them">
          <div class="lines">${last.length ? last.map((t) => line(t, "them")).join("") : `<div class="muted center">${esc(PU.hint)}</div>`}</div>
          <button class="mic-sm" id="micThem">🎤 ${esc(PU.tap)}</button>
        </div>
        <div class="panel me">
          <div class="lines">${last.length ? last.map((t) => line(t, "me")).join("") : `<div class="muted center">ให้อีกฝ่ายกดไมค์ฝั่งบน (จอกลับหัวให้เขาอ่าน) หรือคุณกดไมค์ด้านล่างแล้วพูดไทย</div>`}</div>
          <div class="row">
            <button class="mic-sm grow" id="micMe">🎤 กดแล้วพูดไทย</button>
            <button class="icon-btn" id="toType" aria-label="พิมพ์">⌨️</button>
          </div>
        </div>
      </div>
      ${trBusy ? `<div class="tr-busy">กำลังแปล...</div>` : ""}`;
    const bindMic = (id, lang) => {
      const b = $view.querySelector(id);
      b.addEventListener("click", () => {
        if (!SR) { toast("ใช้ Chrome บน Android เพื่อใช้ไมค์"); return; }
        if (trBusy) return;
        if (rec) { rec.stop(); return; }
        if (window.speechSynthesis) speechSynthesis.cancel();
        b.classList.add("on");
        rec = listen({
          lang,
          onResult: (alts) => doTranslate(alts[0], lang),
          onError: (err) => toast(err === "not-allowed" ? "กรุณาอนุญาตให้ใช้ไมโครโฟน" : err === "language-not-supported" ? "เครื่องนี้ฟังภาษานี้ไม่ได้ ลองพิมพ์แทน" : "ไม่ได้ยินเสียง ลองใหม่"),
          onEnd: () => { rec = null; b.classList.remove("on"); },
        });
      });
    };
    bindMic("#micThem", P);
    bindMic("#micMe", "th");
    $view.querySelector("#toType").addEventListener("click", () => { S.trMode = "type"; save(); go("translate"); });
  } else {
    // ---------- ⌨️ พิมพ์: แปลประโยค + ค้นคำ ในช่องเดียว ----------
    $view.classList.add("has-composer");
    const isSaved = (w) => S.saved.some((x) => x.text === w);
    const dictCard = (t, i) => `
      ${t.dict.entries.map((e, j) => `
        <div class="card stack dict-entry">
          <div class="row" style="align-items:flex-start">
            <div class="grow">
              <div class="dict-word">${esc(e.word)}</div>
              ${e.reading ? `<div class="reading">${esc(e.reading)}</div>` : ""}
              ${e.thai_sound ? `<div class="small">อ่านว่า <b>${esc(e.thai_sound)}</b></div>` : ""}
            </div>
            <button class="icon-btn" data-i="${i}" data-j="${j}" data-act="dsay" aria-label="ฟังเสียง">🔊</button>
            <button class="icon-btn" data-i="${i}" data-j="${j}" data-act="dstar" aria-label="บันทึก">${isSaved(e.word) ? "⭐" : "☆"}</button>
          </div>
          <div>${e.pos ? `<span class="pill">${esc(e.pos)}</span> ` : ""}<b style="font-size:18px">${esc(e.meaning_th)}</b></div>
          ${e.examples.length ? `<div class="stack" style="border-top:1px dashed var(--line);padding-top:10px">${e.examples.map((x) => `
            <div>
              <div><button class="say" data-say="${esc(x.text)}" data-lang="${P}" style="padding:0 6px 0 0">🔊</button>${esc(x.text)}</div>
              ${x.reading ? `<div class="reading small">${esc(x.reading)}</div>` : ""}
              <div class="muted small">${esc(x.th)}</div>
            </div>`).join("")}</div>` : ""}
        </div>`).join("")}
      ${t.dict.note_th ? `<div class="explain" style="margin-top:8px">💡 ${esc(t.dict.note_th)}</div>` : ""}`;

    const item = (t, i) => {
      if (t.busy && !t.dst && !t.dict) return `<div class="msg me">${esc(t.src)}</div><div class="msg bot typing">กำลังหา...</div>`;
      const toggle = `<button class="linkbtn" data-i="${i}" data-act="toggle">${t.busy ? "กำลังโหลด..." : t.view === "dict" ? "🔁 ดูแบบคำแปล" : "📖 ดูแบบพจนานุกรม"}</button>`;
      if (t.view === "dict" && t.dict) {
        return `<div class="msg me">${esc(t.src)}</div>
          <div class="dict-wrap">${dictCard(t, i)}<div class="tr-actions">${toggle}</div></div>`;
      }
      return `
        <div class="msg tr ${t.from === "th" ? "me" : "bot"}" style="max-width:92%">
          <div class="small" style="opacity:.75">${esc(t.src)}</div>
          <div style="font-size:18px;font-weight:600;margin-top:2px">${esc(t.dst)}</div>
          ${t.reading ? `<div class="small" style="opacity:.8">${esc(t.reading)}</div>` : ""}
          <div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap">
            <button class="say" data-i="${i}" data-act="say">🔊</button>
            <button class="say" data-i="${i}" data-act="star">⭐</button>
            <button class="say" data-i="${i}" data-act="copy">📋</button>
          </div>
        </div>
        <div class="tr-actions ${t.from === "th" ? "right" : ""}">${toggle}</div>`;
    };

    $view.innerHTML = header + `
      <div class="chat">
        ${trLog.length ? trLog.map(item).join("") : `<div class="card empty"><div class="e">🌐</div><p class="muted">พิมพ์ภาษาไทยหรือ${PM.name}<br>• คำเดียว/วลีสั้น → ได้ความหมาย คำอ่าน ตัวอย่าง (แบบพจนานุกรม)<br>• ประโยค → ได้คำแปลไปอีกฝั่ง</p></div>`}
      </div>
      ${S.saved.length ? `<h2>⭐ ที่บันทึกไว้</h2><div class="card" style="padding:4px 16px">${S.saved.map((x, i) => `
        <div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)">
          <button class="say" data-si="${i}" data-act="ssay" style="font-size:18px">🔊</button>
          <div class="grow"><b>${esc(x.text)}</b>${x.reading ? `<div class="small muted">${esc(x.reading)}</div>` : ""}<div class="small muted">${LANG_META[x.lang].flag} ${esc(x.th)}</div></div>
          <button class="say" data-si="${i}" data-act="sdel" aria-label="ลบ">🗑️</button>
        </div>`).join("")}</div>` : ""}`;
    bindSay();

    const items = (i) => trLog[+i];
    $view.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (act === "say") { const t = items(b.dataset.i); speak(t.dst, 0.95, t.from === "th" ? P : "th"); }
      if (act === "copy") { const t = items(b.dataset.i); navigator.clipboard?.writeText(t.dst).then(() => toast("คัดลอกแล้ว"), () => toast("คัดลอกไม่ได้")); }
      if (act === "star") {
        const t = items(b.dataset.i);
        const fx = t.from === "th" ? { lang: P, text: t.dst, reading: t.reading, th: t.src } : { lang: P, text: t.src, reading: "", th: t.dst };
        if (!S.saved.some((x) => x.text === fx.text)) { S.saved.unshift(fx); S.saved = S.saved.slice(0, 100); save(); toast("บันทึกแล้ว ⭐"); renderTranslateSoft(); }
        else toast("บันทึกไว้แล้ว");
      }
      if (act === "dsay") { const e = items(b.dataset.i).dict.entries[+b.dataset.j]; speak(e.word, 0.8, P); }
      if (act === "dstar") {
        const e = items(b.dataset.i).dict.entries[+b.dataset.j];
        const k = S.saved.findIndex((x) => x.text === e.word);
        if (k >= 0) { S.saved.splice(k, 1); toast("เอาออกจากที่บันทึกแล้ว"); }
        else { S.saved.unshift({ lang: P, text: e.word, reading: e.reading || e.thai_sound, th: e.meaning_th }); S.saved = S.saved.slice(0, 100); toast("บันทึกคำแล้ว ⭐"); }
        save(); renderTranslateSoft();
      }
      if (act === "toggle") toggleView(+b.dataset.i);
      if (act === "ssay") { const x = S.saved[+b.dataset.si]; speak(x.text, 0.9, x.lang); }
      if (act === "sdel") { S.saved.splice(+b.dataset.si, 1); save(); renderTranslateSoft(); }
    }));

    if (!document.querySelector(".composer")) {
      const c = document.createElement("div");
      c.className = "composer";
      c.innerHTML = `<div class="inner">
        <button class="icon-btn" id="trMic" aria-label="พูดภาษา${PM.name}">🎤</button>
        <textarea id="trIn" rows="1" placeholder="พิมพ์คำ/ประโยค ไทย หรือ ${PM.name}"></textarea>
        <button class="icon-btn" id="trSend" aria-label="แปล" style="background:var(--brand);color:#fff;border-color:var(--brand)">➤</button>
      </div>`;
      document.body.appendChild(c);
      const ta = c.querySelector("#trIn");
      const send = () => { const t = ta.value.trim(); if (!t) return; ta.value = ""; ta.style.height = "auto"; doTypeQuery(t); };
      ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
      ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
      c.querySelector("#trSend").addEventListener("click", send);
      const mic = c.querySelector("#trMic");
      mic.addEventListener("click", () => {
        if (!SR) { toast("ใช้ Chrome บน Android เพื่อใช้ไมค์"); return; }
        if (rec) { rec.stop(); return; }
        mic.style.background = "var(--accent)";
        rec = listen({
          lang: P,
          onResult: (alts) => { ta.value = alts[0]; ta.dispatchEvent(new Event("input")); },
          onError: (err) => toast(err === "not-allowed" ? "กรุณาอนุญาตให้ใช้ไมโครโฟน" : "ไม่ได้ยินเสียง ลองใหม่"),
          onEnd: () => { rec = null; mic.style.background = ""; },
        });
      });
    }
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  }

  $view.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { S.partner = b.dataset.p; save(); trLog = []; go("translate"); }));
  $view.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { S.trMode = b.dataset.mode; save(); go("translate"); }));
}

// ดึงผลแบบคำแปลหรือพจนานุกรมให้รายการ t (ถ้ามีแล้วไม่ดึงซ้ำ)
async function fetchView(t, view) {
  const P = S.partner;
  if (view === "dict" && !t.dict) {
    const d = await api({ action: "lookup", text: t.src, partner: P });
    t.dict = { entries: d.entries, note_th: d.note_th };
    if (!t.from) t.from = d.direction === "from_th" ? "th" : P;
  }
  if (view === "tr" && !t.dst) {
    const d = await api({ action: "translate", text: t.src, partner: P });
    t.from = d.detected === "th" ? "th" : P;
    t.dst = d.translation; t.reading = d.reading;
  }
}

// ⌨️ พิมพ์: เลือกแบบให้อัตโนมัติ (คำสั้น → พจนานุกรม, ประโยค → คำแปล)
async function doTypeQuery(text) {
  const P = S.partner;
  const t = { src: text, view: isShortQuery(text, P) ? "dict" : "tr", busy: true };
  trLog.push(t); trLog = trLog.slice(-50);
  if (current === "translate") renderTranslateSoft();
  try {
    await fetchView(t, t.view);
    addXP(1);
    t.busy = false;
    if (current === "translate") {
      renderTranslateSoft();
      if (t.view === "dict" && t.dict.entries[0]) speak(t.dict.entries[0].word, 0.8, P);
      if (t.view === "tr") speak(t.dst, 0.95, t.from === "th" ? P : "th");
    }
  } catch (e) {
    trLog = trLog.filter((x) => x !== t);
    toast(e.message);
    if (current === "translate") renderTranslateSoft();
  }
}

async function toggleView(i) {
  const t = trLog[i];
  if (!t || t.busy) return;
  const next = t.view === "dict" ? "tr" : "dict";
  t.busy = true;
  renderTranslateSoft();
  try {
    await fetchView(t, next);
    t.view = next;
  } catch (e) {
    toast(e.message);
  } finally {
    t.busy = false;
    if (current === "translate") renderTranslateSoft();
  }
}

// 🗣️ คุยต่อหน้า: แปลเสียงพูดเสมอ
async function doTranslate(text, from) {
  const P = S.partner;
  trBusy = true;
  if (current === "translate") renderTranslateSoft();
  try {
    const d = await api({ action: "translate", text, partner: P, from: from || undefined });
    const src = d.detected === "th" ? "th" : P;
    trLog.push({ from: src, src: text, dst: d.translation, reading: d.reading, view: "tr" });
    trLog = trLog.slice(-50);
    addXP(1);
    trBusy = false;
    if (current === "translate") { renderTranslateSoft(); speak(d.translation, 0.95, src === "th" ? P : "th"); }
  } catch (e) {
    trBusy = false;
    toast(e.message);
    if (current === "translate") renderTranslateSoft();
  }
}
// วาดหน้าแปลใหม่โดยไม่ลบช่องพิมพ์ที่กำลังใช้
function renderTranslateSoft() { if (cleanup) { cleanup(); cleanup = null; } renderTranslate(); }

/* ---------- ติดตั้งเป็นแอพ (PWA) และสถานะออฟไลน์ ---------- */
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (current === "home") go("home");
});
window.addEventListener("appinstalled", () => { installPrompt = null; toast("ติดตั้งแอพแล้ว 🎉 เปิดได้จากไอคอนบนหน้าจอ"); if (current === "home") go("home"); });
window.addEventListener("offline", () => toast("ออฟไลน์อยู่: แฟลชการ์ด ควิซ เขียน ใช้ได้ ส่วน AI ต้องใช้เน็ต"));
window.addEventListener("online", () => toast("กลับมาออนไลน์แล้ว"));
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

/* =========================================================
   เริ่มแอพ
   ========================================================= */
renderLevelChip();
const start = location.hash.slice(1);
go(tabs[start] || ["speak", "write", "cards"].includes(start) ? start : "home");
