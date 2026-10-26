import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { onSnapshot, setDoc, writeBatch, getDocs, Bytes } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { configured, auth, db, gameRef, col, sub, ROUNDS, LIMITS, CLIP_SECS, STATE_V, blank, $, esc, fmt, clone, ls, leftNow, options, label,
  totals, setFlashRender, flash, header, progress, clockHTML, resultsList, finalList, renderInto, chime, play, playClip, loadClip, player, notConfigured } from "./common.js";

let G = blank(), players = [], tasks = {}, privs = {}, conn = "connecting", user = null, loaded = {game:false, players:false, tasks:false};
let confirmReset = false;
const unsubs = [];

/* ---------- derived ---------- */
const R = () => ROUNDS[G.round];
const currentDeal = () => Object.fromEntries(Object.entries(tasks).filter(([,t]) => t.r === G.round).map(([pid,t]) => [pid, t.k]));
const guessesOf = (pid, r) => privs[pid]?.r === r ? privs[pid].g || {} : {};
const online = p => p.seen && p.seen.toMillis() > Date.now() - 75000;

/* ---------- writes ---------- */
async function commit(g) {
  G = g; render();
  try { await setDoc(gameRef, g) } catch (e) { flash("Couldn't save. Check your connection.") }
}
/* writes the game doc plus some task docs in one go; keeps wakeOpts in step with the deal */
async function commitWithTasks(g, deal, changed = Object.keys(deal)) {
  g.wakeOpts = ROUNDS[g.round]?.key === "wake" ? [...new Set(Object.values(deal))].sort((a,b) => a - b) : [];
  const b = writeBatch(db);
  b.set(gameRef, g);
  changed.forEach(pid => { b.set(sub("tasks", pid), {r:g.round, k:deal[pid]}); pending.add(pid) });
  G = g; render();
  try { await b.commit() } catch (e) { flash("Couldn't save. Check your connection.") }
}

/* ---------- dealing and scoring ---------- */
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]] } return a }
function makeDeal(g) {
  const k = ROUNDS[g.round].key, ps = shuffle(players.map(p => p.id)), deal = {};
  if (k === "clips") ps.forEach((id,i) => deal[id] = String(i % 3));
  if (k === "wake") { const ang = shuffle(g.cfg.angles.map((_,i) => i)); ps.forEach((id,i) => deal[id] = String(ang[i % ang.length])) }
  if (k === "portrait" && ps.length > 1) ps.forEach((id,i) => deal[id] = ps[(i+1) % ps.length]);
  return deal;
}
function pickOne(g, deal, pid) {
  const k = ROUNDS[g.round].key;
  if (k === "clips") return String(Math.floor(Math.random()*3));
  if (k === "wake") { const used = new Set(Object.values(deal)); return g.cfg.angles.map((_,i) => String(i)).find(i => !used.has(i)) || "0" }
  if (k === "portrait") { const others = players.filter(p => p.id !== pid); return others.length ? others[Math.floor(Math.random()*others.length)].id : null }
  return null;
}
/* people who join mid-round get a task too. Runs only when the player list changes: a new round's game doc
   can arrive before its task docs, and dealing then would give everyone a second task. */
const pending = new Set();
function dealLate() {
  if (!loaded.players || !loaded.tasks || G.round < 0 || !["listen","make","guess"].includes(G.phase) || R().key === "feel") return;
  const deal = currentDeal(), add = [];
  players.forEach(p => { if (deal[p.id] != null || pending.has(p.id)) return; const v = pickOne(G, deal, p.id); if (v != null) { deal[p.id] = v; add.push(p.id); pending.add(p.id) } });
  if (add.length) commitWithTasks(clone(G), deal, add);
}
function score(g) {
  const r = g.round, k = ROUNDS[r].key, deal = currentDeal();
  const ans = pid => k === "feel" ? (privs[pid]?.r === r ? privs[pid].pick : null) : deal[pid];
  const got = {}, pts = {};
  players.forEach(p => { pts[p.id] = 0 });
  players.forEach(p => {
    const a = ans(p.id);
    got[p.id] = a == null ? [] : players.filter(q => q.id !== p.id && String(guessesOf(q.id, r)[p.id]) === String(a)).map(q => q.id);
    got[p.id].forEach(q => pts[q]++); pts[p.id] += got[p.id].length;
  });
  g.results = {...g.results, [r]: {rows: players.map(p => ({id:p.id, n:p.n, a:ans(p.id) == null ? "—" : label(g, players, r, ans(p.id)),
    got:got[p.id].map(q => players.find(x => x.id === q).n), pts:pts[p.id]}))}};
}
const newLimit = old => { const o = LIMITS.filter(l => l !== old); return o[Math.floor(Math.random()*o.length)] };
function advance() {
  const g = clone(G);
  if (g.phase === "lobby" || g.phase === "results") {
    if (g.round >= ROUNDS.length - 1) { g.phase = "end"; return commit(g) }
    g.round++; g.phase = ROUNDS[g.round].phases[0];
    g.timer = {endsAt:0, left:ROUNDS[g.round].mins*60, running:false};
    g.limit = newLimit(g.limit);
    return commitWithTasks(g, makeDeal(g));
  }
  const ph = ROUNDS[g.round].phases; g.phase = ph[ph.indexOf(g.phase) + 1];
  if (g.phase === "make") { const s = g.timer.left || ROUNDS[g.round].mins*60; g.timer = {endsAt:Date.now() + s*1000, left:s, running:true} }
  else g.timer = {endsAt:0, left:g.timer.left, running:false};
  if (g.phase === "results") score(g);
  commit(g);
}
async function removePlayer(pid) {
  const b = writeBatch(db);
  ["players","tasks","private"].forEach(c => b.delete(sub(c, pid)));
  try { await b.commit() } catch (e) { flash("Couldn't remove them.") }
}
async function resetGame() {
  const n = blank(); n.cfg = G.cfg;
  try {
    const b = writeBatch(db);
    for (const c of ["tasks","private"]) (await getDocs(col(c))).forEach(d => b.delete(d.ref));
    b.set(gameRef, n); await b.commit();
  } catch (e) { flash("Couldn't reset. Check your connection.") }
}

/* ---------- clips: cut CLIP_SECS from a song file, mono WAV, stored in Firestore in parts ---------- */
const draft = [{},{},{}];
async function cutClip(file, start) {
  const buf = await file.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const song = await new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej));
  ctx.close();
  const rate = 24000, s0 = Math.min(Math.max(0, start), Math.max(0, song.duration - CLIP_SECS)), secs = Math.min(CLIP_SECS, song.duration - s0);
  const off = new OfflineAudioContext(1, Math.floor(secs*rate), rate);
  const src = off.createBufferSource(), gain = off.createGain();
  src.buffer = song; src.connect(gain).connect(off.destination);
  gain.gain.setValueAtTime(1, Math.max(0, secs - 0.6)); gain.gain.linearRampToValueAtTime(0, secs);
  src.start(0, s0, secs);
  return wav((await off.startRendering()).getChannelData(0), rate);
}
function wav(samples, rate) {
  const v = new DataView(new ArrayBuffer(44 + samples.length*2)), str = (o, s) => [...s].forEach((c,i) => v.setUint8(o+i, c.charCodeAt(0)));
  str(0,"RIFF"); v.setUint32(4, 36 + samples.length*2, true); str(8,"WAVEfmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); str(36,"data"); v.setUint32(40, samples.length*2, true);
  samples.forEach((s,i) => v.setInt16(44 + i*2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([v], {type:"audio/wav"});
}
function readDraft(i) { const d = draft[i]; d.name = $("cn"+i).value.trim(); d.start = +$("cs"+i).value || 0; return d }
async function previewClip(i) {
  const d = readDraft(i); if (!d.file) return;
  try { if (d.url) URL.revokeObjectURL(d.url); d.url = URL.createObjectURL(await cutClip(d.file, d.start)); play(d.url, "d"+i) }
  catch (e) { flash("Couldn't read that file. Try an mp3 or m4a.") }
}
const PART = 900000; // bytes per Firestore doc, under the 1 MiB limit
async function saveClip(i) {
  const d = readDraft(i); if (!d.file) { flash("Choose a song file first."); return }
  d.busy = true; render();
  let bytes;
  try { bytes = new Uint8Array(await (await cutClip(d.file, d.start)).arrayBuffer()) }
  catch (e) { d.busy = false; render(); flash("Couldn't read that file. Try an mp3 or m4a."); return }
  const old = G.cfg.clips[i], id = `c${i+1}-${Date.now().toString(36)}`, parts = Math.ceil(bytes.length / PART);
  const g = clone(G); g.cfg.clips[i] = {name:(d.name || d.file.name.replace(/\.[^.]+$/, "")).slice(0, 40), id, parts};
  const b = writeBatch(db);
  for (let n = 0; n < parts; n++) b.set(sub("clips", `${id}-${n}`), {data:Bytes.fromUint8Array(bytes.subarray(n*PART, (n+1)*PART))});
  for (let n = 0; n < (old.parts || 0); n++) b.delete(sub("clips", `${old.id}-${n}`));
  b.set(gameRef, g);
  try { await b.commit(); draft[i] = {}; $("cn"+i).value = g.cfg.clips[i].name; render(); flash(`Clip ${i+1} saved.`) }
  catch (e) { d.busy = false; render(); flash("Couldn't save the clip. Check your connection.") }
}

/* ---------- views ---------- */
const PHASE_NAME = {lobby:"Lobby",listen:"Listen",make:"Make",guess:"Guess",results:"Answers",end:"Final scores"};
function nextLabel() {
  if (G.phase === "lobby") return "Start round 1";
  if (G.phase === "listen") return "Start making";
  if (G.phase === "make") return "End timer and guess";
  if (G.phase === "guess") return "Show answers";
  if (G.phase === "results") return G.round >= ROUNDS.length - 1 ? "Final scores" : `Start round ${G.round+2}`;
  return "";
}
function loginView() {
  return `<div class="card hero"><div class="label">Host</div><div class="big">Sign in to run the game</div></div>
    <form class="card" id="loginform">
      <input id="em" type="email" autocomplete="username" placeholder="Email" value="${esc(ls("fidi-host-email") || "")}" aria-label="Email">
      <input id="pw" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password">
      <button class="primary wide" type="submit">Sign in</button></form>`;
}
function hostView() {
  const r = G.round, k = R()?.key, deal = currentDeal();
  let now = `<div class="card"><div><div class="label">${r < 0 ? "Before the game" : `Round ${r+1} · ${PHASE_NAME[G.phase]}`}</div><h2>${r < 0 ? "Waiting for players" : esc(G.phase === "end" ? "Game over" : R().title)}</h2></div>`;
  if (G.phase === "listen" && k === "clips") now += `<div class="stack">${G.cfg.clips.map((c,i) => `<button data-play="${i}" ${c.id ? "" : "disabled"}>${player.playing === "h"+i ? "Stop" : "Play"} clip ${i+1}</button>`).join("")}</div>${G.cfg.clips.some(c => !c.id) ? `<p class="small muted">Add the missing clips under Setup.</p>` : ""}`;
  if (G.phase === "listen" && k === "wake") now += `<a href="https://www.youtube.com/results?search_query=James+Joyce+reads+Anna+Livia+Plurabelle+1929" target="_blank" rel="noopener">Joyce reading Anna Livia Plurabelle ↗</a>`;
  if (G.phase === "listen" || G.phase === "make") now += `<div class="row between"><span><span class="label">Limit</span> ${G.limit ? esc(G.limit) : "None"}</span><span class="row"><button class="mini" data-a="limit">New limit</button>${G.limit ? `<button class="mini ghost" data-a="nolimit">No limit</button>` : ""}</span></div>`;
  if (G.phase === "make") now += clockHTML(G) + `<div class="row" style="justify-content:center"><button data-a="pause">${G.timer.running ? "Pause" : "Resume"}</button><button data-a="m1" aria-label="One minute less">−1 min</button><button data-a="p1" aria-label="One minute more">+1 min</button></div>`;
  if (G.phase === "listen" || G.phase === "lobby") now += `<div class="row"><span class="muted small">Drawing time</span><button class="mini" data-a="m1">−1</button><b>${fmt(G.timer.left)}</b><button class="mini" data-a="p1">+1</button></div>`;
  if (G.phase === "guess") { const n = players.filter(p => Object.keys(guessesOf(p.id, r)).length >= players.length - 1).length; now += `<p class="muted">${n} of ${players.length} have finished guessing.</p>` }
  if (G.phase === "results") now += resultsList(G);
  if (G.phase === "lobby" || G.phase === "end") now += `<a href="party.html${esc(location.search)}">Party mode: live minigames on this screen ↗</a>`;
  if (G.phase === "end") now += finalList(G);
  else now += `<button class="primary wide" data-a="next" ${G.phase === "lobby" && players.length < 2 ? "disabled" : ""}>${nextLabel()}</button>`;
  now += `</div>`;

  const link = new URL("./", location.href).href, t = Object.fromEntries(totals(G).map(x => [x.id, x.pts]));
  const roster = `<div class="card"><div class="label">Player link</div><div class="share"><code>${esc(link)}</code><button class="mini" data-a="copy">Copy</button></div>
    <div class="row between"><div class="label">Players</div><span class="small muted">${players.length}</span></div>
    <ul class="list">${players.map(p => `<li><span class="dot ${online(p) ? "on" : ""}" title="${online(p) ? "Online" : "Offline"}"></span><span class="grow">${esc(p.n)}</span><span class="score">${t[p.id] || 0}</span><button class="mini ghost" data-del="${p.id}" aria-label="Remove ${esc(p.n)}">✕</button></li>`).join("") || `<li class="muted">Share the link. Names appear here as people join.</li>`}</ul></div>`;

  let secrets = "";
  if (r >= 0 && G.phase !== "end") {
    const all = k === "wake" ? G.cfg.angles.map((a,i) => ({k:String(i), l:a})) : options(G, players, r);
    secrets = `<div class="card"><details><summary>Secret tasks</summary>
      ${k === "feel" ? `<p class="small muted">Each person picks their own feeling.</p><ul class="list">${players.map(p => { const pk = privs[p.id]?.r === r ? privs[p.id].pick : null; return `<li><span class="grow">${esc(p.n)}</span><span>${pk != null ? esc(label(G, players, r, pk)) : "not picked"}</span></li>` }).join("")}</ul>`
      : `<ul class="list">${players.map(p => `<li><span class="grow">${esc(p.n)}</span><select class="mini-sel" data-deal="${p.id}" aria-label="Task for ${esc(p.n)}">${deal[p.id] == null ? `<option value="">—</option>` : ""}${all.filter(o => !(k === "portrait" && o.k === p.id)).map(o => `<option value="${o.k}" ${String(deal[p.id]) === o.k ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select></li>`).join("")}</ul>
      <button data-a="redeal">Shuffle again</button>`}</details></div>`;
  }

  const setup = `<div class="card"><details ${G.cfg.clips.some(c => !c.id) ? "open" : ""}><summary>Setup</summary><div class="stack">
    <div class="label">Your three clips (${CLIP_SECS}s each)</div>
    ${G.cfg.clips.map((c,i) => { const d = draft[i]; return `<div class="slot">
      <div class="row between"><b>Clip ${i+1}</b>${c.id ? `<button class="mini" data-play="${i}">${player.playing === "h"+i ? "Stop" : "Play saved"}</button>` : `<span class="small muted">Empty</span>`}</div>
      <input id="cn${i}" placeholder="Song name" value="${esc(d.name ?? c.name)}" maxlength="40" aria-label="Clip ${i+1} name">
      <input id="cf${i}" type="file" accept="audio/*,video/*" aria-label="Song file for clip ${i+1}">
      <div class="row"><label for="cs${i}" class="small muted">Start at (seconds)</label><input id="cs${i}" type="number" min="0" step="1" value="${d.start || 0}" style="width:6em"></div>
      <div class="row">${d.busy ? `<button disabled>Saving…</button>` : `<button data-preview="${i}" ${d.file ? "" : "disabled"}>${player.playing === "d"+i ? "Stop" : "Preview"}</button><button class="primary" data-save="${i}" ${d.file ? "" : "disabled"}>Save clip</button>`}</div>
    </div>` }).join("")}
    <label class="label" for="angles">Wake angles (one per line)</label>
    <textarea id="angles">${esc(G.cfg.angles.join("\n"))}</textarea>
    <label class="label" for="feelings">Feelings (one per line)</label>
    <textarea id="feelings">${esc(G.cfg.feelings.join("\n"))}</textarea>
    <button data-a="savelists">Save names and lists</button>
    <div class="row">${confirmReset ? `<span class="small">Erase scores and start over?</span><button class="mini" data-a="resetyes">Yes, reset</button><button class="mini ghost" data-a="resetno">Cancel</button>` : `<button class="ghost" data-a="reset">Reset game</button>`}</div>
  </div></details></div>`;
  return progress(G) + now + roster + secrets + setup;
}
function view() {
  if (!configured) return notConfigured;
  if (conn === "login") return loginView();
  if (conn === "connecting") return `<div class="card"><p class="muted">Connecting…</p></div>`;
  if (conn === "denied") return `<div class="card"><h2>Not the host account</h2><p class="muted">This account can't run the game. Check the host UID in your Firestore rules.</p></div>`;
  return hostView();
}
function render() {
  const out = user && !user.isAnonymous ? `<button class="mini ghost" data-a="signout">Sign out</button>` : "";
  renderInto($("app"), header(out) + view(), id => ["em","pw","angles","feelings"].includes(id) || /^c[ns]\d$/.test(id));
}
setFlashRender(render); player.onChange = render;

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.play != null) { const i = +b.dataset.play; playClip(G.cfg.clips[i], "h"+i); return }
  if (b.dataset.preview != null) { const i = +b.dataset.preview; player.playing === "d"+i ? play(draft[i].url, "d"+i) : previewClip(i); return }
  if (b.dataset.save != null) { saveClip(+b.dataset.save); return }
  if (b.dataset.del) { removePlayer(b.dataset.del); return }
  const a = b.dataset.a, g = clone(G), L = leftNow(G);
  if (a === "signout") { signOut(auth); return }
  if (a === "copy") { navigator.clipboard?.writeText(new URL("./", location.href).href).then(() => flash("Link copied."), () => {}); return }
  if (a === "next") return advance();
  if (a === "reset") { confirmReset = true; render(); return }
  if (a === "resetno") { confirmReset = false; render(); return }
  if (a === "resetyes") { confirmReset = false; resetGame(); return }
  if (a === "redeal") { commitWithTasks(g, makeDeal(g)); flash("Tasks shuffled."); return }
  if (a === "limit") g.limit = newLimit(g.limit);
  else if (a === "nolimit") g.limit = "";
  else if (a === "pause") g.timer = g.timer.running ? {endsAt:0, left:L, running:false} : {endsAt:Date.now() + L*1000, left:L, running:true};
  else if (a === "m1" || a === "p1") { const s = Math.max(60, L + (a === "p1" ? 60 : -60)); g.timer = g.timer.running ? {endsAt:Date.now() + s*1000, left:s, running:true} : {endsAt:0, left:s, running:false} }
  else if (a === "savelists") {
    const lines = id => $(id).value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 30);
    const ang = lines("angles"), fe = lines("feelings");
    if (ang.length) g.cfg.angles = ang; if (fe.length) g.cfg.feelings = fe;
    g.cfg.clips.forEach((c,i) => { const n = $("cn"+i).value.trim().slice(0, 40); if (c.id && n) c.name = n });
    flash("Saved.");
  } else return;
  commit(g);
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id && /^cf\d$/.test(t.id)) { const i = +t.id.slice(2), d = readDraft(i); d.file = t.files[0] || null; if (!d.name && d.file) $("cn"+i).value = d.name = d.file.name.replace(/\.[^.]+$/, ""); render() }
  if (t.dataset.deal && t.value) { const deal = currentDeal(); deal[t.dataset.deal] = t.value; commitWithTasks(clone(G), deal, [t.dataset.deal]) }
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  if (e.target.id !== "loginform") return;
  const em = $("em").value.trim(), pw = $("pw").value; if (!em || !pw) return;
  ls("fidi-host-email", em);
  try { await signInWithEmailAndPassword(auth, em, pw) }
  catch (err) { flash(err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" ? "Wrong email or password." : "Couldn't sign in. Check your connection.") }
});

/* ---------- ticking ---------- */
let lastLeft = null;
setInterval(() => {
  const l = leftNow(G), c = $("clock");
  if (c) { c.textContent = fmt(l); c.classList.toggle("done", l === 0) }
  if (G.phase === "make" && G.timer.running && l === 0 && lastLeft > 0) { chime(); advance() }
  lastLeft = l;
}, 500);
setInterval(() => { if (conn === "on") render() }, 30000); // refresh online dots

/* ---------- connect ---------- */
render();
if (configured) onAuthStateChanged(auth, u => {
  unsubs.splice(0).forEach(f => f());
  user = u; loaded = {game:false, players:false, tasks:false};
  if (!u || u.isAnonymous) { conn = "login"; render(); return }
  conn = "connecting"; render();
  const ready = () => { if (Object.values(loaded).every(Boolean)) { if (conn === "connecting") { conn = "on"; dealLate() } render() } };
  unsubs.push(
    onSnapshot(gameRef, s => {
      const x = s.exists() ? s.data() : null;
      if (x && x.v === STATE_V) G = {...blank(), ...x}; else { G = blank(); setDoc(gameRef, G).catch(() => {}) }
      G.cfg.clips.forEach(c => loadClip(c).catch(() => {}));
      loaded.game = true; ready();
    }, () => { conn = "denied"; render() }),
    onSnapshot(col("players"), s => {
      players = s.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (a.joined?.seconds ?? 9e9) - (b.joined?.seconds ?? 9e9));
      loaded.players = true; ready(); dealLate();
    }, () => { conn = "denied"; render() }),
    // only the host can list tasks, so this doubles as the "is this the host?" check
    onSnapshot(col("tasks"), s => {
      tasks = Object.fromEntries(s.docs.map(d => [d.id, d.data()]));
      Object.entries(tasks).forEach(([pid,t]) => { if (t.r === G.round) pending.delete(pid) });
      loaded.tasks = true; ready();
    }, () => { conn = "denied"; render() }),
    onSnapshot(col("private"), s => { privs = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); render() }, () => {}),
  );
});
