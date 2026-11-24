"use strict";
// Abakus core: solver, task generator (calibrated on the organizer's tasks), expression parser.
const pick = a => a[Math.floor(Math.random() * a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// ===================== ABAKUS =====================
const rnd = n => 1 + Math.floor(Math.random() * n);
const popc = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2 };
const SYM = { "+": "+", "-": "−", "*": "×", "/": "÷" };

// For every subset of the numbers: all positive integers reachable with + − × ÷ (exact division),
// each number at most once. Keeps the expression with the fewest operations per value.
function abSolve(nums, cap = 60000) {
  const full = (1 << nums.length) - 1, vals = new Array(full + 1);
  for (let m = 1; m <= full; m++) {
    const map = new Map();
    if (popc(m) === 1) { const v = nums[Math.log2(m)]; map.set(v, { v, ops: 0 }); vals[m] = map; continue; }
    const low = m & -m;
    for (let a = (m - 1) & m; a > 0; a = (a - 1) & m) {
      if (!(a & low)) continue;
      const b = m ^ a;
      for (const [x, nx] of vals[a]) for (const [y, ny] of vals[b]) {
        const ops = nx.ops + ny.ops + 1;
        const put = (v, op, l, r) => { if (v <= 0 || v > cap) return; const c = map.get(v); if (!c || c.ops > ops) map.set(v, { v, op, l, r, ops }); };
        if (x >= y) put(x + y, "+", nx, ny); else put(x + y, "+", ny, nx);
        if (x > y) put(x - y, "-", nx, ny); else if (y > x) put(y - x, "-", ny, nx);
        if (x !== 1 && y !== 1) { if (x >= y) put(x * y, "*", nx, ny); else put(x * y, "*", ny, nx); }
        if (y !== 1 && x % y === 0) put(x / y, "/", nx, ny);
        if (x !== 1 && y % x === 0) put(y / x, "/", ny, nx);
      }
    }
    vals[m] = map;
  }
  return vals;
}
function fmt(nd) {
  if (!nd.op) return String(nd.v);
  const p = PREC[nd.op];
  const L = nd.l.op && PREC[nd.l.op] < p ? `(${fmt(nd.l)})` : fmt(nd.l);
  const R = nd.r.op && (PREC[nd.r.op] < p || (PREC[nd.r.op] === p && (nd.op === "-" || nd.op === "/"))) ? `(${fmt(nd.r)})` : fmt(nd.r);
  return `${L} ${SYM[nd.op]} ${R}`;
}
const abNums = () => [rnd(9), rnd(9), rnd(9), rnd(9), [10, 15, 20][rnd(3) - 1], [25, 50, 75, 100][rnd(4) - 1]];

// "Obvious route" check: how a person usually starts — the big number times something simple.
// E1: T = B × k ± r       (k from at most two other numbers, r from all the rest)
// E2: T = (B ± s) × k ± r for B = 100, or B × k with k reachable from one number and r ≤ 30 —
//     multiplying 100 (or 100 ± a small number) is trivial mental arithmetic.
function abObvious(nums, vals, T) {
  const full = vals.length - 1, BI = 5, B = nums[BI], bBit = 1 << BI;
  const rest = full ^ bBit;
  // r may use any of the remaining numbers (not necessarily all of them); r = 0 needs none
  const fits = (mask, r) => { if (r === 0) return true; for (let sm = mask; sm > 0; sm = (sm - 1) & mask) if (vals[sm].has(r)) return true; return false; };
  for (let km = rest; km > 0; km = (km - 1) & rest) {
    if (popc(km) > 2) continue;
    const rm = rest ^ km;
    for (const k of vals[km].keys()) {
      // E1
      const p = B * k;
      if (fits(rm, Math.abs(T - p))) return `E1 ${B}×${k}`;
      // E2: (100 ± s) × k ± r
      if (B === 100) for (let si = 0; si < 5; si++) {
        const sb = 1 << si; if (!(rm & sb)) continue;
        const r2 = rm ^ sb;
        for (const bb of [B + nums[si], B - nums[si]]) if (fits(r2, Math.abs(T - bb * k))) return `E2 (${B}±${nums[si]})×${k}`;
      }
    }
  }
  return null;
}

// ---- generator v5: calibrated on the organizer's six tasks (451, 892, 905, 363, 917, 735) ----
// Computer solutions never exceed 1000 at any step; difficulty checks use the uncapped solver.
function abProfile(nums) {
  const big = abSolve(nums), vals = abSolve(nums, 1000), minN = new Map(), small3 = new Set();
  for (let m = 1; m < big.length; m++) {
    const c = popc(m);
    for (const v of big[m].keys()) { if (!minN.has(v) || minN.get(v) > c) minN.set(v, c); if (c <= 3) small3.add(v); }
  }
  const near = (v, d) => { for (let k = -d; k <= d; k++) if (small3.has(v + k)) return true; return false; };
  // computer solution: fewest numbers, all steps ≤ 1000
  const solution = v => { let best = null, bc = 9; for (let m = 1; m < vals.length; m++) { const nd = vals[m].get(v); if (nd && popc(m) < bc) { bc = popc(m); best = nd; } } return best; };
  return { big, minN, near, solution };
}
// Hard (organizer's profile): needs at least 5 numbers and has no obvious "big × something ± rest" route.
// strict: nothing within ±8 with three numbers (451, 892, 905, 917, 735, 878);
// trap:   a quick approximation 3-8 away exists with three numbers, the exact number needs more
//         (503: 25 × 2 × 10 = 500 is immediate, 503 = (25 + 1) × 2 × 10 − 8 − 9).
function abHard(mode = "strict") {
  for (let tries = 0; tries < 600; tries++) {
    const nums = abNums(), P = abProfile(nums), cand = [];
    for (const [v, n] of P.minN) {
      if (v < 200 || v > 999 || n < 5 || abObvious(nums, P.big, v)) continue;
      if (mode === "strict" ? P.near(v, 8) : (P.near(v, 2) || !P.near(v, 8))) continue;
      if (P.solution(v)) cand.push(v);
    }
    if (cand.length) { const target = pick(cand); return { nums, target, sol: P.solution(target), level: "hard" }; }
  }
}
// Easier (like the organizer's 363): an obvious route exists, but it still needs at least 4 numbers
// and nothing within ±5 is reachable with three numbers (no "100 × 3 + 5").
function abEasy() {
  for (let tries = 0; tries < 600; tries++) {
    const nums = abNums(), P = abProfile(nums), cand = [];
    for (const [v, n] of P.minN) {
      if (v < 200 || v > 999 || n < 4 || P.near(v, 5) || !abObvious(nums, P.big, v)) continue;
      if (P.solution(v)) cand.push(v);
    }
    if (cand.length) { const target = pick(cand); return { nums, target, sol: P.solution(target), level: "easy" }; }
  }
}

// Parse and evaluate a player's expression; every number must come from the offered six.
function abEval(src, nums) {
  const s = src.replace(/[x×]/gi, "*").replace(/[:÷]/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
  if (!s) return { empty: true, used: [], bad: [], left: nums.slice() };
  const toks = s.match(/\d+|[-+*/()]|./g);
  let i = 0; const used = [];
  const peek = () => toks[i];
  function primary() {
    const t = toks[i++];
    if (t === "(") { const v = expr(); if (toks[i++] !== ")") throw "Zagrade nijesu zatvorene."; return v; }
    if (t !== undefined && /^\d+$/.test(t)) { used.push(+t); return +t; }
    throw t === undefined ? "Izraz nije završen." : `Neispravan znak „${t}".`;
  }
  function term() {
    let v = primary();
    while (peek() === "*" || peek() === "/") {
      const op = toks[i++], r = primary();
      if (op === "*") v *= r; else { if (r === 0 || v % r !== 0) throw "Dijeljenje mora biti bez ostatka."; v /= r; }
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = toks[i++], r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  const left = nums.slice(), bad = [];
  let value, error;
  try { value = expr(); if (i < toks.length) throw `Neispravan znak „${toks[i]}".`; } catch (e) { error = e; }
  for (const n of used) { const k = left.indexOf(n); if (k >= 0) left.splice(k, 1); else bad.push(n); }
  return { value, error, used, bad, left };
}
const abPoints = (v, target) => { if (v === undefined) return 0; const d = Math.abs(v - target); return d === 0 ? 13 : Math.max(0, 11 - d); };

