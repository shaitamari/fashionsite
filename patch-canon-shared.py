#!/usr/bin/env python3
"""Canon back into the shared catalogue, as an ordinary vertical.

    python3 patch-canon-shared.py

Canon was built as its own locale (en_CA / CAD) with its own feed, so that a
customer POC could never see another brand's products. That is not going to
happen on this account, so Canon goes back to the way every other storefront
works: its products sit in the shared catalogue, their category path starts
with "Cameras & Printing", and the Canon site and its campaigns filter on
that prefix like any other vertical.

This patches in place rather than shipping whole files, so nothing else in
the repo is overwritten:

  1. verticals.json — adds the canon block if missing, and drops locale,
     currency and standalone_feed if present.
  2. sources/canon-*.json — converts prices from CAD to EUR, once. The
     canon block records that it has been done, so running this twice is
     safe.
  3. import_canon.py — the same conversion for a future re-import.
  4. assets/agent.js — canon points at the shared agent instead of its own.

Then: python3 build.py --all && push. In the panel: a Eureka campaign and
recommendation campaigns filtered on category starting "Cameras & Printing",
scoped to the canon hostname, and the en_CA locale and its XML integration
can be retired.
"""
import json
import glob
import os
import re
import sys

CAD_TO_EUR = 0.64

CANON = {
    "vertical": "Retail",
    "subvertical": "Cameras & Printing",
    "brand": "Canon",
    "tagline": "Cameras, lenses, printers and everything they need",
    "hero_title": "Made for the<br>moment you see it.",
    "hero_lede": "Mirrorless and DSLR cameras, RF and EF lenses, home and office printers — with the ink, paper and accessories that fit them.",
    "hero_cta": "Shop cameras",
    "hero_eyebrow": "Canon Canada",
    "announce": "Free shipping on orders over €99 · Open-box and refurbished deals",
    "search_placeholder": "Search cameras, lenses, printers, ink",
    "newsletter_title": "Canon Canada updates",
    "newsletter_lede": "New gear, firmware, workshops and offers.",
    "tiles_title": "Shop by category",
    "grid_title": "New arrivals",
    "reco_title": "Works with this",
    "theme": {
        "bg": "#FFFFFF", "alt": "#F4F4F4", "ink": "#1A1A1A", "muted": "#5F5F5F",
        "rule": "#E2E2E2", "accent": "#CC0000",
        "display": "'Inter', Helvetica, sans-serif",
        "body": "'Inter', Helvetica, sans-serif",
        "fonts": "family=Inter:wght@400;500;600;700"
    },
    "template": "ecommerce",
    "source": "sources/canon-*.json",
    "order": ["Cameras", "Lenses", "Printers", "Ink, Toner & Paper", "Accessories", "Other"],
    "hero_category": "Cameras",
    "foryou_title": "Your kit",
    "replenishment_days": {"Ink, Toner & Paper": 60},
    "labels": {
        "cart": "Cart", "add_to_cart": "Add to cart", "cart_title": "Your cart",
        "cart_empty": "Your cart is empty",
        "confirm_title": "Thanks — your order is confirmed.",
        "browse_cta": "Keep shopping"
    },
    "profile": {
        "tiers": ["Member", "Canon Plus", "Canon Pro"],
        "service_attribute": {
            "name": "service_preference",
            "label": "I mostly shoot",
            "options": ["Photography", "Video", "Both", "I'm here for a printer"]
        }
    },
    "flow": {
        "title": "Register a product",
        "lede": "Register your Canon gear for warranty, firmware alerts and CarePAK offers.",
        "event": "product_registered",
        "fields": [
            {"label": "Product", "name": "product", "options": ["Camera", "Lens", "Printer", "Other"]},
            {"label": "Purchased from", "name": "store", "options": ["shop.canon.ca", "Retailer", "Gift"]},
            {"label": "Purchase date", "name": "date", "options": "date"}
        ],
        "attribute_field": "product"
    },
    "showcase": {"search": "EOS R", "product": ""}
}


def load(path):
    with open(path) as f:
        return f.read()


def step(msg):
    print("  " + msg)


def patch_verticals():
    path = "verticals.json"
    cfg = json.load(open(path))
    canon = cfg.get("canon")
    if canon is None:
        canon = dict(CANON)
        cfg["canon"] = canon
        step("verticals.json: canon added")
    else:
        dropped = [k for k in ("locale", "currency", "standalone_feed") if k in canon]
        for k in dropped:
            canon.pop(k)
        step("verticals.json: canon present" + (" — dropped " + ", ".join(dropped) if dropped else " — nothing to drop"))

    # Collections and subcategories are derived from the source files, so the
    # config always matches whatever the importer produced.
    types = set()
    for f in sorted(glob.glob("sources/canon-*.json")):
        for p in json.load(open(f))["products"]:
            types.add(p["product_type"])
    if types:
        canon["collections"] = {t: t.split(" > ")[0] for t in sorted(types)}
        canon["type_subcats"] = {t: t.split(" > ")[1] for t in sorted(types)}
        canon["subcats"] = {}
        canon["defaults"] = {c: "All" for c in canon["order"]}
        step(f"verticals.json: {len(types)} category paths mapped")

    # A showcase product for the SC links: something in stock with a real photo.
    if not canon.get("showcase", {}).get("product"):
        for f in sorted(glob.glob("sources/canon-*.json")):
            for p in json.load(open(f))["products"]:
                # A proper camera body, in stock, with Canon's own photograph —
                # not a cable that happened to classify under Video.
                if p["product_type"] in ("Cameras > Mirrorless", "Cameras > DSLR") \
                        and p["variants"][0]["available"] \
                        and float(p["variants"][0]["price"] or 0) > 500 \
                        and p["images"][0]["src"].startswith("http"):
                    canon.setdefault("showcase", {})["product"] = str(p["id"])
                    step("verticals.json: showcase product " + p["title"])
                    break
            if canon.get("showcase", {}).get("product"):
                break

    prices_done = bool(canon.get("_prices_eur"))
    json.dump(cfg, open(path, "w"), indent=2, ensure_ascii=False)
    return prices_done


def patch_sources(already):
    if already:
        step("sources: prices already in EUR, left alone")
        return False
    files = sorted(glob.glob("sources/canon-*.json"))
    if not files:
        step("sources: no canon source files found — skipped")
        return False
    n = 0
    for f in files:
        d = json.load(open(f))
        for prod in d["products"]:
            for v in prod["variants"]:
                for k in ("price", "compare_at_price"):
                    val = float(v.get(k) or 0)
                    v[k] = f"{val * CAD_TO_EUR:.2f}" if val else "0.00"
            n += 1
        json.dump(d, open(f, "w"), ensure_ascii=False)
    step(f"sources: {n} products converted CAD → EUR at {CAD_TO_EUR}")
    return True


def patch_importer():
    path = "import_canon.py"
    if not os.path.exists(path):
        step("import_canon.py: not found — skipped")
        return
    s = load(path)
    if "CAD_TO_EUR" in s:
        step("import_canon.py: already converts to EUR")
        return
    s = s.replace('BRAND = "Canon"', '''BRAND = "Canon"

# Canon's file is priced in Canadian dollars. Canon lives in the shared
# catalogue alongside every other vertical (one locale, EUR), so prices are
# converted on the way in. One constant, so the rate is visible.
CAD_TO_EUR = 0.64''', 1)
    s = s.replace('        price = float(r["price"] or 0); sale = float(r["sales_price"] or 0) or price',
                  '        price = float(r["price"] or 0) * CAD_TO_EUR\n'
                  '        sale = (float(r["sales_price"] or 0) * CAD_TO_EUR) or price', 1)
    open(path, "w").write(s)
    step("import_canon.py: prices convert CAD → EUR")


def patch_agent():
    path = "assets/agent.js"
    if not os.path.exists(path):
        step("assets/agent.js: not found — skipped")
        return
    s = load(path)
    if re.search(r"canon:\s*SHARED", s):
        step("assets/agent.js: canon already on the shared agent")
        return
    new = re.sub(
        r"canon:\s*\{[^}]*\}\s*,?(\s*//[^\n]*)?",
        "canon:       SHARED   // Canon — the shared agent, like every other storefront",
        s, count=1)
    if new == s:
        step("assets/agent.js: no canon entry found — add `canon: SHARED` by hand")
        return
    open(path, "w").write(new)
    step("assets/agent.js: canon → the shared agent")


def main():
    if not os.path.exists("verticals.json"):
        sys.exit("Run this from the repo root (no verticals.json here).")
    print("Canon → shared catalogue")
    already = patch_verticals()
    converted = patch_sources(already)
    if converted:
        cfg = json.load(open("verticals.json"))
        cfg["canon"]["_prices_eur"] = True
        json.dump(cfg, open("verticals.json", "w"), indent=2, ensure_ascii=False)
    patch_importer()
    patch_agent()
    print("\nNext: python3 build.py --all   then push.")
    print("In the panel: Eureka + recommendation campaigns filtered on category")
    print("starting \"Cameras & Printing\", scoped to the canon hostname; the")
    print("en_CA locale and its XML integration can be retired.")


if __name__ == "__main__":
    main()
