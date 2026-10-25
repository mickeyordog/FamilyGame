# Data and security

Everything lives in Firestore under `games/main`.

| Path | Holds | Who can read | Who can write |
|---|---|---|---|
| `games/main` | round, phase, timer, lists, revealed answers | everyone | host |
| `players/{id}` | name, when they joined, last seen | everyone | that player |
| `private/{id}` | guesses and feeling pick | that player and the host | that player |
| `tasks/{id}` | that player's secret task | that player and the host | host |
| `clips/{id}-{n}` | part of a song clip | everyone | host |

`{id}` is the player's Firebase user ID. Players sign in anonymously and invisibly when the page opens.

## Why it's split up

Secret tasks and guesses get their own documents so that nobody can peek, even with browser devtools. Answers only become public when the host reveals them at the end of a round.

## The host

`firestore.rules` names a single host user ID. Only that account can change the game, deal tasks or upload clips. Anyone else who signs in can only act as a player. `scripts/set-host.sh` fills in the ID.

The Firebase config in `js/config.js` is meant to be public. The rules are what protect the data.

## Cost

This all fits in Firebase's free Spark plan, so no billing account is needed. A game night uses a few thousand reads, and the free limit is 50,000 a day.
