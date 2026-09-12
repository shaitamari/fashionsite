#!/usr/bin/env python3
"""Bring Canon Canada's catalog into the estate as its own storefront.

    python3 import_canon.py Canon_Canada_ProductCatalog_English_20260806.csv [STG_..._English.xml]

The CSV is the whole shop (1,944 products: cameras, lenses, printers, ink,
toner, paper, accessories, CAD prices). The optional XML is the staging feed
Canon sent later: 78 cameras, but with the specification sheet properly
tagged — the CSV export stripped the tags, gluing label and value together.
Where an id appears in both, the XML's specs are used.

WHAT THIS DOES THAT THE FILE DOES NOT
  * CATEGORIES — sixty overlapping flat values ("All Lenses", "Mirrorless
    Lenses", "Wide-Angle Lenses", "Lens Accessories") and 110 blanks become
    six collections with subcategories, from the category and the title.
  * COMPATIBILITY — the file has none as data. It has sentences: "for use
    with the BC-21e", "compatible with EOS R series". Canon model codes are
    extracted from those sentences into a `compatible_with` attribute so the
    agent can answer "does this ink fit my TS8320" from a field rather than
    from prose. It is DERIVED and marked as such; Canon's PIM has the real
    relationship, and the ask for it goes alongside this build.
  * SPECIFICATIONS — the XML's tagged sheet is flattened into readable text
    appended to the description ("Sensor: …; ISO: …; Weight: …"), and a few
    headline values (megapixels, sensor, weight) become attributes. The CSV's
    tagless sheet is left out: unreadable text helps nobody.
  * CONDITION — New / Refurbished / Damaged Box is kept as an attribute, and
    refurbished goes out as g:condition refurbished. It is a story on its own
    ("open-box deals").
  * IMAGES — 12% have none; those get a spec card, as MISUMI's do.

Writes sources/canon-1..N.json in the Shopify shape build.py reads. The
canon vertical is a separate locale (en_CA / CAD) with its own feed; see
verticals.json.
"""
import csv, glob, hashlib, html, json, os, re, sys, collections
from html import escape

os.chdir(os.path.dirname(os.path.abspath(__file__)))
csv.field_size_limit(10 ** 8)

BRAND = "Canon"

# ---------------------------------------------------------------- taxonomy
# (collection, subcategory, keywords matched against category + title, lowercase, whole words/phrases)
RULES = [
    ("Cameras", "Cinema EOS",        ("cinema eos",)),
    ("Cameras", "Mirrorless",        ("mirrorless", "eos r", "eos m")),
    ("Cameras", "DSLR",              ("dslr", "eos rebel", "eos 5d", "eos 6d", "eos 7d", "eos 90d", "eos 80d", "eos 1d")),
    ("Cameras", "Compact",           ("compact camera", "powershot", "ivy ")),
    ("Cameras", "Video",             ("all video", "camcorder", "vixia", "xa ", "xf ")),
    ("Lenses",  "Wide-Angle",        ("wide-angle", "wide angle")),
    ("Lenses",  "Portrait",          ("portrait len",)),
    ("Lenses",  "Telephoto",         ("telephoto", "super telephoto")),
    ("Lenses",  "Macro",             ("macro",)),
    ("Lenses",  "Standard & Zoom",   ("standard len", "zoom len", "all lenses", "mirrorless lens", "rf ", "ef ", "ef-s ", "ef-m ", "lens ")),
    ("Lenses",  "Lens Accessories",  ("lens accessor", "lens hood", "lens cap", "extender", "teleconverter", "filter")),
    ("Printers", "Home & Photo",     ("home and photo", "pixma", "selphy printer", "photo printer")),
    ("Printers", "Office",           ("business printer", "imageclass", "maxify", "small office", "laser printer", "multifunction", "all-in-one")),
    ("Printers", "Large Format",     ("large format", "imageprograf")),
    ("Printers", "Scanners",         ("scanner", "canoscan", "imageformula")),
    ("Printers", "Printer Accessories", ("printers/scanners/mfp accessor", "printer accessor", "cassette", "duplex", "feeder", "drum unit", "maintenance cartridge", "waste")),
    ("Ink, Toner & Paper", "Ink",    ("ink", "cli-", "pgi-", "bci-", "pg-", "cl-", "gi-", "pfi-")),
    ("Ink, Toner & Paper", "Toner",  ("toner", "crg", "cartridge 0", "cartridge 1", "cartridge 2", "cartridge 3", "cartridge 4", "cartridge 5")),
    ("Ink, Toner & Paper", "Paper",  ("paper", "selphy/ivy", "photo pack", "labels", "envelope")),
    ("Accessories", "Flashes",       ("speedlite", "flash")),
    ("Accessories", "Batteries & Power", ("batter", "charger", "power adapter", "ac adapter", "dc coupler", "lp-e", "nb-")),
    ("Accessories", "Bags & Straps", ("bag", "case", "strap", "backpack", "pouch")),
    ("Accessories", "Memory & Storage", ("memory card", "sd card", "cfexpress", "sandisk")),
    ("Accessories", "Camera Accessories", ("camera accessor", "camcorder accessor", "grip", "remote", "tripod", "microphone", "eyecup", "viewfinder", "adapter", "cable", "mount")),
    ("Other", "Calculators",         ("calculator",)),
    ("Other", "Merchandise",         ("merchandise", "apparel", "t-shirt", "hat", "mug")),
]
FALLBACK = ("Accessories", "Camera Accessories")

PALETTES = {
    "Cameras": ("#2B2B2B", "#0E0E0E", "#E0322B"),
    "Lenses": ("#333B48", "#141920", "#E8E8E8"),
    "Printers": ("#2F3F5C", "#111A2B", "#8FB9FF"),
    "Ink, Toner & Paper": ("#3C2F4F", "#170F22", "#F2C94C"),
    "Accessories": ("#3A3A3A", "#161616", "#BDBDBD"),
    "Other": ("#3F4A40", "#161C17", "#A5D6A7"),
}

# Canon model codes, the way they appear in copy. Order matters: longer,
# more specific patterns first so "PIXMA TS8320" is not cut to "TS".
MODEL_RE = re.compile(r"""
    \b(?:
      EOS\ (?:R\d+\s?(?:Mark\s?[IVX]+)?|Rebel\s?[A-Z]\d+i?|M\d+\s?(?:Mark\s?[IVX]+)?|\d+D\s?(?:Mark\s?[IVX]+)?|R\b|RP|C\d{2,3})
    | PIXMA\ [A-Z]{1,3}\d{3,5}[a-z]?
    | MAXIFY\ [A-Z]{2}\d{3,4}
    | imageCLASS\ [A-Z]{2,3}\d{3,4}[A-Za-z]*
    | imagePROGRAF\ [A-Z]{2,3}-?\d{3,4}
    | SELPHY\ [A-Z]{2}\d{3,4}
    | PowerShot\ [A-Z]{1,3}\d{1,4}\s?[A-Z]{0,3}(?:\s?Mark\s?[IVX]+)?
    | VIXIA\ HF\ [A-Z]\d+
    | (?:CLI|PGI|BCI|PFI|PG|CL|GI|BC|LP-E|NB)-\d+[A-Za-z]{0,3}
    | (?:RF|EF|EF-S|EF-M)\s?\d{1,3}(?:-\d{2,3})?mm
    )
""", re.X | re.I)


def norm(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


def strip_tags(s):
    return norm(re.sub(r"<[^>]+>", " ", s or ""))


def h(seed, mod):
    return int(hashlib.md5(str(seed).encode()).hexdigest(), 16) % mod


def classify(category, title):
    t = f" {category} | {title} ".lower()
    for coll, sub, keys in RULES:
        if any(k in t for k in keys):
            return coll, sub
    return FALLBACK


def parse_specs_xml(x):
    """The tagged sheet from the XML feed -> ordered (label, value) pairs."""
    pairs = []
    for a, v in re.findall(r"<attribute>(.*?)</attribute>\s*<attributevalue>(.*?)</attributevalue>", x or "", re.S):
        a, v = strip_tags(html.unescape(a)), strip_tags(html.unescape(v))
        if a and v:
            pairs.append((a, v))
    return pairs


def compat_from(text, own_title):
    found = []
    for m in MODEL_RE.finditer(text or ""):
        code = re.sub(r"\s+", " ", m.group(0)).strip()
        # Canonical casing: family in caps, model as written by Canon
        # ("PIXMA iP4000", "EOS R6", "CLI-281XL", "EF 70-200mm").
        fam, _, rest = code.partition(" ")
        FAMILY = {"IMAGEPROGRAF": "imagePROGRAF", "IMAGECLASS": "imageCLASS", "POWERSHOT": "PowerShot", "VIXIA": "VIXIA"}
        fam_u = fam.upper()
        code = (FAMILY.get(fam_u, fam_u) + " " + rest.upper()) if rest else code.upper()
        if code.lower() in own_title.lower():
            continue
        if code.lower() not in [f.lower() for f in found]:
            found.append(code)
    return found[:12]


def spec_card(pid, name, coll, sub):
    top, bottom, accent = PALETTES.get(coll, ("#333", "#111", "#ccc"))
    W = 900
    fam = re.sub(r"\s*[\(\[【].*$", "", name).strip()
    lines, cur = [], ""
    for w in fam.split():
        if len(cur) + len(w) + 1 > 26 and cur:
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">',
             f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient></defs>',
             f'<rect width="{W}" height="{W}" fill="url(#g)"/>',
             f'<circle cx="450" cy="360" r="170" fill="none" stroke="{accent}" stroke-width="10"/>',
             f'<circle cx="450" cy="360" r="110" fill="none" stroke="{accent}" stroke-opacity="0.6" stroke-width="6"/>',
             f'<circle cx="450" cy="360" r="40" fill="{accent}" fill-opacity="0.5"/>',
             f'<rect y="620" width="{W}" height="280" fill="#000" fill-opacity="0.35"/>',
             f'<text x="60" y="672" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="{accent}" letter-spacing="3">{escape(coll.upper())} · {escape(sub.upper())}</text>']
    for i, line in enumerate(lines[:3]):
        parts.append(f'<text x="60" y="{728 + i * 50}" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="bold" fill="#fff">{escape(line)}</text>')
    parts.append(f'<text x="60" y="868" font-family="Menlo, Consolas, monospace" font-size="22" fill="#fff" fill-opacity="0.7">CANON {escape(pid)}</text></svg>')
    os.makedirs("assets/img/canon", exist_ok=True)
    out = f"assets/img/canon/{pid}.svg"
    open(out, "w").write("".join(parts))
    return out


HEADLINE = {  # spec label (lowercase, contains) -> attribute
    "megapixel": "megapixels", "effective pixels": "megapixels",
    "sensor size": "sensor", "image sensor": "sensor", "sensor type": "sensor",
    "iso speed range": "iso_range", "iso": "iso_range",
    "weight": "weight",
    "wi-fi": "connectivity", "wireless": "connectivity", "bluetooth": "connectivity",
    "lens mount": "lens_mount", "mount": "lens_mount",
    "print resolution": "print_resolution", "print speed": "print_speed",
}


def headline_attrs(pairs):
    out = {}
    for a, v in pairs:
        al = a.lower()
        for key, attr in HEADLINE.items():
            if key in al and attr not in out and len(v) <= 120:
                out[attr] = v
                break
    return out


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    rows = list(csv.DictReader(open(args[0], encoding="utf-8-sig", errors="replace")))
    xml_specs = {}
    if len(args) > 1:
        x = open(args[1], encoding="utf-8", errors="replace").read()
        for rec in re.split(r"(?=<external_id>)", x)[1:]:
            m = re.search(r"<external_id>(.*?)</external_id>", rec)
            s = re.search(r"<specifications_xml>(.*?)</specifications_xml>", rec, re.S)
            if m and s:
                xml_specs[m.group(1).strip()] = parse_specs_xml(html.unescape(s.group(1)))

    products, counts, skipped = [], collections.Counter(), collections.Counter()
    compat_hits = 0
    for r in rows:
        pid = r["external_id"].strip()
        title = norm(r["title"])
        if not title:
            skipped["no title"] += 1; continue
        price = float(r["price"] or 0); sale = float(r["sales_price"] or 0) or price
        if price <= 0:
            skipped["no price"] += 1; continue
        coll, sub = classify(r.get("category") or "", title)
        counts[(coll, sub)] += 1

        desc = strip_tags(r.get("description") or "")
        over = strip_tags(r.get("overview") or "")
        disc = strip_tags(r.get("disclaimer1") or "")
        box = strip_tags(r.get("in_the_box") or "")
        pairs = xml_specs.get(pid, [])
        spec_text = "; ".join(f"{a}: {v}" for a, v in pairs[:24])

        body = "<p>" + escape(over or desc or title) + "</p>"
        if desc and over and desc.lower() != over.lower():
            body += "<p>" + escape(desc) + "</p>"
        if box:
            body += "<p><b>In the box:</b> " + escape(box) + "</p>"
        if spec_text:
            body += "<p><b>Specifications:</b> " + escape(spec_text) + "</p>"

        compat = compat_from(" ".join([desc, over, disc, box]), title)
        if compat:
            compat_hits += 1
        cond = norm(r.get("condition") or "New") or "New"
        avail = (r.get("availability") or "").strip().lower() == "in stock"
        img = (r.get("image_link") or "").strip()
        if not img.startswith("http"):
            img = spec_card(pid, title, coll, sub)

        extra = {"condition": cond, "compatible_with": ", ".join(compat) if compat else None,
                 "compatibility_source": "derived from product copy" if compat else None}
        extra.update(headline_attrs(pairs))
        products.append({
            "id": int(pid),
            "title": title,
            "handle": re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80] or pid,
            "body_html": body,
            "vendor": BRAND,
            "product_type": f"{coll} > {sub}",
            "tags": [f"Category:{coll}", f"Sub:{sub}", f"Condition:{cond}"] + ([f"Compat:{c}" for c in compat[:5]]),
            "options": [{"name": "Title", "values": ["Default Title"]}],
            "images": [{"src": img}],
            "canon": {k: v for k, v in extra.items() if v},
            "variants": [{
                "id": int(pid), "product_id": int(pid), "title": "Default Title", "option1": "Default Title",
                "sku": r["item_group_id"].strip() or pid,
                "price": f"{sale:.2f}", "compare_at_price": f"{price:.2f}" if price > sale else "0.00",
                "available": avail, "featured_image": {"src": img}, "position": 1,
            }],
        })

    for old in glob.glob("sources/canon-*.json"):
        os.remove(old)
    n = 0
    for start in range(0, len(products), 250):
        n += 1
        json.dump({"products": products[start:start + 250]}, open(f"sources/canon-{n}.json", "w"), ensure_ascii=False)
    print(f"canon: {len(products)} products -> sources/canon-1..{n}.json; {compat_hits} with derived compatibility; {len(xml_specs)} with tagged specs")
    for k, v in skipped.items():
        print(f"  skipped {v}: {k}")
    for (c, s), v in sorted(counts.items()):
        print(f"  {c} > {s}: {v}")


if __name__ == "__main__":
    main()
