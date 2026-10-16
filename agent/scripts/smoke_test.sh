#!/usr/bin/env bash
# Upload a video to a running Just Standup app and print the 3 recommendations.
#   scripts/smoke_test.sh https://8080-<sandbox-id>.daytonaproxy01.net [video]
#   scripts/smoke_test.sh http://localhost:8090
set -euo pipefail
URL="${1:?usage: $0 <app url> [video]}"
VIDEO="${2:-$(dirname "$0")/../samples/office.mp4}"
H="X-Daytona-Skip-Preview-Warning: true"

echo "health: $(curl -sf -H "$H" "$URL/healthz")"
ID=$(curl -sf -H "$H" -F "video=@$VIDEO" "$URL/api/uploads" | python3 -c 'import sys, json; print(json.load(sys.stdin)["id"])')
echo "upload $ID"
T0=$(date +%s); LAST=""
while :; do
  R=$(curl -sf -H "$H" "$URL/api/uploads/$ID")
  ST=$(python3 -c 'import sys, json; d = json.load(sys.stdin); print(d["status"], "|", d["stage"])' <<<"$R")
  [ "$ST" != "$LAST" ] && echo "  $(( $(date +%s) - T0 ))s  $ST" && LAST="$ST"
  case "$ST" in done*|error*) break ;; esac
  [ $(( $(date +%s) - T0 )) -gt 600 ] && { echo "timed out"; exit 1; }
  sleep 3
done
python3 - "$R" <<'EOF'
import json, sys
d = json.loads(sys.argv[1])
if d["status"] != "done":
    sys.exit(f"FAILED: {d.get('error')}")
print("timings:", d.get("timings"))
for r in d["recommendations"]:
    e = r["exercise"]
    print(f"{r['rank']}. {e['name']}  @ {r['object']}\n   {e.get('video_embed') or e.get('video_link') or e.get('source_url')}")
EOF
