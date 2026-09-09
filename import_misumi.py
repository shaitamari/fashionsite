#!/usr/bin/env python3
"""Bring the MISUMI catalog export into the estate as its own storefront.

    python3 import_misumi.py path/to/responses/          # a folder of response*.json
    python3 import_misumi.py path/to/response1.json ...  # or the files themselves

The export is the Insider catalog API's scroll output: name, item id, price
in THB and a stock flag — no images, no categories, no URLs, no descriptions.
So this does three things the salesdemo import never had to:

  * CLASSIFIES each product into a collection and subcategory from its name
    ("HM90 F90AP Face Mill" -> Cutting Tools > Milling), since a search demo
    with no categories has nothing to facet on;
  * DRAWS a spec card per product (SVG, deterministic per part number) so
    every card and page has an image — industrial parts have no
    photography we can source cleanly, and a broken image is worse than a
    designed one;
  * NORMALISES price to EUR and marks the range in stock, since the export
    carries every item as out of stock, which would leave nothing to buy.

Writes sources/misumi-1..N.json in the Shopify shape build.py reads.
"""
import glob, json, os, re, sys, hashlib, collections
from html import escape

os.chdir(os.path.dirname(os.path.abspath(__file__)))

THB_TO_EUR = 0.026
BRAND = "MISUMI"

# Order matters: the first rule whose keywords hit wins. Specific before broad.
CATEGORIES = [
    ("Cutting Tools", "Milling",      ("face mill", "end mill", "slot mill", "milling", "insert", "cutter")),
    ("Cutting Tools", "Drilling",     ("drill", "reamer", "tap ", "tapping", "countersink", "diamond bit", "bit set", "bit ")),
    ("Cutting Tools", "Blades",       ("blade", "saw", "shear", "knife", "cutting wheel", "grinding", "abrasive", "file")),
    ("Hand Tools",    "Wrenches",     ("wrench", "spanner", "ratchet", "socket", "hex key", "allen")),
    ("Hand Tools",    "Workholding",  ("vise", "vice", "clamp", "chuck", "jig")),
    ("Hand Tools",    "Tool Sets",    ("tool set", "tool kit", "screwdriver", "pliers", "hammer", "crimper", "crimping", "nipper", "tweezers")),
    ("Fasteners",     "Screws & Bolts", ("screw", "bolt", "stud", "thread")),
    ("Fasteners",     "Nuts & Washers", ("nut ", "nuts", "washer", "rivet", "anchor", "dowel", "pin ", "clip", "clasp")),
    ("Motion & Drives", "Bearings",   ("bearing", "bushing", "linear guide", "shaft", "coupling")),
    ("Motion & Drives", "Actuators",  ("actuator", "slider", "cylinder", "cam unit", "cam ", "servo", "servomotor", "stepping motor", "motor", "gear", "pulley", "belt", "conveyor")),
    ("Electrical & Control", "Switchgear", ("breaker", "disconnect", "switch", "relay", "contactor", "fuse")),
    ("Electrical & Control", "Automation", ("controller", "plc", "hmi", "got1000", "inverter", "sensor", "encoder", "module", "unit", "power supply", "transformer")),
    ("Electrical & Control", "Cables & Connectors", ("cable", "wire", "connector", "terminal", "harness", "cord", "thermocouple", "enclosure", "junction box")),
    ("Pneumatics & Fluid", "Pumps & Valves", ("pump", "valve", "regulator", "compressor", "solenoid")),
    ("Pneumatics & Fluid", "Hose & Fittings", ("hose", "fitting", "tube", "tubing", "pipe", "nozzle", "coupler", "reel", "pressure tank", "tank")),
    ("Lab & Measurement", "Lab Equipment", ("centrifuge", "water bath", "incubator", "laboratory", "beaker", "flask", "pipette", "test paper", "stirrer", "shaker", "petri", "as one")),
    ("Lab & Measurement", "Measuring",   ("level", "gauge", "caliper", "micrometer", "scale", "meter", "thermometer", "indicator", "tester", "microscope", "ruler", "square")),
    ("Storage & Furniture", "Cabinets & Shelving", ("cabinet", "shelf", "shelving", "rack", "locker", "drawer")),
    ("Storage & Furniture", "Benches & Carts", ("bench", "table", "cart", "trolley", "chair", "lounge", "stool", "desk", "ladder", "step")),
    ("Safety & Facility", "Facility",   ("fan", "light", "lamp", "heater", "air conditioner", "spring balancer", "balancer", "hoist", "sling", "vacuum", "cleaner", "blower")),
    ("Safety & Facility", "Safety",     ("glove", "helmet", "goggle", "mask", "mat", "sign", "safety", "guard", "earplug", "vest", "boot")),
    ("Materials & Consumables", "Adhesives & Tapes", ("adhesive", "tape", "sealant", "grease", "lubricant", "oil", "paint", "cleaner", "spray")),
    ("Materials & Consumables", "Raw Materials", ("plate", "sheet", "bar", "rod", "steel", "aluminum", "aluminium", "resin", "rubber", "foam", "block", "profile", "rail", "flange", "wheel", "caster", "spring", "stopper", "handwheel", "leg", "post", "stand", "frame")),
    # second pass, broader nets for what the specific rules missed
    ("Electrical & Control", "Automation", ("panel", "display", "monitor", "reader", "detector", "filter", "supply", "series (", "ekip", "emax", "compact", "platform", "electronic", "electric", "code", "station")),
    ("Safety & Facility", "Facility",   ("lifter", "stacker", "crane", "hoist", "trash", "cleaning", "clean", "mop", "brush", "wiper", "container", "wagon", "lantern", "dust", "waterproof", "door", "airbrush", "lubricator", "blanket", "clothes", "work clothes", "hood")),
    ("Lab & Measurement", "Measuring",   ("balance", "calibration", "paper", "cup", "sieve", "detection", "detector", "stage", "edge", "port")),
    ("Hand Tools", "Tool Sets",          ("set", "kit", "pickup", "puncher", "stone", "mill")),
]
FALLBACK = ("Materials & Consumables", "General")

PALETTES = {
    "Cutting Tools":           ("#2F3E50", "#0F1822", "#F2B84B"),
    "Hand Tools":              ("#3B4A5A", "#151E28", "#E8873A"),
    "Fasteners":               ("#4A5568", "#1C2430", "#C9D2DE"),
    "Motion & Drives":         ("#2A4A6B", "#0E1F33", "#5FB4E6"),
    "Electrical & Control":    ("#2E3A66", "#111737", "#F5D547"),
    "Pneumatics & Fluid":      ("#1F5A66", "#0B2A33", "#5EDBD4"),
    "Lab & Measurement":       ("#3F3B6B", "#181535", "#B9A7F0"),
    "Storage & Furniture":     ("#4E4A44", "#1F1C18", "#D9C08F"),
    "Safety & Facility":       ("#5A3B2E", "#2A1811", "#F0A05A"),
    "Materials & Consumables": ("#3F4F45", "#161F1A", "#9FD9B0"),
}


def classify(name):
    t = " " + name.lower() + " "
    for coll, sub, keys in CATEGORIES:
        if any(k in t for k in keys):
            return coll, sub
    return FALLBACK


def h(seed, mod):
    return int(hashlib.md5(seed.encode()).hexdigest(), 16) % mod


def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines[:3]


def spec_card(item_id, name, coll, sub):
    """A 900x900 spec card: category colour, a technical grid, a glyph that
    varies by part number, the product family in large type and the part
    number below. Looks like a catalogue tile, which is what it is."""
    top, bottom, accent = PALETTES.get(coll, ("#333", "#111", "#ccc"))
    W = 900
    r = h(item_id, 1000)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">',
        '<defs>',
        f'<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{top}"/>'
        f'<stop offset="1" stop-color="{bottom}"/></linearGradient>',
        '<pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">'
        '<path d="M60 0H0V60" fill="none" stroke="#fff" stroke-opacity="0.07"/></pattern>',
        '</defs>',
        f'<rect width="{W}" height="{W}" fill="url(#g)"/>',
        f'<rect width="{W}" height="{W}" fill="url(#grid)"/>',
    ]
    # Glyph: a technical drawing that differs per part — rings, a slotted
    # block, or a bolt profile — chosen from the id so it never reshuffles.
    kind = r % 3
    cx, cy = 450, 380
    if kind == 0:
        for i, rad in enumerate((190, 140, 90, 40)):
            parts.append(f'<circle cx="{cx}" cy="{cy}" r="{rad}" fill="none" stroke="{accent}" '
                         f'stroke-opacity="{0.9 - i*0.18:.2f}" stroke-width="{6 if i else 10}"/>')
        parts.append(f'<line x1="{cx-230}" y1="{cy}" x2="{cx+230}" y2="{cy}" stroke="{accent}" stroke-opacity="0.35" stroke-dasharray="14 10"/>')
        parts.append(f'<line x1="{cx}" y1="{cy-230}" x2="{cx}" y2="{cy+230}" stroke="{accent}" stroke-opacity="0.35" stroke-dasharray="14 10"/>')
    elif kind == 1:
        parts.append(f'<rect x="{cx-220}" y="{cy-140}" width="440" height="280" rx="18" fill="none" stroke="{accent}" stroke-width="10"/>')
        for i in range(4):
            parts.append(f'<rect x="{cx-180+i*100}" y="{cy-90}" width="60" height="180" rx="8" fill="{accent}" fill-opacity="0.35"/>')
        parts.append(f'<line x1="{cx-220}" y1="{cy+190}" x2="{cx+220}" y2="{cy+190}" stroke="{accent}" stroke-opacity="0.6" stroke-width="3"/>')
        parts.append(f'<text x="{cx}" y="{cy+230}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="{accent}" fill-opacity="0.8">440</text>')
    else:
        parts.append(f'<polygon points="{cx-140},{cy-200} {cx+140},{cy-200} {cx+190},{cy-120} {cx+140},{cy-40} {cx-140},{cy-40} {cx-190},{cy-120}" fill="none" stroke="{accent}" stroke-width="10"/>')
        parts.append(f'<rect x="{cx-45}" y="{cy-40}" width="90" height="260" fill="{accent}" fill-opacity="0.35"/>')
        for i in range(8):
            y = cy - 20 + i * 32
            parts.append(f'<line x1="{cx-45}" y1="{y}" x2="{cx+45}" y2="{y+10}" stroke="{accent}" stroke-width="4"/>')

    parts.append(f'<rect y="620" width="{W}" height="280" fill="#000" fill-opacity="0.35"/>')
    parts.append(f'<text x="60" y="672" font-family="Helvetica, Arial, sans-serif" font-size="22" '
                 f'fill="{accent}" letter-spacing="3">{escape(coll.upper())} · {escape(sub.upper())}</text>')
    family = re.sub(r"\s*[\(\[【].*$", "", name).strip()
    for i, line in enumerate(wrap(family, 30)):
        parts.append(f'<text x="60" y="{728 + i*50}" font-family="Helvetica, Arial, sans-serif" '
                     f'font-size="40" font-weight="bold" fill="#fff">{escape(line)}</text>')
    parts.append(f'<text x="60" y="868" font-family="Menlo, Consolas, monospace" font-size="22" '
                 f'fill="#fff" fill-opacity="0.7">PART {escape(item_id)}</text>')
    parts.append("</svg>")
    out = f"assets/img/misumi/{item_id}.svg"
    os.makedirs("assets/img/misumi", exist_ok=True)
    open(out, "w").write("".join(parts))
    return out


def load(paths):
    items = {}
    for p in paths:
        for it in json.load(open(p)).get("data", []):
            items[it["item_id"]] = it
    return list(items.values())


def to_shopify(it, coll, sub, image):
    name = it["name"].strip()
    thb = next(iter((it.get("price") or {}).values()), 0) or 0
    orig = next(iter((it.get("original_price") or {}).values()), 0) or 0
    price = round(float(thb) * THB_TO_EUR, 2)
    compare = round(float(orig) * THB_TO_EUR, 2) if orig and orig > thb else 0
    pid = int(it["item_id"])
    # The export marks everything out of stock. A demo store needs things to
    # buy, so ~8% stay out — enough for a back-in-stock beat, not so many the
    # grid looks abandoned.
    available = h(it["item_id"] + "s", 100) >= 8
    return {
        "id": pid,
        "title": name,
        "handle": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:80] or it["item_id"],
        "body_html": f"<p>{escape(name)}. Part number {it['item_id']}. Supplied by {BRAND}.</p>",
        "vendor": BRAND,
        "product_type": f"{coll} > {sub}",
        "tags": [f"Category:{coll}", f"Sub:{sub}"],
        "options": [{"name": "Title", "values": ["Default Title"]}],
        "images": [{"src": image}],
        "variants": [{
            "id": pid,
            "product_id": pid,
            "title": "Default Title",
            "option1": "Default Title",
            "sku": it["item_id"],
            "price": f"{price:.2f}",
            "compare_at_price": f"{compare:.2f}" if compare else "0.00",
            "available": available,
            "featured_image": {"src": image},
            "position": 1,
        }],
    }


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    paths = []
    for a in args:
        paths += sorted(glob.glob(os.path.join(a, "response*.json"))) if os.path.isdir(a) else [a]
    items = load(paths)
    products, skipped, counts = [], collections.Counter(), collections.Counter()
    for it in items:
        name = (it.get("name") or "").strip()
        if not name or name.lower().startswith("search results"):
            skipped["junk name"] += 1
            continue
        thb = next(iter((it.get("price") or {}).values()), 0) or 0
        if thb <= 0:
            skipped["no price"] += 1
            continue
        coll, sub = classify(name)
        counts[(coll, sub)] += 1
        image = spec_card(it["item_id"], name, coll, sub)
        products.append(to_shopify(it, coll, sub, image))

    for old in glob.glob("sources/misumi-*.json"):
        os.remove(old)
    n = 0
    for start in range(0, len(products), 250):
        n += 1
        json.dump({"products": products[start:start + 250]},
                  open(f"sources/misumi-{n}.json", "w"), ensure_ascii=False)
    print(f"misumi: {len(products)} products -> sources/misumi-1..{n}.json, {len(products)} spec cards drawn")
    for k, v in skipped.items():
        print(f"  skipped {v}: {k}")
    for (c, s), v in sorted(counts.items()):
        print(f"  {c} > {s}: {v}")


if __name__ == "__main__":
    main()
