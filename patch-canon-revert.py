#!/usr/bin/env python3
"""Full revert: Canon back into the shared en_GB catalogue.

    python3 patch-canon-revert.py

Canon was moved to its own locale (en_CA / CAD) to get prices in the
customer's currency. Search and the agent both stopped working there, and
CAD is cosmetic next to an agent that answers — so this puts everything
back to the state that worked.

Four things, which is why this exists rather than re-running the earlier
patch on its own:

  1. verticals.json — locale, currency and standalone_feed removed, so Canon
     joins the master feed again.
  2. sources/canon-*.json — prices back to EUR at 0.64, once. The canon block
     records it, so running this twice is safe.
  3. retired.json — Canon's ids are REMOVED. Moving out added them so the
     shared catalogue would retire them; left in place they would now push
     the same products back as out-of-stock stubs, which is worse than
     either state.
  4. assets/config.js — the canon Eureka override goes back to a comment, so
     the storefront stops asking for an en_GB campaign id.

agent.js already points Canon at the shared agent and is left alone.

Then: python3 build.py --all, push, and wait for the hourly sync. In the
panel the en_CA integration can be set passive; nothing else needs touching.
"""
import glob
import json
import os
import re
import sys

CAD_TO_EUR = 0.64


def step(msg):
    print("  " + msg)


def main():
    if not os.path.exists("verticals.json"):
        sys.exit("Run this from the repo root (no verticals.json here).")
    print("Canon → back to the shared catalogue")

    # 1. the vertical joins the shared feed again
    cfg = json.load(open("verticals.json"))
    canon = cfg.get("canon")
    if canon is None:
        sys.exit("verticals.json has no canon entry.")
    dropped = [k for k in ("locale", "currency", "standalone_feed") if k in canon]
    for k in dropped:
        canon.pop(k)
    step("verticals.json: " + (", ".join(dropped) + " removed" if dropped else "already shared"))

    # 2. prices back to EUR, once
    if not canon.get("_prices_eur"):
        n = 0
        for f in sorted(glob.glob("sources/canon-*.json")):
            d = json.load(open(f))
            for prod in d["products"]:
                for v in prod["variants"]:
                    for k in ("price", "compare_at_price"):
                        val = float(v.get(k) or 0)
                        v[k] = f"{val * CAD_TO_EUR:.2f}" if val else "0.00"
                n += 1
            json.dump(d, open(f, "w"), ensure_ascii=False)
        canon["_prices_eur"] = True
        step(f"sources: {n} products converted CAD → EUR")
    else:
        step("sources: already in EUR")

    json.dump(cfg, open("verticals.json", "w"), indent=2, ensure_ascii=False)

    # 3. take Canon's ids OUT of retired.json — they were added so the shared
    #    catalogue would retire them on the way out. Now that the products are
    #    coming back, a stub would fight the real record.
    canon_ids = set()
    for f in sorted(glob.glob("sources/canon-*.json")):
        for prod in json.load(open(f))["products"]:
            for v in prod["variants"]:
                canon_ids.add(str(v["id"]))
    if os.path.exists("retired.json"):
        retired = json.load(open("retired.json"))
        keep = [r for r in retired if str(r.get("id")) not in canon_ids]
        removed = len(retired) - len(keep)
        if removed:
            json.dump(keep, open("retired.json", "w"), indent=0)
            step(f"retired.json: {removed} Canon ids removed (now {len(keep)})")
        else:
            step("retired.json: no Canon ids to remove")

    # 4. the Eureka override goes back to a comment
    p = "assets/config.js"
    if os.path.exists(p):
        s = open(p).read()
        new = re.sub(r"^( *)canon: \{ campaignId: \d+ \},?\s*$",
                     r"\1// canon: { campaignId: null }   // en_CA — fill in once created",
                     s, count=1, flags=re.M)
        if new != s:
            open(p, "w").write(new)
            step("config.js: canon Eureka override commented out")
        else:
            step("config.js: no canon override set")

    print("\nNext: python3 build.py --all, then push.")
    print("Then the hourly sync. The en_CA integration can be set passive.")


if __name__ == "__main__":
    main()
