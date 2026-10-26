# Setup

You only do this once. You need Node.js installed.

## 1. Log in

```
npx firebase-tools login
```

## 2. Create the project

```
scripts/setup.sh <project-id> [location]
```

The project ID must be unique across all of Google, for example `fidi-yourname`. The location defaults to `nam5` (US). Use `eur3` for Europe. You can't change it later.

This creates the project, a web app and the Firestore database, and writes `js/config.js`.

If it's your first Firebase project, Google may ask you to accept the terms at <https://console.firebase.google.com> first.

## 3. Turn on sign-in (in the console)

The script prints a link. There:

1. Click **Get started**.
2. Enable **Anonymous**. This is for players.
3. Enable **Email/Password**. This is for the host.
4. Under **Users** → **Add user**, add the host's email and a password.
5. For party mode, open **Realtime Database**, click **Create database**, and choose us-central1 and locked mode.

## 4. Make yourself host

```
scripts/set-host.sh <project-id> <host-email>
```

This writes your user ID into `firestore.rules` and deploys the rules.

## 5. Publish

Commit and push. GitHub Pages serves the `main` branch automatically:

```
git add -A && git commit -m "Connect Firebase" && git push
```

After a minute, open `host.html` on the live site and sign in.

## Changing things later

- **Code changes**: push to `main`.
- **Rule changes**: run `npx firebase-tools deploy --only firestore:rules --project <project-id>`.
