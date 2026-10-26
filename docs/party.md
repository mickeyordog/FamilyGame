# Party mode

Live minigames, separate from the drawing game. The laptop (ideally on a TV) is the big screen, and phones become joysticks.

## Playing

On the host page, open **Party mode** from the lobby or the final scores. Phones on the player link switch to a joystick by themselves. Drag anywhere on the pad to move.

Pick a minigame. 1st place gets 3 points, 2nd gets 2 and 3rd gets 1. Party scores are kept apart from drawing scores. **Back to the drawing game**, or closing the party screen, hands the phones back.

| Minigame | Goal |
|---|---|
| Dodgefall | Shadows appear, then something lands on them. Last one standing wins. |

## How it works

`party.html` and `js/party.js` run the game on the laptop and draw everyone. Phones only send their stick direction (`js/pad.js`), and only when it changes.

That live data goes through the Firebase **Realtime Database**, which has lower lag than Firestore. It's free on the Spark plan.

| Path | Holds | Read | Write |
|---|---|---|---|
| `party/meta` | on/off, phase, game, scores | everyone | host |
| `party/status/{id}` | who's been knocked out | everyone | host |
| `party/in/{id}` | a player's joystick | host | that player |

`database.rules.json` holds these rules, with the same host ID as `firestore.rules`.

## Adding a minigame

Add an entry to `GAMES` in `js/party.js` with `start`, `step` and `draw`. `step` returns who was knocked out on that frame.
