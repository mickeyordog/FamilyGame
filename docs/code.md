# Code

There's no framework and no build step: plain HTML pages load JavaScript modules, and the Firebase SDK comes from Google's CDN.

```
index.html        player page
host.html         host page (sign-in required)
party.html        party mode's big screen (see party.md)
css/style.css     all styles, light and dark
js/config.js      Firebase project config (public by design)
js/common.js      Firebase setup, round definitions, shared views and audio
js/player.js      player page logic
js/host.js        host page logic: dealing, scoring, timer, clip-making
js/party.js       party screen: minigames
js/pad.js         phone joystick for party mode
*.rules*          Firestore and Realtime Database rules
scripts/          one-time Firebase setup
tests/            end-to-end test
```

## How a page works

Each page keeps the latest game state in a variable, listens to Firestore, and rebuilds its HTML with `render()` on every change. Buttons carry `data-` attributes, and a single click handler acts on them.

The **host** is the only one who changes the game: it moves through phases, deals tasks and scores rounds. **Players** only write their own name, guesses and feeling pick.

## Clips

The host page cuts 30 seconds of the chosen song in the browser and saves it as a 24 kHz mono WAV (about 1.4 MB). A Firestore document holds at most 1 MiB, so the clip is split across two documents. Phones join the parts before playing.

## Testing locally

Run `python3 -m http.server 5173` and open the pages.

`tests/run.sh` plays a whole game against local Firebase emulators in headless Chrome. It needs Java and Chrome and never touches the real project.
