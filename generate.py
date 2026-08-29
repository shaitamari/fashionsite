#!/usr/bin/env python3
"""Generate catalogs for verticals that have no Shopify store behind them.

    python3 generate.py hotels
    python3 generate.py --all

Output is written to sources/<key>-1.json in the *same shape as a Shopify
products.json export*, so build.py consumes real and generated catalogs
through exactly the same path. Nothing downstream knows the difference.

Artwork is generated as SVG into assets/img/<key>/. Photography would look
better, but it cannot be sourced reliably or licensed cleanly for a demo, and
a broken image looks far worse than a designed one.
"""
import json, os, sys, random, hashlib

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
SITE = "https://insiderdemo.com"


# ---------------------------------------------------------------- artwork ---
def gradient_art(key, slug, title, subtitle, palette, motif):
    """A destination or product card. Deterministic per slug, so regenerating
    never reshuffles the imagery."""
    seed = int(hashlib.md5(slug.encode()).hexdigest()[:8], 16)
    rnd = random.Random(seed)
    top, bottom, accent = palette
    W, H = 900, 900

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
        '<defs>',
        f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>',
        f'<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="#000" stop-opacity="0"/>'
        f'<stop offset="1" stop-color="#000" stop-opacity="0.42"/></linearGradient>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="url(#sky)"/>',
    ]

    # A low sun, placed consistently per slug.
    sx, sy = rnd.randint(180, 720), rnd.randint(180, 340)
    parts.append(f'<circle cx="{sx}" cy="{sy}" r="{rnd.randint(52, 88)}" '
                 f'fill="{accent}" fill-opacity="0.55"/>')

    if motif == "skyline":
        x = -40
        while x < W + 40:
            w = rnd.randint(52, 122)
            h = rnd.randint(150, 430)
            parts.append(f'<rect x="{x}" y="{H-190-h}" width="{w}" height="{h+190}" '
                         f'fill="#000" fill-opacity="{rnd.uniform(0.16, 0.34):.2f}"/>')
            for row in range(rnd.randint(3, 9)):
                for col in range(max(1, w // 34)):
                    if rnd.random() < 0.42:
                        parts.append(
                            f'<rect x="{x + 12 + col*30}" y="{H-190-h+28+row*42}" '
                            f'width="12" height="18" fill="{accent}" fill-opacity="0.5"/>')
            x += w + rnd.randint(6, 22)

    elif motif == "coast":
        for i, band in enumerate([0.10, 0.18, 0.28]):
            y = H - 300 + i * 90
            parts.append(
                f'<path d="M0 {y} Q {W*0.25} {y-46} {W*0.5} {y} T {W} {y} L {W} {H} L 0 {H} Z" '
                f'fill="#000" fill-opacity="{band}"/>')

    elif motif == "peaks":
        base = H - 150
        x = -60
        while x < W + 60:
            w = rnd.randint(180, 340)
            h = rnd.randint(190, 400)
            parts.append(f'<path d="M{x} {base} L{x + w//2} {base-h} L{x+w} {base} Z" '
                         f'fill="#000" fill-opacity="{rnd.uniform(0.18, 0.32):.2f}"/>')
            x += w // 2

    elif motif == "wing":
        parts.append(
            f'<path d="M{W*0.08} {H*0.72} L{W*0.72} {H*0.30} L{W*0.86} {H*0.36} '
            f'L{W*0.34} {H*0.80} Z" fill="#fff" fill-opacity="0.16"/>')
        parts.append(
            f'<path d="M{W*0.30} {H*0.66} L{W*0.62} {H*0.44} L{W*0.68} {H*0.48} '
            f'L{W*0.36} {H*0.70} Z" fill="#fff" fill-opacity="0.12"/>')
        for i in range(4):
            y = H * 0.20 + i * 42
            parts.append(f'<ellipse cx="{rnd.randint(120, 780)}" cy="{int(y)}" '
                         f'rx="{rnd.randint(70, 150)}" ry="18" fill="#fff" fill-opacity="0.10"/>')

    elif motif == "card":
        cx, cy, cw, ch = 150, 300, 600, 380
        parts.append(f'<rect x="{cx}" y="{cy}" width="{cw}" height="{ch}" rx="30" '
                     f'fill="#000" fill-opacity="0.28"/>')
        parts.append(f'<rect x="{cx+44}" y="{cy+96}" width="86" height="64" rx="10" '
                     f'fill="{accent}" fill-opacity="0.8"/>')
        for i in range(4):
            parts.append(f'<rect x="{cx+44+i*116}" y="{cy+240}" width="84" height="14" rx="7" '
                         f'fill="#fff" fill-opacity="0.42"/>')

    parts.append(f'<rect y="{H-330}" width="{W}" height="330" fill="url(#fade)"/>')
    parts += [
        f'<text x="60" y="{H-118}" font-family="Georgia, serif" font-size="62" fill="#fff">'
        f'{title}</text>',
        f'<text x="62" y="{H-68}" font-family="Helvetica, Arial, sans-serif" font-size="24" '
        f'fill="#fff" fill-opacity="0.78" letter-spacing="3">{subtitle.upper()}</text>',
        '</svg>',
    ]

    out_dir = f"assets/img/{key}"
    os.makedirs(out_dir, exist_ok=True)
    path = f"{out_dir}/{slug}.svg"
    open(path, "w").write("".join(parts))
    # Relative so the site works on any host; build.py makes it absolute in
    # the feed, which is the only place Insider needs a full URL.
    return path


# ------------------------------------------------------------ shopify shape --
def shopify_product(pid, title, handle, product_type, vendor, body, images,
                    option_name, variants, tags):
    """Emit the subset of a Shopify product record that build.py reads."""
    return {
        "id": pid,
        "title": title,
        "handle": handle,
        "body_html": f"<p>{body}</p>",
        "vendor": vendor,
        "product_type": product_type,
        "tags": tags,
        "options": [{"name": option_name,
                     "values": [v["title"] for v in variants]}],
        "images": [{"src": src} for src in images],
        "variants": [
            {
                "id": v["id"],
                "title": v["title"],
                "option1": v["title"],
                "sku": v.get("sku"),
                "price": f"{v['price']:.2f}",
                "compare_at_price": (f"{v['compare']:.2f}" if v.get("compare") else None),
                "available": v.get("available", True),
                "featured_image": None,
            } for v in variants
        ],
    }


# ------------------------------------------------------------------ hotels ---
DESTINATIONS = [
    ("Lisbon",     "Portugal",   "coast",   ("#F6B36B", "#C7527A", "#FFE3A3")),
    ("Kyoto",      "Japan",      "peaks",   ("#F3CBD3", "#8A5D74", "#FFF0E1")),
    ("Reykjavik",  "Iceland",    "peaks",   ("#9FC6D9", "#2E4F66", "#E8F4FA")),
    ("Marrakesh",  "Morocco",    "skyline", ("#F2A65A", "#A8452F", "#FFDDA1")),
    ("Copenhagen", "Denmark",    "coast",   ("#BBD3E0", "#4A6B84", "#F0F6FA")),
    ("Cape Town",  "South Africa","peaks",  ("#F5C77E", "#3D6B72", "#FFEFC7")),
    ("Mexico City","Mexico",     "skyline", ("#F0A6A6", "#7A3B5C", "#FFE0D2")),
    ("Queenstown", "New Zealand","peaks",   ("#A8CBD8", "#35566B", "#EAF6FB")),
    ("Amalfi",     "Italy",      "coast",   ("#FFD9A0", "#2F7A8C", "#FFF3D6")),
    ("Singapore",  "Singapore",  "skyline", ("#C8A8E0", "#3A3A7A", "#F0E4FF")),
    ("Edinburgh",  "Scotland",   "skyline", ("#B9C4D4", "#3E4A61", "#EDF1F7")),
    ("Chiang Mai", "Thailand",   "peaks",   ("#D6E0A0", "#4A6B3D", "#F4F8DC")),
]
HOTEL_STYLES = [
    ("The", "Grand", "Hotels", 5, 420),
    ("The", "Harbour", "Hotels", 4, 260),
    ("Casa", "Luz", "Boutique", 4, 310),
    ("", "Rooftop House", "Boutique", 4, 285),
    ("The", "Old Quarter", "Boutique", 3, 175),
    ("", "Riverside Lodge", "Lodges", 4, 230),
    ("", "Garden Retreat", "Lodges", 5, 495),
    ("The", "Quiet Rooms", "Apartments", 3, 145),
]
ROOM_TYPES = [
    ("Classic Double", 1.00), ("Superior Double", 1.25), ("Deluxe King", 1.55),
    ("Junior Suite", 2.10), ("Terrace Suite", 2.80),
]


def gen_hotels():
    products, pid, vid = [], 8_100_000_000_000, 48_100_000_000_000
    for city, country, motif, palette in DESTINATIONS:
        slug_city = city.lower().replace(" ", "-")
        img = gradient_art("hotels", slug_city, city, country, palette, motif)
        for prefix, name, ptype, stars, base in HOTEL_STYLES:
            pid += 1
            full = " ".join(x for x in (prefix, name, city) if x)
            handle = full.lower().replace(" ", "-")
            variants = []
            for room, mult in ROOM_TYPES:
                vid += 1
                price = round(base * mult / 5) * 5
                variants.append({
                    "id": vid, "title": room, "price": float(price),
                    "compare": float(round(price * 1.18 / 5) * 5) if stars == 5 else None,
                    "sku": f"{handle[:12]}-{room[:3].lower()}",
                    "available": True,
                })
            products.append(shopify_product(
                pid, full, handle, ptype, "Wayfarer",
                f"{stars}-star stay in {city}, {country}. Breakfast included, "
                f"flexible cancellation up to 48 hours before arrival.",
                [img], "Room", variants,
                [city, country, f"{stars} star", ptype]))
    return products


# ---------------------------------------------------------------- airlines ---
ROUTES = [
    ("London", "New York", 1, 340), ("London", "Lisbon", 0, 95),
    ("Paris", "Tokyo", 1, 520), ("Amsterdam", "Cape Town", 1, 470),
    ("Madrid", "Mexico City", 1, 430), ("Berlin", "Reykjavik", 0, 150),
    ("Dublin", "Chicago", 1, 315), ("Zurich", "Singapore", 1, 560),
    ("Rome", "Marrakesh", 0, 130), ("Vienna", "Athens", 0, 110),
    ("Oslo", "Edinburgh", 0, 90), ("Lisbon", "São Paulo", 1, 445),
    ("Copenhagen", "Bangkok", 1, 490), ("Milan", "Casablanca", 0, 125),
    ("Manchester", "Dubai", 1, 380),
]
CABINS = [("Economy", 1.00), ("Premium Economy", 1.75),
          ("Business", 3.40), ("First", 6.20)]


def gen_airlines():
    products, pid, vid = [], 8_200_000_000_000, 48_200_000_000_000
    for origin, dest, longhaul, base in ROUTES:
        pid += 1
        slug = f"{origin}-{dest}".lower().replace(" ", "-").replace("ã", "a")
        title = f"{origin} to {dest}"
        palette = ("#8FB8DE", "#26405C", "#FFE9B0") if longhaul else ("#F4C48A", "#7A4A63", "#FFF1CE")
        img = gradient_art("airlines", slug, dest, f"from {origin}", palette, "wing")
        variants = []
        for cabin, mult in CABINS:
            if not longhaul and cabin == "First":
                continue
            vid += 1
            price = round(base * mult / 5) * 5
            variants.append({
                "id": vid, "title": cabin, "price": float(price),
                "compare": float(round(price * 1.22 / 5) * 5) if cabin == "Economy" else None,
                "sku": f"{slug[:14]}-{cabin[:3].lower()}", "available": True,
            })
        products.append(shopify_product(
            pid, title, slug, "Long Haul" if longhaul else "Short Haul", "Meridian Air",
            f"Direct service from {origin} to {dest}. "
            f"{'Lie-flat seats and lounge access in premium cabins.' if longhaul else 'Two cabin bags included.'}",
            [img], "Cabin", variants,
            [origin, dest, "Long Haul" if longhaul else "Short Haul"]))
    return products


GENERATORS = {"hotels": gen_hotels, "airlines": gen_airlines}

# ------------------------------------------------------------------- banking

CARD_TIERS = [
    ("Everyday", 0, "No annual fee, 0% on purchases for 12 months"),
    ("Rewards", 45, "1.5% back on everything, no category limits"),
    ("Travel", 120, "No FX fees, lounge access, travel insurance included"),
    ("Premier", 320, "Concierge, higher limits, dedicated relationship manager"),
]
ACCOUNTS = [
    ("Current Account", 0, "Everyday banking with fee-free spending abroad"),
    ("Savings Account", 0, "Instant access, interest paid monthly"),
    ("Fixed Saver", 0, "Higher rate, locked for 12 or 24 months"),
    ("Joint Account", 0, "Shared everyday banking for two"),
    ("Business Current", 8, "For sole traders and small companies"),
]
LOANS = [
    ("Personal Loan", "1,000 to 25,000 over 1 to 7 years"),
    ("Car Finance", "Fixed rate, terms to 5 years"),
    ("Home Improvement Loan", "Unsecured, no early repayment fee"),
    ("Debt Consolidation", "One payment, one rate"),
]
MORTGAGES = [
    ("2 Year Fixed", "Fixed for two years, then reverts"),
    ("5 Year Fixed", "Longer certainty, higher rate"),
    ("Tracker", "Follows base rate, no early repayment charge"),
    ("First Time Buyer", "5% deposit accepted"),
    ("Buy to Let", "For landlords, rental cover assessed"),
]
BANK_BRANDS = ["Northbank", "Ardent", "Wexford Financial", "Calder"]


def gen_banking():
    products, pid, vid = [], 8_300_000_000_000, 48_300_000_000_000
    rnd = random.Random(11)
    palette = ("#7FA8C9", "#1E3A57", "#FFE6B8")

    def add(kind, name, price, blurb, variants_spec, ptype):
        nonlocal pid, vid
        pid += 1
        brand = rnd.choice(BANK_BRANDS)
        title = f"{brand} {name}"
        slug = title.lower().replace(" ", "-")
        img = gradient_art("banking", slug, name, brand, palette, "card")
        vs = []
        for label, mult in variants_spec:
            vid += 1
            vs.append({"id": vid, "title": label,
                       "price": float(round(price * mult, 2)) if price else 0.01,
                       "compare": None, "sku": slug[:16], "available": True})
        products.append(shopify_product(pid, title, slug, ptype, brand, blurb,
                                        [img], kind, vs, [brand, ptype]))

    for name, fee, blurb in CARD_TIERS:
        add("Card", f"{name} Credit Card", max(fee, 1), blurb,
            [("Standard", 1.0), ("Plus", 1.4)], "Credit Cards")
    for name, fee, blurb in ACCOUNTS:
        add("Account", name, max(fee, 1), blurb,
            [("Personal", 1.0), ("Premium", 2.5)], "Accounts")
    for name, blurb in LOANS:
        add("Term", name, 1, blurb,
            [("3 years", 1.0), ("5 years", 1.0), ("7 years", 1.0)], "Loans")
    for name, blurb in MORTGAGES:
        add("Term", f"{name} Mortgage", 1, blurb,
            [("60% LTV", 1.0), ("75% LTV", 1.0), ("90% LTV", 1.0)], "Mortgages")
    return products


# ----------------------------------------------------------------- insurance

COVER = [
    ("Car Insurance", "Motor", ["Third Party", "Third Party Fire & Theft", "Comprehensive"], 340),
    ("Home Insurance", "Home", ["Buildings", "Contents", "Buildings & Contents"], 220),
    ("Travel Insurance", "Travel", ["Single Trip", "Annual Multi-Trip", "Backpacker"], 55),
    ("Pet Insurance", "Pet", ["Accident Only", "Time Limited", "Lifetime"], 190),
    ("Life Insurance", "Life", ["Level Term", "Decreasing Term", "Whole of Life"], 260),
    ("Health Insurance", "Health", ["Essential", "Standard", "Comprehensive"], 480),
    ("Landlord Insurance", "Home", ["Buildings", "Contents", "Full Cover"], 310),
    ("Business Insurance", "Business", ["Public Liability", "Professional Indemnity", "Combined"], 420),
    ("Van Insurance", "Motor", ["Third Party", "Comprehensive"], 390),
    ("Gadget Insurance", "Gadget", ["Single Item", "Family Cover"], 70),
]
INS_BRANDS = ["Fairhaven", "Ardent Cover", "Northbank Insure", "Calder Protect"]


def gen_insurance():
    products, pid, vid = [], 8_400_000_000_000, 48_400_000_000_000
    rnd = random.Random(23)
    palette = ("#9CC5B0", "#23503F", "#EAF6EE")
    for name, ptype, levels, base in COVER:
        for brand in rnd.sample(INS_BRANDS, 2):
            pid += 1
            title = f"{brand} {name}"
            slug = title.lower().replace(" ", "-")
            img = gradient_art("insurance", slug, name.replace(" Insurance", ""), brand, palette, "card")
            vs = []
            for i, level in enumerate(levels):
                vid += 1
                vs.append({"id": vid, "title": level,
                           "price": float(round(base * (1 + i * 0.45))),
                           "compare": float(round(base * (1 + i * 0.45) * 1.15)) if i == 0 else None,
                           "sku": f"{slug[:14]}-{i}", "available": True})
            products.append(shopify_product(
                pid, title, slug, ptype, brand,
                f"{name} from {brand}. Cover starts the day you buy, cancel any time in the "
                f"first 14 days.", [img], "Level of cover", vs, [brand, ptype]))
    return products


# ------------------------------------------------------------------- fintech

FINTECH = [
    ("Personal Plan", "Plans", ["Free", "Plus", "Premium", "Metal"], 0),
    ("Business Plan", "Plans", ["Starter", "Growth", "Scale"], 12),
    ("Currency Account", "Accounts", ["Personal", "Business"], 0),
    ("Investment Account", "Investing", ["General", "Tax-Free", "Pension"], 0),
    ("Crypto Wallet", "Investing", ["Standard", "Pro"], 0),
    ("Expense Cards", "Business", ["5 cards", "20 cards", "Unlimited"], 25),
    ("Payment Links", "Business", ["Standard", "Pro"], 15),
    ("Payroll", "Business", ["Up to 10", "Up to 50", "Unlimited"], 40),
]
FIN_BRANDS = ["Loop", "Kite Money", "Vantage", "Orbit"]


def gen_fintech():
    products, pid, vid = [], 8_500_000_000_000, 48_500_000_000_000
    rnd = random.Random(31)
    palette = ("#B8A8E8", "#2C2557", "#F2ECFF")
    for name, ptype, tiers, base in FINTECH:
        for brand in rnd.sample(FIN_BRANDS, 2):
            pid += 1
            title = f"{brand} {name}"
            slug = title.lower().replace(" ", "-")
            img = gradient_art("fintech", slug, name, brand, palette, "card")
            vs = []
            for i, tier in enumerate(tiers):
                vid += 1
                price = base + i * 9 if base or i else 1
                vs.append({"id": vid, "title": tier, "price": float(price),
                           "compare": None, "sku": f"{slug[:14]}-{i}", "available": True})
            products.append(shopify_product(
                pid, title, slug, ptype, brand,
                f"{name} from {brand}. No minimum balance, cancel any time, "
                f"everything managed from the app.", [img], "Tier", vs, [brand, ptype]))
    return products


GENERATORS.update({"banking": gen_banking, "insurance": gen_insurance,
                   "fintech": gen_fintech})



def write(key):
    products = GENERATORS[key]()
    os.makedirs("sources", exist_ok=True)
    path = f"sources/{key}-1.json"
    json.dump({"products": products}, open(path, "w"), indent=1)
    variants = sum(len(p["variants"]) for p in products)
    print(f"  {key:10s} {len(products):4d} products / {variants:4d} variants  ->  {path}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        print("available:", ", ".join(GENERATORS))
        sys.exit(0)
    keys = list(GENERATORS) if args[0] == "--all" else args
    for k in keys:
        if k not in GENERATORS:
            print(f"  ! no generator for {k}")
            continue
        write(k)
    print("\nNow add config blocks to verticals.json and run: python3 build.py --all")
