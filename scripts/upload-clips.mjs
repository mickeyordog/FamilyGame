// Saves the three songs in songs/ as clips, through the real host page. You sign in yourself in the Chrome window.
// Usage: node scripts/upload-clips.mjs   (needs `npm install` in tests/ and the local server on port 5173)
import { createRequire } from "node:module";
const puppeteer = createRequire(new URL("../tests/package.json", import.meta.url))("puppeteer-core");
const dir = new URL("../songs/", import.meta.url).pathname;
const SONGS = [
  {file:"debussy-cathedrale.mp3", name:"Debussy", start:0},
  {file:"perry-ferya-live-on-venus.mp3", name:"Free jazz", start:0},
  {file:"gamelan-yogyakarta.mp3", name:"Gamelan", start:20},
];

const browser = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:false, defaultViewport:null, protocolTimeout:900000});
const [page] = await browser.pages();
await page.goto("http://localhost:5173/host.html");
console.log("Sign in on the host page in the Chrome window…");
await page.waitForSelector("#cf0", {timeout:600000});
for (const [i, s] of SONGS.entries()) {
  await (await page.$("#cf"+i)).uploadFile(dir + s.file);
  await page.evaluate((i, s) => { document.getElementById("cn"+i).value = s.name; document.getElementById("cs"+i).value = String(s.start) }, i, s);
  await page.evaluate(i => document.querySelector(`[data-save="${i}"]`).click(), i);
  await page.waitForFunction(i => document.body.innerText.includes(`Clip ${i+1} saved`), {timeout:60000}, i);
  console.log(`Clip ${i+1} saved: ${s.name}`);
}
await browser.close();
