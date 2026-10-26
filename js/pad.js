/* Party mode on the phone: a joystick overlay that sends its direction to the party screen (party.html).
   It keeps its own DOM, outside #app, so the player page's re-renders never interrupt a drag. */
import { ref, set, remove, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { rtdb, colorOf, ordinal } from "./common.js";

const R = 70; // joystick radius in px
let uid = null, info = () => ({players:[], joined:false}), meta = null, status = {}, vec = {x:0, y:0}, sent = "", el = null, origin = null;

export function startPad(id, getInfo) {
  uid = id; info = getInfo;
  el = document.createElement("div");
  el.className = "pad"; el.hidden = true;
  el.innerHTML = `<div class="pad-top"><span class="pad-dot"></span><b class="pad-name"></b><span class="pad-pts"></span></div>
    <div class="pad-msg" role="status"></div><div class="pad-area"><div class="pad-base"><div class="pad-knob"></div></div></div>`;
  document.body.append(el);
  const area = el.querySelector(".pad-area");
  area.addEventListener("pointerdown", e => { area.setPointerCapture(e.pointerId); origin = {x:e.clientX, y:e.clientY}; move(e) });
  area.addEventListener("pointermove", e => { if (origin) move(e) });
  const end = () => { origin = null; vec = {x:0, y:0}; knob() };
  area.addEventListener("pointerup", end); area.addEventListener("pointercancel", end);
  onValue(ref(rtdb, "party/meta"), s => { meta = s.val(); update() }, () => {});
  onValue(ref(rtdb, "party/status"), s => { status = s.val() || {}; update() }, () => {});
  setInterval(send, 50);
}
export const padShown = () => !!el && !el.hidden;

function move(e) {
  let dx = e.clientX - origin.x, dy = e.clientY - origin.y; const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R/d; dy *= R/d }
  vec = {x:Math.round(dx/R*20)/20, y:Math.round(dy/R*20)/20}; knob();
}
function knob() {
  const base = el.querySelector(".pad-base"), a = base.parentElement.getBoundingClientRect();
  base.style.left = origin ? `${origin.x - a.left}px` : ""; base.style.top = origin ? `${origin.y - a.top}px` : "";
  el.querySelector(".pad-knob").style.transform = `translate(${vec.x*R}px, ${vec.y*R}px)`;
}
function send() {
  if (!padShown()) return;
  const s = vec.x + "," + vec.y; if (s === sent) return;
  sent = s; set(ref(rtdb, `party/in/${uid}`), vec).catch(() => { sent = "" });
}

/* called by the player page whenever players change, and by our own listeners */
export function update() {
  if (!el) return;
  const {players, joined} = info(), show = !!(meta && meta.on && joined);
  if (show && el.hidden) { sent = ""; onDisconnect(ref(rtdb, `party/in/${uid}`)).remove() }
  if (!show && !el.hidden) remove(ref(rtdb, `party/in/${uid}`)).catch(() => {});
  el.hidden = !show; if (!show) return;
  const me = players.find(p => p.id === uid), last = (meta.last || []).find(x => x.id === uid);
  el.style.setProperty("--me", colorOf(players, uid));
  el.querySelector(".pad-name").textContent = me ? me.n : "";
  el.querySelector(".pad-pts").textContent = `${(meta.scores || {})[uid] || 0} pts`;
  el.querySelector(".pad-msg").textContent =
    meta.phase === "countdown" ? "Get ready…" :
    meta.phase === "play" ? (status[uid] === "out" ? "You're out! Watch the others." : meta.hint || "Go!") :
    meta.phase === "over" ? (last ? `You came ${ordinal(last.place)}${last.pts ? ` · +${last.pts}` : ""}` : "Watch the big screen") :
    "Party mode! Watch the big screen.";
}
