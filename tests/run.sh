#!/bin/bash
# End-to-end test: starts the Firebase emulators and a local server, then plays a full game in headless Chrome.
# Usage: tests/run.sh   (needs Node, Java and Google Chrome)
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent
export OUT=$(mktemp -d)
ROOT=$(cd .. && pwd)
cleanup() { kill $(jobs -p) 2>/dev/null || true; }
trap cleanup EXIT

# emulators read a copy of the rules, so the test host UID never touches the real file
cp "$ROOT/firestore.rules" "$ROOT/database.rules.json" "$ROOT/firebase.json" "$OUT/"
(cd "$OUT" && exec "$OLDPWD/node_modules/.bin/firebase" emulators:start --only auth,firestore,database --project demo-fidi > emu.log 2>&1) &
(cd "$ROOT" && exec python3 -m http.server 5173 > "$OUT/http.log" 2>&1) &
for i in $(seq 1 60); do grep -q "All emulators ready" "$OUT/emu.log" 2>/dev/null && break; sleep 1; done

HOST=$(curl -s -X POST 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo' \
  -H 'content-type: application/json' -d '{"email":"host@test.dev","password":"secret123"}' | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).localId)')
sed -i.bak -E "s/request\.auth\.uid in \['[^']*'\]/request.auth.uid in ['$HOST']/" "$OUT/firestore.rules"
sed -i.bak -E "s/auth\.uid === '[^']*'/auth.uid === '$HOST'/g" "$OUT/database.rules.json"
sleep 2 # let the emulator reload the rules

python3 -I -c "
import wave,struct,math
w=wave.open('$OUT/song.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(44100)
w.writeframes(b''.join(struct.pack('<hh',int(8000*math.sin(i*2*math.pi*440/44100)),int(8000*math.sin(i*2*math.pi*660/44100))) for i in range(44100*40)))"

node e2e.mjs
echo "Screenshots in $OUT"
