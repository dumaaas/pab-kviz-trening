// Pab Kviz multiplayer: rooms in Upstash Redis (Vercel Storage), no other server.
const crypto = require("crypto");

const URL_ = process.env.STORAGE_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.STORAGE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = 12 * 3600;            // a room lives 12 h
const DURATION = Number(process.env.PK_TEST_DURATION_MS) || 5 * 60 * 1000;   // same as the game timer
const LEAD = 5000;                // countdown before Najduža riječ
const LEAD_A = 10000;             // pause/countdown before Abakus
const MAX_PLAYERS = 30;
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function redis(...cmds) {
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  const out = await r.json();
  for (const x of out) if (x.error) throw new Error(x.error);
  return out.map(x => x.result);
}
const rkey = c => "pk:r:" + c, pkey = c => "pk:r:" + c + ":p";
const rid = n => crypto.randomBytes(n).toString("hex");
const cleanName = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);
const cleanCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

async function load(code) {
  const [room, players] = await redis(["GET", rkey(code)], ["HGETALL", pkey(code)]);
  if (!room) return null;
  const list = [];
  for (let i = 0; i + 1 < (players || []).length; i += 2) list.push({ id: players[i], ...JSON.parse(players[i + 1]) });
  list.sort((a, b) => a.joined - b.joined);
  return { room: JSON.parse(room), players: list };
}
const savePlayer = (code, p) => ["HSET", pkey(code), p.id, JSON.stringify({ name: p.name, joined: p.joined, result: p.result || null })];
const touch = code => [["EXPIRE", rkey(code), TTL], ["EXPIRE", pkey(code), TTL]];

// the quiz is Najduža riječ then Abakus; each part ends when everybody finished it or after 5 min.
// Everything is derived from stored submit times, so every request computes the same timeline.
const res = (room, p) => (p.result && p.result.round === room.round ? p.result : {});
function timeline(room, players) {
  const roster = players.filter(p => (room.roster || []).includes(p.id));
  const allAt = part => roster.length && roster.every(p => res(room, p)[part]) ? Math.max(...roster.map(p => res(room, p)[part].at)) : Infinity;
  const wStart = room.startAt, wEnd = wStart + DURATION, wStop = Math.min(wEnd, allAt("w"));
  const aStart = wStop + LEAD_A, aEnd = aStart + DURATION, aStop = Math.min(aEnd, allAt("a"));
  return { wStart, wEnd, wStop, aStart, aEnd, aStop };
}
function phaseOf(t, now) {
  return now < t.wStart ? "countW" : now < t.wStop ? "w" : now < t.aStart ? "countA" : now < t.aStop ? "a" : "done";
}
function view(code, s, pid) {
  const now = Date.now(), { room, players } = s;
  const me = players.find(p => p.id === pid);
  const running = room.status === "running";
  const t = running ? timeline(room, players) : null, phase = running ? phaseOf(t, now) : "lobby";
  const mine = me ? res(room, me) : {};
  // you see others' results of a part once you finished it yourself (or the part is over)
  const showW = running && (mine.w || phase === "countA" || phase === "a" || phase === "done");
  const showA = running && (mine.a || phase === "done");
  const pub = r => r && { score: r.score, lines: r.lines };
  return {
    code, now, status: room.status, round: room.round, seed: room.seed, duration: DURATION, phase, t,
    host: me ? me.id === room.host : false, joined: !!me, inRound: !!(me && running && (room.roster || []).includes(me.id)),
    players: players.map(p => {
      const r = res(room, p);
      return {
        name: p.name, host: p.id === room.host, me: p.id === pid, inRound: running && (room.roster || []).includes(p.id),
        wDone: !!r.w, aDone: !!r.a, ...(showW && r.w ? { w: pub(r.w) } : {}), ...(showA && r.a ? { a: pub(r.a) } : {}),
      };
    }),
  };
}

async function handle(q) {
  const action = q.action, code = cleanCode(q.code);
  if (action === "create") {
    const name = cleanName(q.name); if (!name) return [400, { error: "Upiši ime." }];
    const pid = rid(8), hostKey = rid(12);
    for (let i = 0; i < 20; i++) {
      const c = Array.from(crypto.randomBytes(4), b => CODE_ABC[b % CODE_ABC.length]).join("");
      const room = { host: pid, hostKey, status: "lobby", round: 0, roster: [], seed: 0, startAt: 0, created: Date.now() };
      const [ok] = await redis(["SET", rkey(c), JSON.stringify(room), "NX", "EX", TTL]);
      if (ok !== "OK") continue;
      await redis(savePlayer(c, { id: pid, name, joined: Date.now() }), ["EXPIRE", pkey(c), TTL]);
      return [200, { code: c, pid, hostKey }];
    }
    return [500, { error: "Pokušaj ponovo." }];
  }
  if (!code) return [400, { error: "Upiši kod." }];
  const s = await load(code);
  if (!s) return [404, { error: "Nema kviza sa tim kodom." }];
  const { room, players } = s;
  const isHost = q.hostKey && q.hostKey === room.hostKey;

  if (action === "state") return [200, view(code, s, q.pid)];

  if (action === "join") {
    const name = cleanName(q.name); if (!name) return [400, { error: "Upiši ime." }];
    const mine = players.find(p => p.id === q.pid);
    if (players.some(p => p.id !== q.pid && p.name.toLowerCase() === name.toLowerCase())) return [409, { error: `Ime „${name}" je već zauzeto u ovom kvizu.` }];
    if (!mine && players.length >= MAX_PLAYERS) return [409, { error: "Kviz je pun." }];
    const p = mine ? { ...mine, name } : { id: rid(8), name, joined: Date.now() };
    await redis(savePlayer(code, p), ...touch(code));
    players.splice(0, players.length, ...players.filter(x => x.id !== p.id), p);
    return [200, { ...view(code, s, p.id), pid: p.id }];
  }
  if (action === "start" || action === "lobby") {
    if (!isHost) return [403, { error: "Samo domaćin može pokrenuti kviz." }];
    if (action === "start") {
      if (room.status === "running" && phaseOf(timeline(room, players), Date.now()) !== "done") return [409, { error: "Kviz je već u toku." }];
      Object.assign(room, { status: "running", round: room.round + 1, roster: players.map(p => p.id), seed: crypto.randomBytes(4).readUInt32LE(0), startAt: Date.now() + LEAD });
    } else room.status = "lobby";
    await redis(["SET", rkey(code), JSON.stringify(room), "EX", TTL], ["EXPIRE", pkey(code), TTL]);
    return [200, view(code, s, room.host)];
  }
  if (action === "submit") {
    const me = players.find(p => p.id === q.pid);
    if (!me) return [403, { error: "Nisi u ovom kvizu." }];
    if (room.status !== "running" || q.round !== room.round || !(room.roster || []).includes(me.id)) return [409, { error: "Runda je završena." }];
    const part = q.part, t = timeline(room, players), now = Date.now();
    if (part !== "w" && part !== "a") return [400, { error: "Nepoznat dio kviza." }];
    // late network arrivals still count, capped at the part's deadline so the timeline stays the same
    if (part === "w" ? now >= t.aStart : (now < t.aStart - 2000 || now > t.aEnd + 15000)) return [409, { error: "Vrijeme je isteklo." }];
    const r = me.result && me.result.round === room.round ? me.result : { round: room.round };
    if (!r[part]) {
      const score = Math.max(0, Math.min(200, Math.floor(Number(q.score) || 0)));
      const lines = (Array.isArray(q.lines) ? q.lines : []).slice(0, 3).map(l => String(l).slice(0, 80));
      r[part] = { score, lines, at: Math.min(now, part === "w" ? t.wEnd : t.aEnd) };
      me.result = r;
      await redis(savePlayer(code, me), ...touch(code));
    }
    return [200, view(code, s, me.id)];
  }
  return [400, { error: "Nepoznata akcija." }];
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(500).json({ error: "Baza nije povezana (Vercel Storage → Upstash Redis)." });
  try {
    let q = req.method === "GET" ? req.query : req.body;
    if (typeof q === "string") q = JSON.parse(q || "{}");
    if (req.method === "GET") q = { ...q, action: "state" };
    const [status, body] = await handle(q || {});
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: "Greška na serveru. Pokušaj ponovo." });
  }
};
