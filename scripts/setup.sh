#!/bin/bash
# Creates the Firebase project, web app and Firestore database, and writes js/config.js.
# Usage: scripts/setup.sh <project-id> [location]   (run `npx firebase-tools login` first)
set -euo pipefail
cd "$(dirname "$0")/.."
ID=${1:?Usage: scripts/setup.sh <project-id> [location]}
LOC=${2:-nam5}
FB="npx -y firebase-tools@13.29.1"

if $FB projects:list --json | grep -q "\"projectId\": \"$ID\""; then echo "Project $ID already exists."
else $FB projects:create "$ID" --display-name "Feel It Draw It"; fi

APP=$($FB apps:list WEB --project "$ID" --json | node -e 'const r=JSON.parse(require("fs").readFileSync(0)).result||[];console.log(r[0]?.appId||"")')
[ -z "$APP" ] && APP=$($FB apps:create WEB "Feel It Draw It" --project "$ID" --json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).result.appId)')

$FB apps:sdkconfig WEB "$APP" --project "$ID" --json | node -e '
  const r = JSON.parse(require("fs").readFileSync(0)).result, c = r.sdkConfig || r;
  const keep = ["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"];
  const cfg = Object.fromEntries(keep.filter(k => c[k]).map(k => [k, c[k]]));
  const f = "js/config.js", s = require("fs").readFileSync(f, "utf8");
  require("fs").writeFileSync(f, s.replace(/export const firebaseConfig = \{[\s\S]*?\};/, "export const firebaseConfig = " + JSON.stringify(cfg, null, 2) + ";"));
  console.log("Wrote js/config.js");'

$FB firestore:databases:create "(default)" --location "$LOC" --project "$ID" || echo "(Firestore database may already exist; carrying on.)"

echo
echo "Next: enable Anonymous and Email/Password sign-in, then add yourself as a user:"
echo "  https://console.firebase.google.com/project/$ID/authentication/providers"
echo "Then run: scripts/set-host.sh $ID <your-email>"
