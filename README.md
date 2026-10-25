# Feel It, Draw It

A party drawing game for phones. Players open the main link and type a name, with no account needed. The host runs the game from `host.html` after signing in.

- `index.html` is the player page.
- `host.html` is the host page. You need the host account's email and password to sign in.
- Game state lives in Firestore and song clips live in Firebase Storage. It's a static site with no build step.

## One-time Firebase setup

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication** → Get started. Then:
   - Under **Sign-in method**, enable **Anonymous** (for players) and **Email/Password** (for the host).
   - Under **Users** → **Add user**, create the host account. Copy its **User UID**.
   - Under **Settings** → **User actions**, untick **Enable create (sign-up)** so nobody else can make accounts.
3. **Firestore Database** → Create database (production mode). Go to the **Rules** tab, paste in `firestore.rules`, and replace `REPLACE_WITH_HOST_UID` with the UID you copied. Click Publish.
4. **Storage** → Get started. New projects need the pay-as-you-go Blaze plan for Storage. A family game stays well inside the free allowance. On the **Rules** tab, paste in `storage.rules` with the same UID. Click Publish.
5. **Project settings** → Your apps → add a **Web app**. Copy the `firebaseConfig` values into `js/config.js`.

After that, open `host.html`, sign in, and add your clips under Setup.

## Running locally

Any static server works, for example `python3 -m http.server 5173`, then open <http://localhost:5173/host.html>.

To test without touching the real project, start the emulators with `npx firebase-tools emulators:start --project demo-fidi` and add `?emu` to the URLs (`index.html?emu`, `host.html?emu`). Create a host user in the Auth emulator and put its UID into the rules files.

## How the data is laid out

Everything lives under `games/main`:

| Path | Who can read | Who can write | What it holds |
|---|---|---|---|
| `games/main` | everyone | host | round, phase, timer, settings, revealed results |
| `players/{uid}` | everyone | that player | name, last seen |
| `private/{uid}` | that player and the host | that player | guesses, feeling pick |
| `tasks/{uid}` | that player and the host | host | that player's secret task |
