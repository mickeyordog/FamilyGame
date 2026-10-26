# Roadmap

## Party mode lag (open)

In real play, Dodgefall felt too laggy. Input goes phone → Realtime Database (us-central1) → laptop. Options:

1. **Measure first**: show each controller's round trip in milliseconds on the party screen.
2. **WebRTC data channels**: phones talk straight to the laptop over Wi-Fi (about 10–30 ms), using the database only to connect. Free.
3. **Lag-tolerant games**: longer shadow warnings, slower hazards.

## More minigames

- **Live**: Paint the Floor (claim tiles), Hot Potato (pass the bomb by touching), Keep the Crown (stand alone in a drifting circle).
- **Phone-only** (one score sent at the end, so lag doesn't matter): Perfect Circle, Steady Hand (trace a path), Stop the Clock (hit 10.00 s on a timer that fades out), Odd One Out (spot the different emoji).
- **Game on every phone**: the laptop sends out positions about 15 times a second, and phones draw them.

## Drawing game rounds

- **Round 1**: done. The clip loops while you draw, and song names are hidden.
- **Round 2** (next): options are the passage on phones, one invented *Wake* word each, or everyone drawing the same passage and guessing whose is whose.
- **Rounds 3 and 4**: swapped so Feelings comes last. Otherwise not reviewed yet.

## Parked rule ideas

Set aside in favour of redesigning rounds:

- the drawer scores only if some but not all guessers get it
- 4 choices per drawing
- a shorter timer each round
- a confidence bet
