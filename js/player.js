import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { onSnapshot, setDoc, updateDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { configured, auth, gameRef, col, sub, ROUNDS, STATE_V, blank, $, esc, clone, ls, leftNow, pname, options, fmt, totals,
  label, setFlashRender, flash, header, progress, clockHTML, resultsList, finalList, renderInto, chime, playClip, loadClip, player, stop, notConfigured } from "./common.js";

let G = blank(), players = [], task = null, restored = null, uid = null, conn = "connecting";
let name = ls("fidi-name") || "", editing = false, firstPlayers = true;
let mine = {r:null, g:{}, pick:null};
const amIn = () => players.some(p => p.id === uid);
const myTask = () => task && task.r === G.round ? task.k : null;

/* ---------- writes ---------- */
async function join(n) {
  name = n; ls("fidi-name", n); editing = false; render();
  try { await setDoc(sub("players", uid), {n, joined:serverTimestamp(), seen:serverTimestamp()}, {merge:true}) }
  catch (e) { flash("Couldn't join. Check your connection.") }
}
function heartbeat() { if (uid && amIn()) updateDoc(sub("players", uid), {seen:serverTimestamp()}).catch(() => {}) }
setInterval(heartbeat, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) heartbeat() });

function syncMine() {
  if (mine.r === G.round) return;
  mine = restored && restored.r === G.round ? {r:G.round, g:restored.g || {}, pick:restored.pick ?? null} : {r:G.round, g:{}, pick:null};
}
function saveMine() { setDoc(sub("private", uid), clone(mine)).catch(() => flash("Couldn't save your answer. Check your connection.")) }

/* ---------- views ---------- */
function view() {
  if (!configured) return notConfigured;
  if (conn === "connecting") return `<div class="card"><p class="muted">Connecting…</p></div>`;
  if (conn === "off") return `<div class="card"><h2>Can't connect</h2><p class="muted">Check your internet connection and reload.</p></div>`;
  if (!name || editing || !amIn()) return nameForm();
  syncMine();
  const r = G.round, ph = G.phase;
  if (ph === "lobby") return `<div class="card hero"><div class="label">You're in</div><div class="big">${esc(name)}</div><p>Waiting for everyone.</p></div>
    <div class="card"><div class="label">Here so far</div><p>${players.map(p => esc(p.n)).join(", ")}</p>
    <button class="mini ghost" data-a="rename">Change name</button></div>`;
  if (ph === "end") return `<div class="card hero">${winnerHTML()}</div><div class="card">${finalList(G)}</div>`;
  const k = ROUNDS[r].key, t = myTask();
  let body = "";
  if (ph === "listen") {
    body = k === "clips"
      ? `<div class="card hero"><div class="label">Round ${r+1}</div><div class="big">Listen together</div><p>Three clips. One will be yours.</p></div>
        <div class="card"><ol class="list">${G.cfg.clips.map((c,i) => `<li><span class="score">${i+1}</span><span class="grow">Clip ${i+1}</span></li>`).join("")}</ol></div>`
      : `<div class="card hero"><div class="label">Round ${r+1}</div><div class="big">Listen to the reading</div><p>Take it in. Your drawing angle comes next.</p></div>`;
  }
  if (ph === "make") {
    let title = "", extra = "";
    if (k === "clips") { const c = t == null ? null : G.cfg.clips[+t]; title = c ? `Clip ${+t+1}` : "Waiting for your clip"; if (c) loadClip(c).catch(() => {}); extra = c ? `${c.id ? `<button data-play="${t}">${player.playing === "me" ? "Stop" : "Play my clip"}</button><p class="small">It loops while you draw. Headphones help.</p>` : ""}` : "" }
    if (k === "wake") title = t == null ? "Waiting for your angle" : `Draw ${esc((G.cfg.angles[+t] || "").replace(/^./, c => c.toLowerCase()))}`;
    if (k === "feel") { title = "Make a feeling"; extra = `<p>From today or this week. No faces, no words.</p>` }
    if (k === "portrait") { title = t == null ? "Waiting for your person" : `Draw ${esc(pname(players, t))}`; extra = t == null ? "" : "<p>As a feeling, not a face.</p>" }
    body = `<div class="card hero"><div class="label">Your secret · Round ${r+1}</div><div class="big">${title}</div>${extra}</div><div class="card">${clockHTML(G)}</div>`;
    if (k === "feel") body += `<div class="card"><div class="label">Pick yours (secret)</div><div class="chips">${options(G, players, r).map(o => `<button class="chip" data-pick="${o.k}" aria-pressed="${String(mine.pick) === o.k}">${esc(o.l)}</button>`).join("")}</div></div>`;
  }
  if (ph === "guess") {
    const others = players.filter(p => p.id !== uid), opts = options(G, players, r);
    const done = others.filter(p => mine.g[p.id] != null).length;
    body = `<div class="card"><div class="row between"><h2>${{clips:"Which clip?",wake:"Which angle?",feel:"Which feeling?",portrait:"Who is it?"}[k]}</h2><span class="muted small">${done}/${others.length}</span></div>
      <p class="muted small">Look at each piece, then pick.</p>
      <div>${others.map(p => `<div class="guess"><b>${esc(p.n)}</b><div class="chips">${opts.filter(o => !(k === "portrait" && o.k === p.id)).map(o => `<button class="chip" data-guess="${p.id}" data-k="${o.k}" aria-pressed="${String(mine.g[p.id]) === o.k}">${esc(o.l)}</button>`).join("")}</div></div>`).join("") || `<p class="muted">No one else is playing.</p>`}</div></div>`;
  }
  if (ph === "results") body = myGuessesHTML(r) + `<div class="card"><h2>${esc(ROUNDS[r].title)}: answers</h2>${resultsList(G)}</div>`;
  return progress(G) + body;
}
/* the player's own guesses this round, checked against the revealed answers */
function myGuessesHTML(r) {
  const rows = (G.results[r]?.rows || []).filter(row => row.id !== uid); if (!rows.length) return "";
  const right = rows.filter(row => mine.g[row.id] != null && label(G, players, r, mine.g[row.id]) === row.a);
  const wrong = rows.filter(row => !right.includes(row));
  return `<div class="card hero"><div class="label">Your guesses</div><div class="big">${right.length} of ${rows.length} right</div>
    ${right.length ? `<p>Got: ${right.map(row => esc(row.n)).join(", ")}</p>` : ""}
    ${wrong.length ? `<p class="small">Missed: ${wrong.map(row => `${esc(row.n)} (${mine.g[row.id] == null ? "no guess" : "you said " + esc(label(G, players, r, mine.g[row.id]))})`).join(", ")}</p>` : ""}</div>`;
}
function winnerHTML() {
  const t = totals(G), top = t.filter(p => p.pts === t[0]?.pts);
  return `<div class="label">${top.length > 1 ? "Winners" : "Winner"}</div><div class="big">${esc(top.map(p => p.n).join(" & ") || "—")}</div>`;
}
function nameForm() {
  return `<div class="card hero"><div class="big">What's your name?</div></div>
   <form class="card" id="nameform"><input id="nm" maxlength="24" autocomplete="given-name" placeholder="Your name" value="${esc(name)}" aria-label="Your name"><button class="primary wide" type="submit">Join</button></form>`;
}
function render() { renderInto($("app"), header() + view(), id => id === "nm") }
setFlashRender(render); player.onChange = render;

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.play != null) { playClip(G.cfg.clips[+b.dataset.play], "me", true); return }
  if (b.dataset.guess) { mine.g[b.dataset.guess] = b.dataset.k; saveMine(); render(); return }
  if (b.dataset.pick != null) { mine.pick = b.dataset.pick; saveMine(); render(); return }
  if (b.dataset.a === "rename") { editing = true; render() }
});
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "nameform") { const n = $("nm").value.trim().slice(0, 24); if (n) join(n) }
});

/* ---------- ticking ---------- */
let lastLeft = null;
setInterval(() => {
  const l = leftNow(G), c = $("clock");
  if (c) { c.textContent = fmt(l); c.classList.toggle("done", l === 0) }
  if (G.phase === "make" && G.timer.running && l === 0 && lastLeft > 0) chime();
  if (player.playing === "me" && (G.phase !== "make" || l === 0)) stop();
  lastLeft = l;
}, 500);

/* ---------- connect ---------- */
render();
if (configured) onAuthStateChanged(auth, async u => {
  if (!u) { signInAnonymously(auth).catch(() => { conn = "off"; render() }); return }
  if (uid === u.uid) return;
  uid = u.uid;
  const fail = () => { conn = "off"; render() };
  onSnapshot(gameRef, s => { const x = s.exists() ? s.data() : null; G = x && x.v === STATE_V ? {...blank(), ...x} : blank(); conn = "on"; render() }, fail);
  onSnapshot(col("players"), s => {
    players = s.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (a.joined?.seconds ?? 9e9) - (b.joined?.seconds ?? 9e9));
    // coming back on the same device rejoins automatically; after that, being removed by the host shows the name form
    if (firstPlayers && name && !amIn()) join(name);
    firstPlayers = false; render();
  }, fail);
  onSnapshot(sub("tasks", uid), s => { task = s.exists() ? s.data() : null; render() }, () => {});
  try { const p = await getDoc(sub("private", uid)); restored = p.exists() ? p.data() : null; mine.r = null; render() } catch (e) {}
});
