/* Shared by the player page (index.html), the host page (host.html) and the party screen (party.html). */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, collection, getDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { firebaseConfig, GAME_ID } from "./config.js";

// ?emu runs against local Firebase emulators (see README) instead of the real project
export const emulated = new URLSearchParams(location.search).has("emu");
export const configured = emulated || !String(firebaseConfig.apiKey).includes("REPLACE");
export const app = configured ? initializeApp(emulated ? {apiKey:"demo", projectId:"demo-fidi", databaseURL:"https://demo-fidi-default-rtdb.firebaseio.com"} : firebaseConfig) : null;
export const db = app && getFirestore(app);
export const auth = app && getAuth(app);
export const rtdb = app && getDatabase(app); // Realtime Database, only for party mode's live input
if (emulated) { connectFirestoreEmulator(db, "127.0.0.1", 8080); connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings:true}); connectDatabaseEmulator(rtdb, "127.0.0.1", 9000) }

/* Firestore layout, all under games/{GAME_ID}:
   (game doc)     public game state, host writes
   players/{uid}  name + last seen, public, each player writes their own
   private/{uid}  a player's guesses and feeling pick, only that player and the host can read
   tasks/{uid}    a player's secret task for the round, only that player and the host can read
   clips/{id}-{n} part n of a song clip (WAV bytes split to fit Firestore's 1 MiB doc limit), public, host writes
   Party mode uses the Realtime Database instead, under party/:
   meta           on, phase, game, scores and last placings, public, host writes
   status/{uid}   "out" once a player is knocked out, public, host writes
   in/{uid}       a player's joystick {x,y}, only the host reads, each player writes their own */
export const gameRef = db && doc(db, "games", GAME_ID);
export const col = name => collection(db, "games", GAME_ID, name);
export const sub = (name, id) => doc(db, "games", GAME_ID, name, id);

/* ---------- content ---------- */
export const DEFAULT_ANGLES = ["The place where it happens","The main character","The sound of the words, as shapes","The weather","What happens next","It as a map","The colour of the voice","The river"];
/* each round, everyone draws under one of these limits */
export const LIMITS = ["Only circles","Only straight lines","Only triangles","Only dots","One continuous line: never lift your pen","Only squares and rectangles","Only wavy lines","With your other hand"];
export const DEFAULT_FEELINGS = ["Joy","Calm","Worry","Frustration","Tired","Excited","Sad","Love","Proud","Bored","Restless","Hopeful"];
export const ROUNDS = [
  {key:"clips",title:"Guess the Clip",phases:["listen","make","guess","results"],mins:5},
  {key:"wake",title:"Wake Drawings",phases:["listen","make","guess","results"],mins:5},
  {key:"portrait",title:"Secret Portrait",phases:["make","guess","results"],mins:5},
  {key:"feel",title:"Feelings",phases:["make","guess","results"],mins:5}, // last, so nobody has seen anyone's feelings before drawing them
];
export const CLIP_SECS = 30;
export const STATE_V = 4;

/* results[r] = {rows:[{id,n,a,got:[names],pts}]}, written by the host when a round is scored,
   so answers are only public once revealed. */
export const blank = () => ({v:STATE_V, round:-1, phase:"lobby", timer:{endsAt:0,left:300,running:false}, wakeOpts:[], results:{}, limit:"",
  cfg:{clips:[0,1,2].map(()=>({name:"",id:"",parts:0})), angles:DEFAULT_ANGLES.slice(), feelings:DEFAULT_FEELINGS.slice()}});

/* party mode: each player's colour, by join order */
export const COLORS = ["#e8453c","#2f8fe0","#f2b705","#2bb673","#a05ce6","#ff7a1a","#14b8c4","#e64b9b"];
export const colorOf = (players, id) => COLORS[Math.max(0, players.findIndex(p => p.id === id)) % COLORS.length];
export const ordinal = n => n + (["th","st","nd","rd"][(n % 100 - 20) % 10] || ["th","st","nd","rd"][n % 100] || "th");

/* ---------- helpers ---------- */
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
export const clone = o => JSON.parse(JSON.stringify(o));
export const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (e) { return null } };
export const leftNow = G => G.timer.running ? Math.max(0, Math.round((G.timer.endsAt - Date.now())/1000)) : G.timer.left;
export const pname = (players, pid) => (players.find(p => p.id === pid) || {}).n || "Someone";

/* guess options for round r; portrait options are the players themselves */
export function options(G, players, r) {
  const k = ROUNDS[r].key;
  if (k === "clips") return G.cfg.clips.map((c,i) => ({k:String(i), l:`Clip ${i+1}`}));
  if (k === "wake") return (G.wakeOpts || []).map(i => ({k:String(i), l:G.cfg.angles[+i] || "?"}));
  if (k === "feel") return G.cfg.feelings.map((f,i) => ({k:String(i), l:f}));
  if (k === "portrait") return players.map(p => ({k:p.id, l:p.n}));
  return [];
}
export function label(G, players, r, key) { const o = options(G, players, r).find(o => o.k === String(key)); return o ? o.l : "—" }

export function totals(G) {
  const t = {};
  Object.values(G.results || {}).forEach(res => (res.rows || []).forEach(row => {
    t[row.id] = t[row.id] || {id:row.id, n:row.n, pts:0}; t[row.id].n = row.n; t[row.id].pts += row.pts || 0;
  }));
  return Object.values(t).sort((a,b) => b.pts - a.pts);
}

/* ---------- shared views ---------- */
let msg = "", msgT, onFlash = () => {};
export function setFlashRender(fn) { onFlash = fn }
export function flash(m) { msg = m; clearTimeout(msgT); msgT = setTimeout(() => { msg = ""; onFlash() }, 3500); onFlash() }

export function header(extra = "") {
  return `<div class="top"><div class="brand">Feel It, <span>Draw It</span></div>${extra}</div>
    ${msg ? `<div class="banner" role="status">${esc(msg)}</div>` : ""}`;
}
export function progress(G) {
  if (G.round < 0) return "";
  return `<div class="steps" aria-label="Round ${G.round+1} of ${ROUNDS.length}">${ROUNDS.map((_,i) => `<i class="${i <= G.round ? "on" : ""}"></i>`).join("")}</div>`;
}
export function clockHTML(G) { const l = leftNow(G); return `<div class="clock${l === 0 ? " done" : ""}" id="clock">${fmt(l)}</div>` }

export function resultsList(G) {
  const res = G.results[G.round]; if (!res) return `<p class="muted">Scoring…</p>`;
  return `<ul class="list">${res.rows.map(row => `<li><div class="grow"><b>${esc(row.n)}</b> · ${esc(row.a)}
    <div class="small muted">${row.got.length ? "Got it: " + row.got.map(esc).join(", ") : "Nobody got it"}</div></div><span class="score">+${row.pts}</span></li>`).join("")}</ul>`;
}
export function finalList(G) {
  return `<ul class="list">${totals(G).map(p => `<li><span class="grow">${esc(p.n)}</span><span class="score">${p.pts}</span></li>`).join("")}</ul>`;
}

/* re-render without losing what someone is typing */
export function renderInto(el, html, keepIds) {
  const a = document.activeElement, keep = a && a.id && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") ? {id:a.id, s:a.selectionStart, e:a.selectionEnd} : null;
  const vals = {}; document.querySelectorAll("input[id]:not([type=file]),textarea[id]").forEach(x => vals[x.id] = x.value);
  el.innerHTML = html;
  Object.entries(vals).forEach(([id,v]) => { const x = $(id); if (x && keepIds(id)) x.value = v });
  if (keep) { const x = $(keep.id); if (x) { x.focus(); try { x.setSelectionRange(keep.s, keep.e) } catch (e) {} } }
}

/* ---------- sound ---------- */
let ac = null;
export function chime() { try { ac = ac || new (window.AudioContext||window.webkitAudioContext)(); [523.25,659.25,783.99].forEach((f,i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; const t = ac.currentTime + i*.22; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.25,t+.02); g.gain.exponentialRampToValueAtTime(.001,t+1.2); o.connect(g).connect(ac.destination); o.start(t); o.stop(t+1.3) }) } catch (e) {} }
document.addEventListener("pointerdown", () => { try { ac = ac || new (window.AudioContext||window.webkitAudioContext)() } catch (e) {} }, {once:true});

/* clips are fetched once and kept as blob URLs; preload them early so a tap can play straight away */
const clipUrls = {}, clipLoads = {};
export function loadClip(c) {
  if (!c?.id) return Promise.resolve(null);
  return clipLoads[c.id] ||= Promise.all([...Array(c.parts).keys()].map(n => getDoc(sub("clips", `${c.id}-${n}`))))
    .then(ds => clipUrls[c.id] = URL.createObjectURL(new Blob(ds.map(d => d.data().data.toUint8Array()), {type:"audio/wav"})))
    .catch(e => { delete clipLoads[c.id]; throw e });
}
export function playClip(c, key, loop = false) {
  if (player.playing === key || clipUrls[c?.id]) return play(clipUrls[c?.id], key, loop);
  loadClip(c).then(url => play(url, key, loop), () => flash("Couldn't load that clip. Check your connection."));
}

/* one shared audio element; play(url, key) toggles, loop repeats until stopped */
const audio = new Audio();
export const player = {playing:null, onChange:() => {}};
audio.addEventListener("ended", () => { player.playing = null; player.onChange() });
audio.addEventListener("timeupdate", () => { if (player.playing && !audio.loop && audio.currentTime >= CLIP_SECS + 0.5) { audio.pause(); player.playing = null; player.onChange() } });
export function stop() { if (player.playing) { audio.pause(); player.playing = null; player.onChange() } }
export function play(url, key, loop = false) {
  if (player.playing === key) { stop(); return }
  if (!url) return;
  audio.src = url; audio.currentTime = 0; audio.loop = loop;
  audio.play().then(() => { player.playing = key; player.onChange() }).catch(() => flash("This clip won't play on this device."));
}

export const notConfigured = `<div class="card"><h2>Almost there</h2><p class="muted">Add your Firebase config to <code>js/config.js</code> to start.</p></div>`;
