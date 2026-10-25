# Code

There's no framework and no build step. Every page is plain HTML loading JavaScript modules, and the Firebase SDK comes from Google's CDN.

```
index.html        player page
host.html         host page (sign-in required)
css/style.css     all styles, light and dark
js/config.js      Firebase project config (public by design)
js/common.js      Firebase setup, round definitions, shared views and audio
js/player.js      player page logic
js/host.js        host page logic: dealing, scoring, timer, clip-making
firestore.rules   database security rules
scripts/          one-time Firebase setup
```

## How a page works

Each page keeps the latest game state in a variable, listens to Firestore for changes, and rebuilds its HTML with `render()` whenever anything changes. Buttons carry `data-` attributes, and a single click handler acts on them.

The **host** is the only one who changes the game: it moves through phases, deals tasks and scores rounds. **Players** only write their own name, guesses and feeling pick.

## Clips

The host page decodes the chosen song in the browser and cuts 30 seconds. It saves them as a 24 kHz mono WAV, about 1.4 MB. A Firestore document can hold at most 1 MiB, so the clip is split across two documents. Phones download and join the parts before playing.

## Testing locally

Run `python3 -m http.server 5173` and open the pages. Add `?emu` to the URL to use local Firebase emulators instead of the real project: `npx firebase-tools emulators:start --project demo-fidi`.
