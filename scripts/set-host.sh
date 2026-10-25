#!/bin/bash
# Puts the host account's UID into firestore.rules and deploys the rules.
# Usage: scripts/set-host.sh <project-id> <host-email>
set -euo pipefail
cd "$(dirname "$0")/.."
ID=${1:?Usage: scripts/set-host.sh <project-id> <host-email>}
EMAIL=${2:?Usage: scripts/set-host.sh <project-id> <host-email>}
FB="npx -y firebase-tools@13.29.1"
TMP=$(mktemp -d)/users.json
trap 'rm -f "$TMP"' EXIT

$FB auth:export "$TMP" --format=json --project "$ID" >/dev/null
UID_=$(EMAIL="$EMAIL" node -e 'const u=JSON.parse(require("fs").readFileSync(process.argv[1])).users.find(u=>u.email===process.env.EMAIL);console.log(u?u.localId:"")' "$TMP")
[ -z "$UID_" ] && { echo "No user with email $EMAIL. Add one under Authentication → Users first."; exit 1; }

sed -i.bak -E "s/request\.auth\.uid in \['[^']*'\]/request.auth.uid in ['$UID_']/" firestore.rules && rm firestore.rules.bak
echo "Host UID $UID_ written to firestore.rules"
$FB deploy --only firestore:rules --project "$ID"
