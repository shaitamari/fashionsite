#!/usr/bin/env python3
"""Canon back to its own locale: en_CA, CAD, its own feed.

    python3 patch-canon-locale.py

Canon was moved into the shared en_GB catalogue because Eureka was not
enabled on en_CA. It is now, so Canon goes back to the arrangement that
suits a customer POC: its own locale, its own index, its own feed, prices
in the customer's own currency, and no other brand's products reachable
from its storefront.

This reverses patch-canon-shared.py:

  1. verticals.json — locale en_CA, currency CAD, standalone_feed true.
  2. sources/canon-*.json — prices back to CAD. They were converted to EUR
     at 0.64 for the shared catalogue; this divides by the same rate.
     Rounding means a cent of drift here and there, which nobody will see.
  3. retired.json — Canon's 1,891 product ids are appended, because the
     XML sync adds and updates but never removes. Without this, the Canon
     products already synced into en_GB stay in that catalogue for ever,
     reachable from every other storefront's search.

agent.js is deliberately left alone: the shared agent serves Canon fine and
takes its locale and currency from the tag, so a separate agent buys nothing
now that the locale does the scoping.

Then: python3 build.py --all, push. In the panel:
  - reactivate the en_CA XML integration (feeds/canon.xml) if it went passive
  - Canon needs its own Eureka and recommendation campaigns on en_CA; the
    en_GB ones (4233 search, 4235 listing, 4239/4414/4416 recommendations)
    do not serve another locale. Their ids go into config.js perVertical.
"""
import glob
import json
import os
import sys

CAD_TO_EUR = 0.64


def main():
    if not os.path.exists("verticals.json"):
        sys.exit("Run this from the repo root (no verticals.json here).")
    print("Canon → its own locale")

    cfg = json.load(open("verticals.json"))
    canon = cfg.get("canon")
    if canon is None:
        sys.exit("verticals.json has no canon entry — run patch-canon-shared.py first, or add it by hand.")

    canon["locale"] = "en_CA"
    canon["currency"] = "CAD"
    canon["standalone_feed"] = True
    print("  verticals.json: locale en_CA, currency CAD, own feed")

    # Prices back to CAD, once. The flag set by the shared patch says whether
    # the conversion happened; if it is absent the sources are already CAD.
    if canon.pop("_prices_eur", None):
        n = 0
        for f in sorted(glob.glob("sources/canon-*.json")):
            d = json.load(open(f))
            for prod in d["products"]:
                for v in prod["variants"]:
                    for k in ("price", "compare_at_price"):
                        val = float(v.get(k) or 0)
                        v[k] = f"{val / CAD_TO_EUR:.2f}" if val else "0.00"
                n += 1
            json.dump(d, open(f, "w"), ensure_ascii=False)
        print(f"  sources: {n} products converted back to CAD")
    else:
        print("  sources: already in CAD, left alone")

    json.dump(cfg, open("verticals.json", "w"), indent=2, ensure_ascii=False)

    # Retire the Canon ids from the shared catalogue. The sync never deletes,
    # so the only way out of en_GB is to keep sending them as out-of-stock
    # stubs under the Retired brand.
    ids = []
    for f in sorted(glob.glob("sources/canon-*.json")):
        for prod in json.load(open(f))["products"]:
            for v in prod["variants"]:
                ids.append({"id": str(v["id"]), "groupcode": str(prod["id"]), "name": prod["title"]})
    if os.path.exists("retired.json"):
        retired = json.load(open("retired.json"))
    else:
        retired = []
    have = {str(r.get("id")) for r in retired}
    added = [r for r in ids if r["id"] not in have]
    if added:
        retired.extend(added)
        json.dump(retired, open("retired.json", "w"), indent=0)
        print(f"  retired.json: {len(added)} Canon ids added (now {len(retired)})")
    else:
        print("  retired.json: Canon ids already present")

    print("\nNext: python3 build.py --all, then push.")
    print("Panel: reactivate the en_CA integration, and give Canon its own")
    print("Eureka and recommendation campaigns on en_CA — the en_GB ones do")
    print("not serve another locale. Ids into config.js perVertical.")


if __name__ == "__main__":
    main()
