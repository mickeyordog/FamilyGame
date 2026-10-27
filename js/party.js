/* Party mode's big screen. The host runs it on the laptop/TV: it simulates the minigame and draws everyone,
   while phones (js/pad.js) only send joystick directions through the Realtime Database. */
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { ref, get, set, update, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { configured, auth, rtdb, col, $, esc, colorOf, ordinal, notConfigured } from "./common.js";

const W = 1600, H = 900, PR = 26, SPEED = 430, PTS = [3, 2, 1];
const metaRef = rtdb && ref(rtdb, "party/meta");
let players = [], inputs = {}, M = {on:true, phase:"lobby", scores:{}}, S = null, conn = "connecting", countEnd = 0;
const ctx = $("cv").getContext("2d");
const rnd = (a, b) => a + Math.random()*(b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- minigames: start(ids) -> state, step(state, dt, inputs) -> ids knocked out, draw(state) ---------- */
const GAMES = {
  dodge: {
    title: "Dodgefall", hint: "Dodge the shadows!",
    rules: "Shadows appear, then something heavy lands on them. Get out of the way. Last one standing wins.",
    start: ids => ({t:0, next:1, hz:[], ps:Object.fromEntries(ids.map((id,i) => { const a = i/ids.length*2*Math.PI; return [id, {x:W/2 + Math.cos(a)*260, y:H/2 + Math.sin(a)*260, out:null}] }))}),
    step(s, dt, inp) {
      s.t += dt; const k = Math.min(1, s.t/60); // difficulty ramps up over a minute
      walk(s, dt, inp);
      if ((s.next -= dt) <= 0) {
        s.next = 1.1 - 0.8*k;
        const alive = Object.values(s.ps).filter(p => p.out == null), r = 70 + 70*k;
        const aim = alive.length && Math.random() < 0.6 ? alive[Math.floor(Math.random()*alive.length)] : null;
        s.hz.push({x:clamp(aim ? aim.x + rnd(-60, 60) : rnd(0, W), r, W - r), y:clamp(aim ? aim.y + rnd(-60, 60) : rnd(0, H), r, H - r), r, born:s.t, land:s.t + 1.5 - 0.7*k, hit:false});
      }
      const outs = [];
      for (const h of s.hz) if (!h.hit && s.t >= h.land) {
        h.hit = true;
        for (const [id,p] of Object.entries(s.ps)) if (p.out == null && Math.hypot(p.x - h.x, p.y - h.y) < h.r + PR*0.4) { p.out = s.t; outs.push(id) }
      }
      s.hz = s.hz.filter(h => s.t < h.land + 0.35);
      return outs;
    },
    draw(s) {
      for (const h of s.hz) {
        if (s.t < h.land) {
          const f = (s.t - h.born)/(h.land - h.born);
          ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.35*f})`; circle(h.x, h.y, h.r*(0.4 + 0.6*f)); ctx.fill();
          ctx.strokeStyle = "rgba(255,90,70,.8)"; ctx.lineWidth = 4; circle(h.x, h.y, h.r); ctx.stroke();
        } else { ctx.fillStyle = `rgba(255,230,200,${1 - (s.t - h.land)/0.35})`; circle(h.x, h.y, h.r); ctx.fill() }
      }
      drawPlayers(s);
    },
  },
};

/* shared by games where everyone walks around the arena */
function walk(s, dt, inp) {
  for (const [id,p] of Object.entries(s.ps)) {
    if (p.out != null) continue;
    const v = inp[id] || {x:0, y:0}, m = Math.hypot(v.x, v.y), f = m > 1 ? 1/m : 1;
    p.x = clamp(p.x + v.x*f*SPEED*dt, PR, W - PR); p.y = clamp(p.y + v.y*f*SPEED*dt, PR, H - PR);
  }
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2*Math.PI) }
function drawPlayers(s) {
  ctx.textAlign = "center"; ctx.font = "600 24px 'Work Sans', sans-serif";
  for (const [id,p] of Object.entries(s.ps)) {
    ctx.globalAlpha = p.out == null ? 1 : 0.3;
    ctx.fillStyle = colorOf(players, id); circle(p.x, p.y, PR); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillText(players.find(q => q.id === id)?.n || "?", p.x, p.y - PR - 10);
    if (p.out != null) { ctx.font = "800 34px sans-serif"; ctx.fillText("✕", p.x, p.y + 12); ctx.font = "600 24px 'Work Sans', sans-serif" }
  }
  ctx.globalAlpha = 1;
}
function drawArena() {
  ctx.fillStyle = "#24305e"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y <= H; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
}

/* ---------- flow: lobby → countdown → play → over → lobby ---------- */
const save = () => set(metaRef, M).catch(() => { conn = "denied"; render() });
function begin(key) {
  const ids = players.filter(p => inputs[p.id]).map(p => p.id); if (!ids.length) return;
  S = {key, ids, ...GAMES[key].start(ids)};
  set(ref(rtdb, "party/status"), null).catch(() => {});
  countEnd = performance.now() + 3000;
  M = {...M, phase:"countdown", game:key, hint:GAMES[key].hint, last:null}; save(); render();
}
function finish() {
  const out = id => S.ps[id].out ?? Infinity;
  M.last = S.ids.map(id => { const place = 1 + S.ids.filter(o => out(o) > out(id)).length; return {id, place, pts:PTS[place - 1] || 0} }).sort((a,b) => a.place - b.place);
  M.scores = {...M.scores}; M.last.forEach(x => M.scores[x.id] = (M.scores[x.id] || 0) + x.pts);
  M.phase = "over"; save(); render();
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev)/1000); prev = now;
  drawArena();
  if (S && M.phase === "countdown") {
    GAMES[S.key].draw(S);
    const c = Math.ceil((countEnd - now)/1000), el = $("count");
    if (el && el.textContent !== String(c)) el.textContent = c;
    if (now >= countEnd) { M.phase = "play"; save(); render() }
  } else if (S && M.phase === "play") {
    const outs = GAMES[S.key].step(S, dt, inputs);
    if (outs.length) update(ref(rtdb, "party/status"), Object.fromEntries(outs.map(id => [id, "out"]))).catch(() => {});
    GAMES[S.key].draw(S);
    const alive = S.ids.filter(id => S.ps[id].out == null).length;
    if (alive <= (S.ids.length > 1 ? 1 : 0) || S.t > 120) finish();
  } else if (S) GAMES[S.key].draw(S);
  requestAnimationFrame(frame);
}

/* ---------- overlay ---------- */
function scoreList() {
  const rows = players.map(p => ({...p, pts:M.scores?.[p.id] || 0})).sort((a,b) => b.pts - a.pts);
  return `<ul class="list">${rows.map(p => `<li><span class="grow"><span class="swatch" style="background:${colorOf(players, p.id)}"></span>${esc(p.n)}</span>
    <span class="small muted">${inputs[p.id] ? "controller ready" : "no controller"}</span><span class="score">${p.pts}</span></li>`).join("") || `<li class="muted">No players yet.</li>`}</ul>`;
}
function view() {
  if (!configured) return `<div class="panel">${notConfigured}</div>`;
  if (conn === "login") return `<div class="panel"><h1>Party mode</h1><p>Sign in on the <a href="host.html${esc(location.search)}">host page</a> first, then come back.</p></div>`;
  if (conn === "denied") return `<div class="panel"><h1>Party mode</h1><p class="muted">This account can't run party mode. Check the host UID in database.rules.json, and that the Realtime Database exists.</p></div>`;
  if (conn === "connecting") return `<div class="panel"><p class="muted">Connecting…</p></div>`;
  if (M.phase === "countdown") return `<div class="count" id="count">3</div>`;
  if (M.phase === "play") return "";
  const ready = players.filter(p => inputs[p.id]).length, link = new URL("./", location.href).href;
  const last = M.phase === "over" && M.last ? `<div class="label">${esc(GAMES[M.game]?.title || "")} results</div><ul class="list">${M.last.map(x =>
    `<li><span class="score">${ordinal(x.place)}</span><span class="grow"><span class="swatch" style="background:${colorOf(players, x.id)}"></span>${esc(players.find(p => p.id === x.id)?.n || "?")}</span><span class="score">+${x.pts}</span></li>`).join("")}</ul>` : "";
  return `<div class="panel"><h1>${M.phase === "over" ? "Round over" : "Party mode"}</h1>${last}
    <p class="muted small">Phones on <b>${esc(link)}</b> turn into controllers. Drag anywhere on the pad to move.</p>
    <div class="label">Scores</div>${scoreList()}
    ${Object.entries(GAMES).map(([k,g]) => `<div class="stack"><button class="primary wide" data-play="${k}" ${ready ? "" : "disabled"}>Play ${esc(g.title)}</button><p class="small muted">${esc(g.rules)}</p></div>`).join("")}
    <div class="row"><button data-a="zero">Reset party scores</button><button data-a="exit">Back to the drawing game</button></div></div>`;
}
function render() { $("ui").innerHTML = view() }

document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.play) return begin(b.dataset.play);
  if (b.dataset.a === "zero") { M = {...M, scores:{}, last:null, phase:"lobby"}; save(); render() }
  if (b.dataset.a === "exit") exit();
});
/* works from any screen, even mid-round; phones go back to the drawing game */
function exit() {
  const back = () => location.href = "host.html" + location.search;
  if (conn !== "on") return back();
  S = null; M = {...M, on:false, phase:"lobby"};
  Promise.race([set(metaRef, M), new Promise(r => setTimeout(r, 2000))]).finally(back); // don't hang if offline
}

/* ---------- connect ---------- */
render(); requestAnimationFrame(frame);
if (configured) onAuthStateChanged(auth, async u => {
  if (!u || u.isAnonymous) { conn = "login"; render(); return }
  try {
    const old = (await get(metaRef)).val();
    M = {on:true, phase:"lobby", scores:old?.scores || {}};
    await set(metaRef, M);
    onDisconnect(ref(rtdb, "party/meta/on")).set(false); // closing this screen hands the phones back to the drawing game
  } catch (e) { conn = "denied"; render(); return }
  conn = "on"; render();
  onSnapshot(col("players"), s => { players = s.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (a.joined?.seconds ?? 9e9) - (b.joined?.seconds ?? 9e9)); if (M.phase !== "play") render() });
  onValue(ref(rtdb, "party/in"), s => { const had = Object.keys(inputs).length; inputs = s.val() || {}; if (M.phase !== "play" && M.phase !== "countdown" && Object.keys(inputs).length !== had) render() });
});
