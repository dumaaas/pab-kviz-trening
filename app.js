"use strict";
// Pab Kviz - Trening: Najduža riječ + Abakus (offline PWA)
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };
const DURATION = 5 * 60 * 1000;

// ---------------- Najduža riječ: data & logic ----------------
const D = window.PK_DATA;
const WORDS = D.words.split("\n"), EXTRA = D.extra.split("\n"), SPLIT = D.split;
const T13 = D.t13.split("\n"), T12 = D.t12.split("\n"), T11 = D.t11.split("\n");
const ALPHA = ["a","b","c","č","ć","d","dž","đ","e","f","g","h","i","j","k","l","lj","m","n","nj","o","p","r","s","š","t","u","v","z","ž"];
const AID = Object.fromEntries(ALPHA.map((l, i) => [l, i]));
function tok(w) {
  if (SPLIT[w]) return SPLIT[w];
  const o = [];
  for (let i = 0; i < w.length;) { const t = w.substr(i, 2); if (t === "lj" || t === "nj" || t === "dž") { o.push(t); i += 2; } else { o.push(w[i]); i++; } }
  return o;
}
const TOK = WORDS.map(w => Uint8Array.from(tok(w).map(l => AID[l])));
const ACCEPT = new Set(WORDS); for (const w of EXTRA) ACCEPT.add(w);
const FREQ = new Array(ALPHA.length).fill(0); for (const t of TOK) for (const id of t) FREQ[id]++;
const FSUM = FREQ.reduce((a, b) => a + b, 0);
const norm = s => s.toLowerCase().replace(/[^a-zčćđšž]/g, "");
function randLetter() { let r = Math.random() * FSUM; for (let i = 0; i < FREQ.length; i++) { r -= FREQ[i]; if (r <= 0) return ALPHA[i]; } return "a"; }
function wSolve(letters) {
  const have = new Int8Array(ALPHA.length), need = new Int8Array(ALPHA.length), fits = [];
  for (const l of letters) have[AID[l]]++;
  for (let i = 0; i < TOK.length; i++) {
    const t = TOK[i]; if (t.length > letters.length || t.length < 2) continue;
    let ok = true; for (let k = 0; k < t.length; k++) if (++need[t[k]] > have[t[k]]) ok = false;
    for (let k = 0; k < t.length; k++) need[t[k]] = 0;
    if (ok) fits.push(i);
  }
  fits.sort((a, b) => TOK[b].length - TOK[a].length || WORDS[a].localeCompare(WORDS[b], "sr"));
  return { fits, max: fits.length ? TOK[fits[0]].length : 0 };
}
function wTask(target) {
  const letters = tok(target).slice(); while (letters.length < 13) letters.push(randLetter()); shuffle(letters);
  return { kind: "w", letters, ...wSolve(letters), entry: "", answer: null };
}
function wUsage(t, text) {
  const used = new Array(t.letters.length).fill(false), chips = [];
  for (const l of tok(norm(text))) { const i = t.letters.findIndex((x, k) => !used[k] && x === l); if (i >= 0) used[i] = true; chips.push([l, i >= 0]); }
  return { used, chips, bad: chips.filter(c => !c[1]).map(c => c[0]) };
}
function wCheck(w, t) {
  if (!w) return "Unesi riječ.";
  const u = wUsage(t, w);
  if (u.bad.length) return t.letters.includes(u.bad[0]) ? `Slovo „${u.bad[0].toUpperCase()}" si već iskoristio.` : `Slova „${u.bad[0].toUpperCase()}" nema među ponuđenim.`;
  if (!ACCEPT.has(w)) return `Riječ „${w.toUpperCase()}" ne postoji. Traži dalje.`;
  return null;
}
function wPoints(t, over) { if (!t.answer) return { total: 0, bonus: false }; const len = tok(t.answer).length, bonus = over && len >= t.max; return { total: len + (bonus ? 2 : 0), bonus }; }

// ---------------- Abakus: tasks ----------------
function aTask(t) { return { kind: "a", ...t, entry: "", answer: null }; }
function aCheck(t) {
  const r = abEval(t.entry, t.nums);
  if (r.empty) return { err: "Unesi račun." };
  if (r.bad.length) return { err: t.nums.includes(r.bad[0]) ? `Broj ${r.bad[0]} si već iskoristio.` : `Broja ${r.bad[0]} nema među ponuđenim.` };
  if (r.error) return { err: r.error };
  if (!Number.isInteger(r.value) || r.value <= 0) return { err: "Rezultat mora biti pozitivan cijeli broj." };
  return { value: r.value };
}
const pretty = s => s.replace(/[*x]/gi, "×").replace(/[/:]/g, "÷").replace(/-/g, "−");

// ---------------- state ----------------
const G = { screen: "home", kind: null, tasks: [], active: 0, end: 0, timer: null, over: false, typing: false, msg: "", mp: null };
let installEvt = null;

function setChrome() {
  const inGame = G.screen !== "home";
  $("backBtn").classList.toggle("hide", !inGame);
  $("timer").classList.toggle("hide", G.screen !== "game");
  $("barWrap").classList.toggle("hide", G.screen !== "game");
  const lobby = G.screen.startsWith("mp");
  $("ptsPill").classList.toggle("hide", !inGame || lobby);
  $("bottom").classList.toggle("hide", !inGame && !installEvt);
  $("title").textContent = !inGame ? "Pab Kviz - Trening" : lobby ? "Kviz sa društvom" : G.kind === "w" ? "Najduža riječ" : "Abakus";
}
function total() {
  return G.tasks.reduce((s, t) => s + (t.kind === "w" ? wPoints(t, G.over).total : (t.answer ? abPoints(t.answer.value, t.target) : 0)), 0);
}
function toast(text, err) {
  const t = $("toast"); t.textContent = text; t.className = "toast on" + (err ? " err" : "");
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.className = "toast" + (err ? " err" : ""); }, 1900);
}

// ---------------- home ----------------
function home() {
  stopTimer(); mpStop(); G.screen = "home"; G.kind = null; G.tasks = []; G.mp = null; setChrome();
  const m = $("main"); m.textContent = "";
  const hero = el("div", "hero");
  const img = el("img"); img.src = "/icons/icon-192.png"; img.alt = "";
  hero.append(img, el("h1", "", "Pab Kviz – Trening"), el("p", "", "Izaberi igru"));
  m.append(hero);
  for (const [kind, ic, name, desc] of [["w", "R", "Najduža riječ", "3 zadatka · 13 slova · 5 minuta"], ["a", "75", "Abakus", "3 zadatka · 6 brojeva · 5 minuta"]]) {
    const b = el("button", "gamecard");
    const i = el("div", "ic " + kind, ic), txt = el("div");
    txt.append(el("h3", "", name), el("p", "", desc));
    b.append(i, txt, el("span", "go", "›"));
    b.onclick = () => { buzz(8); start(kind); };
    m.append(b);
  }
  const mb = el("button", "gamecard");
  const mtxt = el("div"); mtxt.append(el("h3", "", "Igraj sa društvom"), el("p", "", "Kod kviza · isti zadaci za sve · tabela"));
  mb.append(el("div", "ic m", "👥"), mtxt, el("span", "go", "›"));
  mb.onclick = () => { buzz(8); mpEntry(); };
  m.append(mb);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  if (ios) m.append(el("div", "hint", "Instalacija na iPhone: Podijeli → Dodaj na početni ekran"));
  const f = $("bottom"); f.textContent = "";
  if (installEvt) {
    const b = el("button", "btn primary", "Instaliraj aplikaciju");
    b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; home(); };
    f.append(b);
  }
}

// ---------------- game ----------------
function makeTasks(kind) {
  if (kind === "w") {
    const pool = Math.random() < 0.5 ? T11 : T12;
    const tg = [pick(T13), pick(T11)]; let third; do { third = pick(pool); } while (tg.includes(third)); tg.push(third);
    return shuffle(tg.map(wTask));
  }
  return shuffle([abEasy(), abHard("strict"), abHard(Math.random() < 0.5 ? "strict" : "trap")]).map(aTask);
}
// same seed -> same letters/numbers on every phone
function seeded(seed, fn) {
  const orig = Math.random; let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = orig; }
}
function start(kind, mp) {
  G.kind = kind; G.screen = "game"; G.over = false; G.active = 0; G.typing = false; G.msg = ""; G.mp = mp || null;
  G.tasks = mp ? seeded(mp.seed, () => makeTasks(kind)) : makeTasks(kind);
  G.end = mp ? mp.end : Date.now() + DURATION;
  stopTimer(); G.timer = setInterval(tick, 250); tick();
  setChrome(); renderGame(true);
}
function stopTimer() { clearInterval(G.timer); G.timer = null; }
function tick() {
  const left = Math.max(0, G.end - Date.now()), s = Math.ceil(left / 1000);
  $("timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  $("timer").classList.toggle("low", s <= 30);
  $("bar").style.width = (left / DURATION * 100) + "%";
  if (left <= 0) finish();
}
function finish() {
  if (G.over) return;
  G.over = true; stopTimer(); G.screen = "results"; G.typing = false;
  clearTimeout(toast.h); $("toast").className = "toast"; buzz([20, 40, 20]); setChrome(); renderResults();
  if (G.mp) mpSubmit();
}
function cur() { return G.tasks[G.active]; }

function renderGame(full) {
  $("pts").textContent = total();
  renderMain();
  if (full) renderBottom();
}
function renderMain() {
  const m = $("main"); m.textContent = "";
  G.tasks.forEach((t, i) => {
    const card = el("section", "task" + (i === G.active ? " on" : "") + (t.answer ? " done" : ""));
    card.dataset.i = i;
    card.addEventListener("click", () => { if (G.active !== i) { G.active = i; G.msg = ""; buzz(4); renderGame(true); } });
    const head = el("div", "thead");
    head.append(el("span", "tname", `${t.kind === "w" ? "Riječ" : "Zadatak"} ${i + 1}`));
    if (t.kind === "a") head.append(el("span", "tgt", String(t.target)));
    else if (t.answer) head.append(el("span", "tok", "✓"));
    card.append(head);
    if (t.kind === "w") renderWord(card, t, i); else renderAbakus(card, t, i);
    m.append(card);
  });
}
function tap(i, fn) { return e => { e.stopPropagation(); G.active = i; G.msg = ""; fn(); syncTyper(); renderGame(true); }; }
function letterCls(l) { return l.length > 1 ? " dg" : ""; }
function renderWord(card, t, i) {
  const on = i === G.active, u = wUsage(t, t.entry);
  const tiles = el("div", "row13");
  t.letters.forEach((l, k) => {
    const b = el("button", "tile" + letterCls(l) + (u.used[k] ? " used" : ""), l.toUpperCase());
    b.onclick = tap(i, () => { if (!u.used[k]) { buzz(6); t.entry += l; } });
    tiles.append(b);
  });
  card.append(tiles);
  const entry = el("div", "row13 entry");
  for (let k = 0; k < 13; k++) {
    const c = u.chips[k];
    entry.append(c ? el("span", "chip" + letterCls(c[0]) + (c[1] ? "" : " bad"), c[0].toUpperCase()) : el("span", "slot"));
  }
  card.append(entry);
  const warn = u.bad.length ? (t.letters.includes(u.bad[0]) ? `Slovo „${u.bad[0].toUpperCase()}" si već iskoristio – više nije dostupno.` : `Slova „${u.bad[0].toUpperCase()}" nema među ponuđenim.`) : "";
  const msg = on ? (G.msg || warn) : warn;
  if (msg) card.append(el("div", "msg", msg));
  if (t.answer) card.append(el("div", "saved", `Prijavljeno: ${t.answer.toUpperCase()} (${tok(t.answer).length} slova)`));
  if (on) { const ty = $("typer"); if (ty) ty.classList.toggle("bad", u.bad.length > 0); }
}
function renderAbakus(card, t, i) {
  const on = i === G.active, r = abEval(t.entry, t.nums);
  const usedCount = {}; for (const n of r.used) usedCount[n] = (usedCount[n] || 0) + 1;
  const seen = {};
  const nums = el("div", "row6");
  t.nums.forEach((v, k) => {
    seen[v] = (seen[v] || 0) + 1;
    const used = seen[v] <= (usedCount[v] || 0);
    const b = el("button", "tile num" + (k === 4 ? " mid" : k === 5 ? " big" : "") + (used ? " used" : ""), String(v));
    b.onclick = tap(i, () => { if (!used) { buzz(6); t.entry += String(v); } });
    nums.append(b);
  });
  card.append(nums);
  const ops = el("div", "row6 ops");
  for (const [lbl, ins] of [["+", "+"], ["−", "-"], ["×", "*"], ["÷", "/"], ["(", "("], [")", ")"]]) {
    const b = el("button", "op", lbl); b.onclick = tap(i, () => { buzz(5); t.entry += ins; }); ops.append(b);
  }
  card.append(ops);
  const entry = el("div", "entry expr");
  if (!t.entry.trim()) entry.append(el("span", "ph", on ? "Dodiruj brojeve i znakove" : "—"));
  else {
    entry.append(el("span", "ex", pretty(t.entry)));
    if (!r.error && !r.bad.length && r.value !== undefined) entry.append(el("span", "val", `= ${r.value}`));
  }
  card.append(entry);
  let warn = "";
  if (r.bad.length) warn = t.nums.includes(r.bad[0]) ? `Broj ${r.bad[0]} si već iskoristio – više nije dostupan.` : `Broja ${r.bad[0]} nema među ponuđenim.`;
  else if (r.error === "Dijeljenje mora biti bez ostatka.") warn = r.error;
  const msg = on ? (G.msg || warn) : warn;
  if (msg) card.append(el("div", "msg", msg));
  if (t.answer) card.append(el("div", "saved", `Prijavljeno: ${t.answer.text} = ${t.answer.value}`));
  if (on) { const ty = $("typer"); if (ty) ty.classList.toggle("bad", r.bad.length > 0); }
}
function renderBottom() {
  const f = $("bottom"); f.textContent = "";
  const t = cur();
  if (G.typing) {
    const inp = el("input", "typer"); inp.id = "typer";
    inp.autocomplete = "off"; inp.spellcheck = false; inp.setAttribute("autocapitalize", "off"); inp.setAttribute("autocorrect", "off");
    inp.placeholder = t.kind === "w" ? `kucaj riječ ${G.active + 1}` : `npr. (50-7)*(6+15)-5 · zadatak ${G.active + 1}`;
    inp.value = t.entry;
    inp.addEventListener("input", () => { cur().entry = inp.value; G.msg = ""; renderGame(); });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    f.append(inp);
    setTimeout(() => inp.focus(), 0);
  }
  const row = el("div", "btnrow");
  const kb = el("button", "btn sq", "⌨"); kb.setAttribute("aria-label", "Kucaj ručno");
  kb.onclick = () => { G.typing = !G.typing; renderBottom(); };
  const back = el("button", "btn sq", "⌫"); back.setAttribute("aria-label", "Obriši zadnje");
  back.onclick = () => { const t = cur(); buzz(5); if (t.kind === "w") { const k = tok(norm(t.entry)); k.pop(); t.entry = k.join(""); } else t.entry = t.entry.replace(/\s*(\d+|\S)\s*$/, ""); G.msg = ""; syncTyper(); renderGame(); };
  const clr = el("button", "btn", "Obriši");
  clr.onclick = () => { cur().entry = ""; G.msg = ""; buzz(5); syncTyper(); renderGame(); };
  const ok = el("button", "btn primary", "Prijavi");
  ok.onclick = submit;
  const end = el("button", "btn end", "Završi");
  end.onclick = () => { if (G.tasks.every(x => x.answer) || confirm("Završiti kviz i vidjeti rješenja?")) finish(); };
  row.append(kb, back, clr, ok, end);
  f.append(row);
}
function syncTyper() { const ty = $("typer"); if (ty && ty.value !== cur().entry) ty.value = cur().entry; }
function shake() { const e = document.querySelector(".entry"); if (e) { e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake"); } }
function submit() {
  const t = cur();
  if (t.kind === "w") {
    const w = norm(t.entry), err = wCheck(w, t);
    if (err) { G.msg = err; buzz(60); renderGame(); shake(); toast(err, true); return; }
    t.answer = w;
  } else {
    const c = aCheck(t);
    if (c.err) { G.msg = c.err; buzz(60); renderGame(); shake(); toast(c.err, true); return; }
    t.answer = { text: pretty(t.entry), value: c.value };
  }
  t.entry = ""; G.msg = ""; buzz(15);
  if (G.tasks.every(x => x.answer)) { finish(); return; }
  toast("Prijavljeno ✓");
  const next = G.tasks.findIndex(x => !x.answer); if (next >= 0) G.active = next;
  renderGame(true);
  const c = document.querySelector(`.task[data-i="${G.active}"]`); if (c) c.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------------- results ----------------
function renderResults() {
  $("pts").textContent = total();
  const m = $("main"); m.textContent = "";
  const tot = el("div", "total"); tot.append(el("b", "", String(total())), el("span", "", "bodova"));
  m.append(tot);
  if (G.mp) { const b = el("div", "res board"); b.id = "board"; m.append(b); renderBoard(); }
  G.tasks.forEach((t, i) => {
    const c = el("div", "res");
    const h = el("h4"); h.append(el("span", "", `${t.kind === "w" ? "Riječ" : "Zadatak"} ${i + 1}`));
    if (t.kind === "w") {
      const p = wPoints(t, true);
      h.append(el("b", "", `${p.total} b.`)); c.append(h);
      c.append(el("div", "line " + (t.answer ? (p.bonus ? "gold" : "ok") : "bad"), t.answer ? `Tvoja riječ: ${t.answer.toUpperCase()} (${tok(t.answer).length})${p.bonus ? " – najduža! +2" : ""}` : "Bez odgovora"));
      c.append(el("div", "line mut", `Najduža moguća: ${Math.max(t.max, t.answer ? tok(t.answer).length : 0)} slova`));
      const ws = el("div", "words");
      for (const k of t.fits.slice(0, 14)) ws.append(el("span", TOK[k].length === t.max ? "best" : "", `${WORDS[k]} (${TOK[k].length})`));
      c.append(ws);
    } else {
      const pts = t.answer ? abPoints(t.answer.value, t.target) : 0, d = t.answer ? Math.abs(t.answer.value - t.target) : null;
      h.append(el("b", "", `${pts} b.`)); c.append(h);
      c.append(el("div", "line", `Traženi broj: ${t.target}  ·  ${t.nums.join(" ")}`));
      c.append(el("div", "line " + (t.answer ? (d === 0 ? "gold" : "ok") : "bad"), t.answer ? `Tvoj račun: ${t.answer.text} = ${t.answer.value}${d === 0 ? " – tačno!" : ` (promašaj ${d})`}` : "Bez odgovora"));
      c.append(el("div", "line mut", `Kompjuter: ${fmt(t.sol)} = ${t.target}`));
    }
    m.append(c);
  });
  const f = $("bottom"); f.textContent = "";
  const row = el("div", "btnrow");
  if (G.mp) { f.append(row); mpResultsBottom(row); window.scrollTo(0, 0); return; }
  const hb = el("button", "btn", "Početna"); hb.onclick = home;
  const again = el("button", "btn primary", "Igraj ponovo"); again.onclick = () => start(G.kind);
  row.append(hb, again); f.append(row);
  window.scrollTo(0, 0);
}

// ---------------- igra sa društvom (multiplayer) ----------------
// Kviz sa društvom: Najduža riječ pa Abakus. Dio se završava kad svi završe ili istekne 5 minuta.
const MPK = "pk-mp";
const MP = { code: "", pid: "", hostKey: "", poll: null, offset: 0, last: null, busy: false, count: "" };
const savedName = () => localStorage.getItem("pk-name") || "";
function mpSave() { localStorage.setItem(MPK, JSON.stringify({ code: MP.code, pid: MP.pid, hostKey: MP.hostKey })); }
function mpForget() { mpStop(); localStorage.removeItem(MPK); Object.assign(MP, { code: "", pid: "", hostKey: "", last: null, count: "" }); G.mp = null; }
function mpStop() { clearInterval(MP.poll); MP.poll = null; }
function mpPoll(ms) { mpStop(); MP.poll = setInterval(mpRefresh, ms || 2000); }
const srv = () => Date.now() + MP.offset;            // server clock
const PART = { w: "Najduža riječ", a: "Abakus" };
async function api(body) {
  const t0 = Date.now();
  const r = await fetch(body ? "/api/room" : `/api/room?code=${MP.code}&pid=${MP.pid}`, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: MP.code, pid: MP.pid, hostKey: MP.hostKey, ...body }) }
    : { cache: "no-store" });
  const t1 = Date.now();
  let j = {}; try { j = await r.json(); } catch (_) {}
  if (!r.ok) throw Object.assign(new Error(j.error || "Nema veze sa serverom."), { status: r.status });
  if (j.now) MP.offset = j.now - (t0 + t1) / 2;
  return j;
}
const netErr = e => (e instanceof TypeError ? "Nema interneta – pokušaj ponovo." : e.message);

function mpEntry(prefill) {
  stopTimer(); mpStop(); G.screen = "mpjoin"; G.mp = null; setChrome();
  const m = $("main"); m.textContent = "";
  const box = el("div", "mpbox");
  box.append(el("h2", "", "Igraj sa društvom"), el("p", "mut", "Najduža riječ pa Abakus. Svi dobijaju ista slova i iste brojeve, domaćin pokreće kviz."));
  const name = el("input", "field"); name.placeholder = "Tvoje ime"; name.maxLength = 20; name.value = savedName(); name.autocomplete = "nickname";
  box.append(el("label", "lbl", "Ime"), name);
  const err = el("div", "msg");
  const go = async (fn) => {
    const n = name.value.trim(); if (!n) { err.textContent = "Upiši ime."; name.focus(); return; }
    localStorage.setItem("pk-name", n); err.textContent = "";
    try { await fn(n); } catch (e) { err.textContent = netErr(e); buzz(60); }
  };
  const mk = el("button", "btn primary wide", "Napravi novi kviz");
  mk.onclick = () => go(async n => {
    const j = await api({ action: "create", name: n });
    Object.assign(MP, { code: j.code, pid: j.pid, hostKey: j.hostKey }); mpSave(); await mpRefresh();
  });
  box.append(mk, el("div", "or", "ili uđi u postojeći"));
  const code = el("input", "field code"); code.placeholder = "KOD"; code.maxLength = 6; code.value = prefill || "";
  code.setAttribute("autocapitalize", "characters"); code.autocomplete = "off";
  code.addEventListener("input", () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  const jn = el("button", "btn wide", "Uđi u kviz");
  jn.onclick = () => go(async n => {
    const c = code.value.trim(); if (!c) { err.textContent = "Upiši kod kviza."; code.focus(); return; }
    Object.assign(MP, { code: c, pid: "", hostKey: "" });
    const j = await api({ action: "join", name: n }).catch(e => { MP.code = ""; throw e; });
    MP.pid = j.pid; mpSave(); mpApply(j);
  });
  box.append(code, jn, err);
  m.append(box);
  $("bottom").textContent = "";
  setTimeout(() => (name.value ? code : name).focus(), 50);
}

async function mpRefresh() {
  if (!MP.code || MP.busy) return;
  MP.busy = true;
  try { mpApply(await api()); }
  catch (e) { if (e.status === 404) { mpForget(); toast("Kviz više ne postoji.", true); home(); } }
  finally { MP.busy = false; }
}
// one place decides which screen the room state means
function mpApply(s) {
  MP.last = s;
  if (!s.joined) { mpForget(); mpEntry(s.code); return; }
  if (G.screen === "game") return;                       // own timer drives the game; result is submitted at the end
  if (s.status === "lobby") { mpLobby(s); return; }
  if (!s.inRound) { mpBoardOnly("Kviz je u toku – igraš od sledeće runde."); return; }
  const me = s.players.find(p => p.me), t = s.t, now = srv();
  const part = !me.wDone && now < t.aStart ? "w" : !me.aDone && now < t.aStop ? "a" : null;
  const showing = G.screen === "results" && G.mp && G.mp.round === s.round ? G.mp.part : null;
  if (part === "w") {
    if (now < t.wStart) mpCountdown(s, "w", t.wStart, t.wEnd); else mpPlay(s, "w", t.wEnd);
    return;
  }
  if (part === "a") {
    if (now < t.wStop) { showing === "w" ? mpUpdateWait() : mpBoardOnly(); return; }   // others still on words
    if (now < t.aStart) mpCountdown(s, "a", t.aStart, t.aEnd); else mpPlay(s, "a", t.aEnd);
    return;
  }
  showing === "a" ? mpUpdateWait() : mpBoardOnly();         // waiting for others on Abakus, or the final table
}
const seedFor = (s, part) => part === "w" ? s.seed : (s.seed ^ 0x9e3779b9) >>> 0;
function mpPlay(s, part, end) {
  mpStop(); MP.count = "";
  start(part, { seed: seedFor(s, part), round: s.round, part, end: end - MP.offset });
}

function mpLobby(s) {
  const key = JSON.stringify([s.code, s.host, s.players.map(p => p.name)]);
  if (G.screen === "mplobby" && MP.lobby === key) return;
  MP.lobby = key;
  stopTimer(); G.screen = "mplobby"; G.mp = null; MP.count = ""; setChrome();
  const m = $("main"); m.textContent = "";
  const box = el("div", "mpbox");
  box.append(el("p", "mut", "Kod kviza"));
  box.append(el("div", "bigcode", s.code));
  const share = el("button", "btn wide", "Pozovi društvo");
  share.onclick = async () => {
    const url = `${location.origin}/?k=${s.code}`, text = `Pab Kviz – uđi sa kodom ${s.code}`;
    try { if (navigator.share) await navigator.share({ title: "Pab Kviz", text, url }); else { await navigator.clipboard.writeText(url); toast("Link kopiran ✓"); } } catch (_) {}
  };
  box.append(share);
  box.append(el("h3", "plh", `Igrači (${s.players.length})`));
  const ul = el("div", "plist");
  for (const p of s.players) { const r = el("div", "pl" + (p.me ? " me" : "")); r.append(el("span", "", p.name), el("span", "tag", p.host ? "domaćin" : p.me ? "ti" : "")); ul.append(r); }
  box.append(ul);
  box.append(el("p", "mut small", "Prvo Najduža riječ, pa Abakus – po 5 minuta. Sledeći dio kreće kad svi završe ili istekne vrijeme."));
  m.append(box);
  const f = $("bottom"); f.textContent = "";
  if (s.host) {
    const b = el("button", "btn primary wide", "Pokreni kviz");
    b.onclick = async () => { buzz(10); b.disabled = true; try { mpApply(await api({ action: "start" })); } catch (e) { b.disabled = false; toast(netErr(e), true); } };
    f.append(b);
  } else f.append(el("div", "bhint wait", "Čeka se da domaćin pokrene kviz…"));
  mpPoll(2000);
}

function mpCountdown(s, part, at, end) {
  const key = `${s.round}${part}`;
  if (G.screen === "mpcount" && MP.count === key) return;
  stopTimer(); mpStop(); MP.count = key; G.screen = "mpcount"; G.kind = part; setChrome(); $("bottom").textContent = "";
  const m = $("main"); m.textContent = "";
  const box = el("div", "mpbox count");
  box.append(el("p", "mut", part === "w" ? "1. dio" : "2. dio"), el("h2", "", PART[part]), el("div", "bignum", ""), el("p", "mut", "počinje za…"));
  m.append(box);
  const n = box.querySelector(".bignum");
  G.timer = setInterval(() => {
    const left = at - srv();
    if (left <= 0) { stopTimer(); mpPlay(s, part, end); return; }
    const k = String(Math.ceil(left / 1000)); if (n.textContent !== k) { n.textContent = k; buzz(8); }
  }, 100);
}

function mpLines() {
  return G.tasks.map(t => t.kind === "w"
    ? (t.answer ? `${t.answer.toUpperCase()} (${tok(t.answer).length})` : "—")
    : (t.answer ? `${t.answer.text} = ${t.answer.value} → ${t.target}` : `— → ${t.target}`));
}
async function mpSubmit() {
  const body = { action: "submit", part: G.mp.part, round: G.mp.round, score: total(), lines: mpLines() };
  for (let i = 0; i < 5; i++) {
    try { MP.last = await api(body); mpUpdateWait(); break; }
    catch (e) { if (e.status && e.status !== 500) { toast(netErr(e), true); break; } await new Promise(r => setTimeout(r, 1500)); }
  }
  mpPoll(2000);
}
// who still plays the part this screen is about
function mpWaiting(s, part) {
  const k = part === "w" ? "wDone" : "aDone";
  return s.players.filter(p => p.inRound && !p[k]).map(p => p.name);
}
function mpClock(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function renderBoard() {
  const b = $("board"), s = MP.last; if (!b || !s || !s.t) return;
  const now = s.now, t = s.t, me = s.players.find(p => p.me);
  // after words (until Abakus is done for me) the table is about words; then the total
  const part = me && me.aDone || s.phase === "done" ? "a" : "w";
  const final = part === "a";
  b.textContent = "";
  const h = el("h4"); h.append(el("span", "", final ? (s.phase === "done" ? "Konačna tabela" : "Tabela") : "Tabela – Najduža riječ"), el("b", "", `kod ${s.code}`)); b.append(h);
  const sc = p => final ? (p.w ? p.w.score : 0) + (p.a ? p.a.score : 0) : (p.w ? p.w.score : 0);
  const wOver = s.phase !== "countW" && s.phase !== "w";
  const shown = p => final ? (p.aDone && !!p.a) || s.phase === "done" : (p.wDone && !!p.w) || wOver;
  const ps = s.players.filter(p => p.inRound).sort((x, y) => (shown(y) ? sc(y) : -1) - (shown(x) ? sc(x) : -1));
  let rank = 0, prev = null;
  ps.forEach((p, i) => {
    const has = shown(p), v = has ? sc(p) : undefined;
    if (has && v !== prev) { rank = i + 1; prev = v; }
    const r = el("div", "brow" + (p.me ? " me" : ""));
    const top = el("div", "btop");
    top.append(el("span", "rk", has ? `${rank}.` : ""), el("span", "nm", p.name), el("b", "sc", has ? String(v) : "igra…"));
    r.append(top);
    if (has) {
      if (final) r.append(el("div", "bsplit", `Riječi ${p.w ? p.w.score : 0} · Abakus ${p.a ? p.a.score : 0}`));
      const l = el("div", "blines");
      for (const x of [...(final && p.w ? p.w.lines : []), ...((final ? p.a : p.w) || { lines: [] }).lines]) l.append(el("span", "", x));
      r.append(l);
    }
    b.append(r);
  });
  const wait = mpWaiting(s, part);
  if (wait.length && s.phase !== "done") {
    const left = part === "w" ? t.wEnd - now : t.aEnd - now;
    h.after(el("div", "waitbox", `Čeka se da završe: ${wait.join(", ")}`), el("div", "line mut", part === "w" ? `Abakus kreće kad svi završe, najkasnije za ${mpClock(left)}` : `Tabela se zaključuje kad svi završe, najkasnije za ${mpClock(left)}`));
  } else if (!final) b.append(el("div", "line mut", "Svi su završili – Abakus uskoro počinje."));
}
function mpUpdateWait() { renderBoard(); mpResultsBottom(); }
function mpResultsBottom(row) {
  const f = $("bottom"), s = MP.last;
  if (!row) { f.textContent = ""; row = el("div", "btnrow"); f.append(row); }
  const out = el("button", "btn", "Izađi"); out.onclick = () => { if (confirm("Izaći iz kviza?")) { mpForget(); home(); } };
  row.append(out);
  const done = s && s.phase === "done";
  if (done && s.host) { const nb = el("button", "btn primary", "Nova runda"); nb.onclick = async () => { try { mpApply(await api({ action: "lobby" })); } catch (e) { toast(netErr(e), true); } }; row.append(nb); }
  else row.append(el("div", "bhint wait flex", done ? "Domaćin pokreće novu rundu" : "Čeka se ostale…"));
}
function mpBoardOnly(note) {
  if (G.screen === "mpboard" && $("board")) { mpUpdateWait(); return; }
  stopTimer(); G.screen = "mpboard"; G.mp = null; MP.count = ""; setChrome();
  const m = $("main"); m.textContent = "";
  if (note) m.append(el("div", "waitbox", note));
  const b = el("div", "res board"); b.id = "board"; m.append(b); renderBoard();
  mpResultsBottom();
  if (!MP.poll) mpPoll(2000);
}

// ---------------- boot ----------------
$("backBtn").onclick = () => {
  if (G.screen === "game" && (G.mp || G.tasks.some(t => t.answer || t.entry)) && !confirm("Prekinuti kviz?")) return;
  if (G.mp || G.screen.startsWith("mp")) mpForget();
  home();
};
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (G.screen === "home") home(); });
window.addEventListener("appinstalled", () => { installEvt = null; if (G.screen === "home") home(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
{
  const k = new URLSearchParams(location.search).get("k"), saved = JSON.parse(localStorage.getItem(MPK) || "null");
  if (k) history.replaceState(null, "", "/");
  if (saved && saved.code && (!k || k.toUpperCase() === saved.code)) { Object.assign(MP, saved); home(); mpRefresh(); }
  else if (k) mpEntry(k.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  else home();
}
