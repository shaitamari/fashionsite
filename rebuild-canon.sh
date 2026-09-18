#!/usr/bin/env bash
#
# rebuild-canon.sh — rebuild Canon into the master feed with the "Canon >"
# category root and deploy. Run from the repo root (~/Desktop/posh).
#
#   chmod +x rebuild-canon.sh    # once
#   ./rebuild-canon.sh
#
# What it does + why: the code-side Eureka filter keys off the top-level
# category (= the vertical's subvertical). Canon's was "Cameras & Printing";
# the filter expects "Canon", so search returned nothing. This sets
# subvertical=Canon, rebuilds master.xml (the feed Eureka reads), and deploys.
# The big one is `build.py --all` — `build.py canon` alone does NOT regenerate
# master.xml.

set -e  # stop on the first real error

echo "==============================================="
echo " Canon rebuild — must be run from the repo root"
echo "==============================================="

# sanity: are we in the right place?
if [ ! -f build.py ] || [ ! -f verticals.json ]; then
  echo "ERROR: run this from the repo root (no build.py / verticals.json here)."
  echo "  cd ~/Desktop/posh   then   ./rebuild-canon.sh"
  exit 1
fi

echo
echo "STEP 1/6 — set Canon subvertical to 'Canon' (idempotent)"
if [ -f patch-canon-subvertical.py ]; then
  python3 patch-canon-subvertical.py || true
else
  echo "  patch-canon-subvertical.py not found — setting it inline instead"
  python3 - <<'PY'
import json
d=json.load(open("verticals.json"))
if "canon" not in d:
    raise SystemExit("ERROR: 'canon' not in verticals.json — apply patch-canon-shared.py first.")
before=d["canon"].get("subvertical")
d["canon"]["subvertical"]="Canon"
if "vertical_label" in d["canon"]:
    d["canon"]["vertical_label"]="Canon"
json.dump(d,open("verticals.json","w"),indent=1,ensure_ascii=False)
print(f"  subvertical: {before!r} -> 'Canon'")
PY
fi

echo
echo "STEP 2/6 — confirm the value (must say: subvertical = Canon)"
python3 -c "import json; print('  subvertical =', json.load(open('verticals.json'))['canon'].get('subvertical'))"

echo
echo "STEP 3/6 — rebuild EVERYTHING (regenerates master.xml — the feed Eureka reads)"
python3 build.py --all

echo
echo "STEP 4/6 — confirm master.xml now has the 'Canon >' root (must be > 0)"
CANON_ROWS=$(grep -c '<g:product_type>Canon &gt;' feeds/master.xml || true)
echo "  Canon-rooted products in master.xml: $CANON_ROWS"
if [ "$CANON_ROWS" -eq 0 ]; then
  echo "  WARNING: still 0 — the build didn't pick up the new root. Stopping before deploy."
  echo "  Check step 2 said 'Canon', then re-run. If it persists, share the build output."
  exit 1
fi

echo
echo "STEP 5/6 — deploy"
posh "Canon > root in master feed so the code-side Eureka filter matches"

echo
echo "STEP 6/6 — confirm it went LIVE (waiting 20s for deploy, then checking)"
sleep 20
LIVE_ROWS=$(curl -s https://insiderdemo.com/feeds/master.xml | grep -c '<g:product_type>Canon &gt;' || true)
echo "  Canon-rooted products in the LIVE feed: $LIVE_ROWS"
if [ "$LIVE_ROWS" -gt 0 ]; then
  echo
  echo "DONE. Canon is under 'Canon >' in the live feed."
  echo "Eureka picks it up on the next hourly master-feed sync, then search works."
else
  echo
  echo "Local build is correct but the LIVE feed hasn't updated yet."
  echo "This is deploy/CDN lag — wait a minute and re-run just this check:"
  echo "  curl -s https://insiderdemo.com/feeds/master.xml | grep -c '<g:product_type>Canon &gt;'"
fi
