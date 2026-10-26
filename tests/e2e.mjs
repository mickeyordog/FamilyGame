// Plays a whole game (host + 3 players, a 4th joining late) against the Firebase emulators. Run via tests/run.sh.
import puppeteer from "puppeteer-core";
const B="http://localhost:5173/", S=process.env.OUT; // scratch dir from run.sh: test song, screenshots
const browser=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--autoplay-policy=no-user-gesture-required"]});
let shown;const errs=[];await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-fidi/databases/(default)/documents",{method:"DELETE"});
async function open(url,tag){const ctx=await browser.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:400,height:900});
  p.on("pageerror",e=>errs.push(tag+": "+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(tag+" console: "+m.text())});await p.goto(url);p.tag=tag;return p}
const waitText=(p,t,ms=15000)=>p.waitForFunction(t=>document.body.innerText.toLowerCase().includes(t.toLowerCase()),{timeout:ms},t).catch(async e=>{await p.screenshot({path:`${S}/fail-${p.tag}.png`});throw new Error(`${p.tag} never showed "${t}". Body:\n`+await p.evaluate(()=>document.body.innerText))});
const click=async(p,sel)=>{await p.waitForSelector(sel,{timeout:10000});await p.click(sel)};
const clickText=async(p,t)=>{await p.waitForFunction(t=>[...document.querySelectorAll("button")].some(b=>b.innerText.trim()===t&&!b.disabled),{timeout:10000},t);await p.evaluate(t=>[...document.querySelectorAll("button")].find(b=>b.innerText.trim()===t&&!b.disabled).click(),t)};
const text=p=>p.evaluate(()=>document.body.innerText);

const host=await open(B+"host.html?emu","host");
await waitText(host,"Sign in to run the game");
await host.type("#em","host@test.dev");await host.type("#pw","secret123");await click(host,"#loginform button");
await waitText(host,"Waiting for players");
// clip upload
for(const i of [0,1,2]){const fi=await host.$("#cf"+i);await fi.uploadFile(S+"/song.wav");
await host.evaluate(i=>{document.getElementById("cs"+i).value=String(i*5)},i);
await host.evaluate(i=>document.querySelector(`[data-save="${i}"]`).click(),i);await waitText(host,`Clip ${i+1} saved`,30000)}
const parts=await (await fetch("http://127.0.0.1:8080/v1/projects/demo-fidi/databases/(default)/documents/games/main/clips",{headers:{Authorization:"Bearer owner"}})).json();
console.log("clip docs:",parts.documents.map(d=>d.name.split("/").pop()).join(", "));

const names=["Ann","Ben","Cat"],ps=[];
for(const n of names){const p=await open(B+"index.html?emu",n);await waitText(p,"What's your name?");await p.type("#nm",n);await click(p,"#nameform button");await waitText(p,"You're in");ps.push(p)}
await waitText(host,"Cat");
console.log("lobby on Ann lists everyone:",await ps[0].waitForFunction(()=>["Ann","Ben","Cat"].every(n=>document.body.innerText.includes(n)),{timeout:15000}).then(()=>true));

async function playRound(r,hasListen){
  await clickText(host,`Start round ${r}`);
  if(hasListen){await waitText(ps[0],r===1?"Listen together":"Listen to the reading");await clickText(host,"Start making")}
  for(const p of ps)await waitText(p,"Your secret");
  console.log("  limit on Ann:",await ps[0].evaluate(()=>document.querySelector(".limit h2")?.innerText||"none"));
  if(r===1)for(const p of ps){await clickText(p,"Play my clip");await waitText(p,"Stop",10000);console.log(`  ${p.tag} clip plays`)}
  if(r===3&&ps.length===3){const p=await open(B+"index.html?emu","Dan");await waitText(p,"What's your name?");await p.type("#nm","Dan");await click(p,"#nameform button");ps.push(p);await waitText(p,"Your secret")}
  await new Promise(r=>setTimeout(r,1500));
  shown={};for(const p of ps){const t=await p.evaluate(()=>document.querySelector(".hero .big").innerText);shown[p.tag]=t;console.log(`  ${p.tag} task: ${t}`)}
  if(r===1){
    // secrecy: Ann tries to read Ben's task and guesses directly
    const ids=await host.evaluate(()=>[...document.querySelectorAll("[data-del]")].map(b=>[b.getAttribute("aria-label").replace("Remove ",""),b.dataset.del]));
    const ben=Object.fromEntries(ids).Ben;
    const res=await ps[0].evaluate(async ben=>{const c=await import("/js/common.js");const f=await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
      const out={};for(const n of ["tasks","private"]){try{await f.getDoc(c.sub(n,ben));out[n]="READABLE"}catch(e){out[n]=e.code}}
      try{await f.setDoc(c.gameRef,{v:4,hacked:true});out.game="WRITABLE"}catch(e){out.game=e.code}
      try{await f.setDoc(c.sub("players",ben),{n:"pwned"});out.otherName="WRITABLE"}catch(e){out.otherName=e.code}
      return out},ben);
    console.log("  Ann reading Ben's secrets / writing state:",JSON.stringify(res));
  }
  if(r===4)for(const [i,p] of ps.entries())await p.evaluate(i=>document.querySelectorAll("[data-pick]")[i].click(),i)
  await new Promise(r=>setTimeout(r,800));
  if(r===4)console.log("  host sees picks:",(await text(host)).match(/not picked/)?"some missing":"all picked");
  await clickText(host,"End timer and guess");
  for(const p of ps){await waitText(p,"Look at each piece");
    // guess the first available option for everyone
    const n=await p.$$eval(".guess",x=>x.length);for(let i=0;i<n;i++){await p.evaluate(i=>document.querySelectorAll(".guess")[i].querySelector("[data-guess]").click(),i);await new Promise(r=>setTimeout(r,100))}}
  await new Promise(r=>setTimeout(r,800));
  console.log("  host:",(await text(host)).match(/\d+ of \d+ have finished guessing/)?.[0]);
  await clickText(host,"Show answers");
  await waitText(ps[1],"answers");
  const rows=await ps[1].evaluate(()=>[...document.querySelectorAll(".list li")].map(li=>li.innerText.replace(/\n/g," | ")));
  console.log("  results on Ben:\n    "+rows.join("\n    "));
  console.log("  Ben's guesses:",await ps[1].evaluate(()=>document.querySelector(".hero").innerText.replace(/\n+/g," | ")));
  for(const p of ps){const row=rows.find(x=>x.startsWith(p.tag+" · "));const ans=row.split(" · ")[1].split(" | ")[0];const s=shown[p.tag];
    const ok=r===4?true:r===1?s===ans:s.toLowerCase().includes(ans.toLowerCase());if(!ok)console.log(`  !! MISMATCH ${p.tag}: shown "${s}" vs answer "${ans}"`)}
  if(r===1){const c=Object.values(shown);console.log("  distinct clips:",new Set(c).size===c.length)}
}
await playRound(1,true);await playRound(2,true);await playRound(3,false);await playRound(4,false);
await clickText(host,"Final scores");
await waitText(ps[2],"Winner");
console.log("final on Cat:",(await text(ps[2])).replace(/\n/g," | "));
await host.screenshot({path:S+"/host-end.png",fullPage:true});await ps[0].screenshot({path:S+"/player-end.png",fullPage:true});

// party mode: the host page becomes the big screen, phones become joysticks
await host.goto(B+"party.html?emu");await host.setViewport({width:1280,height:720});
await waitText(host,"Party mode");
for(const p of ps)await p.waitForSelector(".pad:not([hidden])",{timeout:10000});
await host.waitForFunction(n=>(document.body.innerText.match(/controller ready/g)||[]).length===n,{timeout:10000},ps.length);
console.log("party: all",ps.length,"controllers ready");
await host.bringToFront();await clickText(host,"Play Dodgefall");
await waitText(ps[0],"Get ready");
await waitText(ps[0],"Dodge the shadows",8000);
// Ann holds the stick to the right for a second, then lets go
const box=await ps[0].$eval(".pad-area",e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
await ps[0].mouse.move(box.x,box.y);await ps[0].mouse.down();await ps[0].mouse.move(box.x+80,box.y,{steps:4});
await new Promise(r=>setTimeout(r,1000));await ps[0].mouse.up();
await host.bringToFront(); // the game loop runs on animation frames, which pause in a background tab
await waitText(host,"Round over",120000);
console.log("party results:",(await host.evaluate(()=>[...document.querySelectorAll(".list")][0].innerText)).replace(/\n/g," "));
for(const p of ps){await waitText(p,"You came");console.log(`  ${p.tag} pad:`,await p.$eval(".pad-msg",e=>e.textContent))}
await host.screenshot({path:S+"/party-host.png"});await ps[0].screenshot({path:S+"/party-pad.png"});
await clickText(host,"Back to the drawing game");
for(const p of ps)await p.waitForSelector(".pad[hidden]",{timeout:10000});
console.log("party: phones back to the drawing game");
console.log("ERRORS:",errs.length?errs:"none");
await browser.close();
