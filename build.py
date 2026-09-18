#!/usr/bin/env python3
"""Build catalogs and XML feeds for every vertical.

    python3 build.py beauty      # one vertical
    python3 build.py --all       # every vertical in verticals.json
    python3 build.py --list      # what's configured and whether it has a source

Outputs per vertical <key>:
    catalogs/<key>.js    window.CATALOG + window.COLLECTIONS + window.VERTICAL
    feeds/<key>.xml      Google Merchant feed for Insider XML integration

Feed format notes, learned from a failed validation and encoded here:
  - prices are BARE NUMBERS; "105.00 USD" is rejected
  - the title tag must be g:title, not title
  - g:sale_price goes on EVERY item, because Insider marks price.USD required
"""
import json, os, re, sys, glob, collections, datetime, hashlib
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.abspath(__file__))
APEX = "insiderdemo.com"
SITE_ABS = f"https://{APEX}"


def site_for(key):
    """Each vertical gets its own hostname so campaign rules can't collide.

    A vertical may override it with "hostname" in verticals.json, for the
    cases where the storefront does not live at <key>.<apex> — Canon is on
    canon-sandbox.insiderdemo.com, not canon.insiderdemo.com."""
    override = (VERTICALS.get(key) or {}).get("hostname")
    if override:
        return f"https://{override}"
    return f"https://{key}.{APEX}"

os.chdir(ROOT)
CONFIG = json.load(open("verticals.json"))
ENVS = CONFIG.get("_environments", {})
# Catalog records carry the locale and currency of the environment they will
# be loaded into. Both environments share these today.
ENV = ENVS.get("default", {})
LOCALE = ENV.get("locale", "en_US")
CURRENCY = ENV.get("currency", "USD")
VERTICALS = {k: v for k, v in CONFIG.items() if not k.startswith("_")}
PLANNED = {k[9:]: v for k, v in CONFIG.items() if k.startswith("_planned_")}


# --------------------------------------------------------------------------
def clean(html, limit=400):
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    for a, b in [("&amp;", "&"), ("&nbsp;", " "), ("&quot;", '"'), ("&#39;", "'"),
                 ("&lt;", "<"), ("&gt;", ">"), ("&rsquo;", "'"), ("&ndash;", "-")]:
        text = text.replace(a, b)
    return re.sub(r"\s+", " ", text).strip()[:limit]


def money(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


def subcategory(title, collection, cfg, ptype=""):
    # A vertical can name the subcategory straight from the product type
    # ("Women's Tops" -> "Tops") and only fall back to title keywords when the
    # type is too coarse to say. The salesdemo import relies on this.
    direct = cfg.get("type_subcats", {}).get(ptype)
    if direct:
        return direct
    t = title.lower()
    for name, keys in cfg.get("subcats", {}).get(collection, []):
        if any(k in t for k in keys):
            return name
    return cfg.get("defaults", {}).get(collection, collection)


# --------------------------------------------------------------------------
# Variant options.
#
# Shopify already separates a variant's options: `option1`, `option2` and
# `option3` line up positionally with the names in `product["options"]`.
# The previous build ignored those and read `variant["title"]`, which is the
# JOINED string — "Chocolate / AU 4" — then guessed which field to put the
# whole thing in from the FIRST option name only. That is the single upstream
# cause of the compound `g:color`, the duplicate swatches, the broken Colour
# and Size facets, and the 64 fashion styles whose colourway could not be read.
#
# Reading option1..3 instead removes the guess entirely. No splitting, no
# heuristics: the values arrive clean and stay clean.
#
# The role of each option is decided by its NAME, checked against the real
# names across all twelve verticals (`Shade`, `COLOR`, `Upholstery`,
# `Leg Finish`, `Italian Size MEN`, `Room`, `Cabin`, `Tier` and so on).
# Size is tested before colour so "Frame Size" is a size, and "style" is
# excluded from colour so "Leg Style" (Hairpin, Straight) is not mistaken for
# one.
SIZE_HINTS = ("size", "length", "capacity", "volume", "dimension")
COLOR_HINTS = ("colour", "color", "shade", "upholstery", "fabric", "finish",
               "wood", "panel", "leg", "hardware", "material")
NULL_OPTIONS = ("title", "defaulttitle", "default title")


# --- colour families -------------------------------------------------------
# `g:color` carries the FAMILY, not the shade name. The raw values were 668
# distinct across the catalogue — "Camel - Top Grain Leather", "Georgia Clay -
# Performance Chenille", "Crushed Gravel" — which makes a colour facet a paint
# chart and a merchandising rule a per-value chore. Families are the unit a
# merchandiser works in: bury grey, boost black.
#
# The shade name is NOT lost: the PDP reads the variant's own title, so the
# chips still say "Camel - Top Grain Leather". This is the facet value only.
#
# Matching is by the EARLIEST colour word in the string, so "Dark Navy" is
# blue and "Sandstone" beats "sand". Anything with no colour word at all comes
# back None and the product simply has no colour — better than a wrong family.
COLOR_FAMILY_WORDS = {'black': ['black', 'phantom', 'midnight', 'obsidian', 'onyx', 'jet', 'ink', 'carbon', 'noir', 'raven'], 'white': ['white', 'ivory', 'cream', 'chalk', 'snow', 'talc', 'coconut', 'vanilla', 'pearl', 'crema', 'porcelain', 'gardenia', 'powder', 'lily', 'alabaster'], 'grey': ['grey', 'gray', 'charcoal', 'slate', 'granite', 'pewter', 'smoke', 'fog', 'shale', 'gravel', 'ash', 'graphite', 'cloud', 'storm', 'steel', 'stone', 'pebble', 'flint', 'mineral', 'mushroom', 'dove', 'quarry', 'concrete', 'zinc', 'clear'], 'metallic': ['silver', 'platinum', 'stainless', 'gold', 'bronze', 'copper', 'chrome', 'brass', 'gunmetal'], 'blue': ['blue', 'navy', 'cobalt', 'azure', 'sky', 'denim', 'indigo', 'marine', 'teal', 'turquoise', 'aqua', 'agate', 'coastal', 'seaglass', 'glacier', 'iris', 'aurora', 'lagoon', 'harbour', 'harbor', 'cornflower'], 'green': ['green', 'mint', 'sage', 'olive', 'moss', 'forest', 'lichen', 'lime', 'jade', 'nori', 'khaki', 'fern', 'eucalyptus', 'kiwi', 'sherwood', 'juniper', 'cypress', 'basil', 'pistachio', 'avocado', 'seafoam', 'emerald'], 'red': ['red', 'chilli', 'cherry', 'wine', 'burgundy', 'maroon', 'ruby', 'coral', 'salmon', 'brick', 'scarlet', 'crimson', 'clay', 'safflower', 'strawberry', 'madder', 'garnet', 'poppy', 'paprika'], 'pink': ['pink', 'blush', 'rose', 'raspberry', 'magenta', 'fuchsia', 'peony', 'petal', 'flamingo', 'peony', 'guava', 'sorbet'], 'purple': ['purple', 'lilac', 'lavender', 'violet', 'plum', 'mulberry', 'fig', 'aubergine', 'amethyst'], 'orange': ['orange', 'apricot', 'peach', 'terra', 'rust', 'sienna', 'mango', 'tangerine', 'papaya', 'ochre', 'marigold', 'persimmon', 'clementine'], 'yellow': ['yellow', 'butter', 'mustard', 'honey', 'champagne', 'amber', 'saffron', 'lemon'], 'brown': ['brown', 'chocolate', 'cocoa', 'espresso', 'chestnut', 'walnut', 'oak', 'birch', 'almond', 'tan', 'camel', 'caramel', 'toast', 'mud', 'umami', 'mocha', 'hazel', 'cedar', 'tortoiseshell', 'tort', 'leather', 'truffle', 'cinnamon', 'pecan', 'acorn', 'driftwood', 'bark'], 'beige': ['beige', 'sand', 'sandstone', 'taupe', 'oyster', 'oatmeal', 'natural', 'linen', 'biscuit', 'wheat', 'bone', 'nude', 'opalite', 'barley', 'parchment', 'flax', 'sisal', 'jute', 'putty'], 'multi': ['multi', 'check', 'floral', 'stripe', 'print', 'pattern', 'zebra', 'tiger', 'leopard', 'rainbow', 'assorted', 'prism', 'starry', 'glimmer', 'shimmer', 'highlighter', 'varsity', 'colourblock', 'colorblock']}

# word -> family, longest first so "sandstone" wins over "sand".
_FAMILY_BY_WORD = {w: fam for fam, ws in COLOR_FAMILY_WORDS.items() for w in ws}
_FAMILY_KEYS = sorted(_FAMILY_BY_WORD, key=len, reverse=True)


def _squash(value):
    """Loose comparison form: 'Tweed & Net' and 'Tweed and Net' both collapse
    to 'tweedandnet', so a title that already names the shade is left alone."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower().replace("&", "and"))


def color_family(value):
    """'Brown' for 'Camel - Top Grain Leather'. None when nothing matches."""
    t = str(value or "").lower()
    if not t:
        return None
    best, best_at = None, len(t) + 1
    for w in _FAMILY_KEYS:
        at = t.find(w)
        if at > -1 and at < best_at:
            best_at, best = at, w
    if best is None:
        return None
    fam = _FAMILY_BY_WORD[best]
    return "Multi" if fam == "multi" else fam.capitalize()


def option_role(name):
    """'size', 'color', 'other', or None for Shopify's placeholder option."""
    n = str(name or "").strip().lower()
    if not n or n in NULL_OPTIONS:
        return None
    if "style" in n and "colour" not in n and "color" not in n:
        return "other"
    # "Upholstery Add On" holds "Queen/Headboard Upholstery" — a configuration
    # choice that happens to contain an upholstery word. Without this it wins
    # the colour slot ahead of "Upholstered Fabric", which is the real colour,
    # because the first colour-ish option encountered takes it.
    if "add on" in n or "add-on" in n or "addon" in n:
        return "other"
    if any(h in n for h in SIZE_HINTS):
        return "size"
    if any(h in n for h in COLOR_HINTS):
        return "color"
    return "other"


def split_options(product, variant):
    """Clean {color, size, tier, ...} for one variant, plus the label of each
    dimension so the front end can call a chip row "Room" rather than "Size".

    `tier` is the first option that is neither a colour nor a size — a hotel
    Room, an airline Cabin, a fintech Tier, an insurance Level of cover. It is
    kept separate from `size` here so the two never contaminate each other,
    even though the feed still falls back to g:size for it (see feed_item)."""
    names = [o.get("name") for o in product.get("options", [])] or ["Title"]
    values = [variant.get("option1"), variant.get("option2"), variant.get("option3")]

    out = {"color": None, "color_label": None,
           "size": None, "size_label": None,
           "tier": None, "tier_label": None,
           "extras": [], "parts": []}

    for name, value in zip(names, values):
        value = (value or "").strip()
        if not value or value in ("Default Title", "DefaultTitle"):
            continue
        role = option_role(name)
        if role is None:
            continue
        if role in ("color", "size") and out[role] is None:
            out[role] = value
            out[role + "_label"] = name
            slot = role
        elif role == "other" and out["tier"] is None:
            out["tier"] = value
            out["tier_label"] = name
            slot = "tier"
        else:
            # Third and fourth dimensions: home's Arm Style, Configuration,
            # Power. Kept so nothing is lost, not promoted to a facet.
            out["extras"].append({"name": name, "value": value})
            slot = "extra"

        # Source order, with where each option ACTUALLY landed rather than what
        # the classifier thought of it. A product with two colour-ish options —
        # home's Fabric and Leg Finish — puts the first in `color` and the
        # second in `extras`, and only the first should be treated as the
        # colour downstream. The renderer needs that distinction to know which
        # token is safe to hide, so it is recorded rather than re-derived.
        out["parts"].append({"name": name, "value": value, "slot": slot})

    return out


def load_sources(cfg):
    """`source` may be one path, a list of paths, or a glob.

    Shopify caps products.json at 250 per page, so a large catalog arrives as
    several files: sources/beauty-1.json, -2.json and so on. They are merged
    here and deduplicated on product id, which makes overlapping page dumps
    harmless.
    """
    spec = cfg["source"]
    paths = []
    for pattern in ([spec] if isinstance(spec, str) else spec):
        hits = sorted(glob.glob(pattern))
        if not hits and os.path.exists(pattern):
            hits = [pattern]
        paths.extend(hits)

    if not paths:
        raise FileNotFoundError(f"no source files matched: {spec}")

    products, seen, dupes = [], set(), 0
    for path in paths:
        batch = json.load(open(path)).get("products", [])
        for p in batch:
            pid = str(p.get("id"))
            if pid in seen:
                dupes += 1
                continue
            seen.add(pid)
            products.append(p)

    return products, paths, dupes


# --------------------------------------------------------------------------
# Enrichment: rating, margin, activation date, season, gender, material.
#
# The salesdemo catalog carries these for its own products (the search team
# tuned on them). Every other product in the estate gets a value too, chosen
# deterministically from the product id so a rebuild never reshuffles them.
# A merchandiser can then boost by margin, sort by rating, facet on gender or
# material, and "new in" means something — on every vertical, not one.
#
# Activation dates are ALWAYS regenerated, even where the source has one: the
# source dates are all the day the catalog was imported, which says nothing.
# They spread past / recent / future relative to the build date, so a rebuild
# is what moves a product from "coming soon" to "new in".

GENDER_VERTICALS = {"fashion", "luxury"}
MATERIAL_VERTICALS = {"fashion", "luxury", "home"}
SEASON_VERTICALS = {"fashion", "luxury"}

MATERIALS = [
    # (keywords in subcategory or title, choices)
    (("knit", "sweater", "cardigan", "jumper", "cashmere", "wool"), ["Wool", "Cashmere", "Merino Wool", "Cotton"]),
    (("jean", "denim"), ["Denim"]),
    (("coat", "jacket", "blazer", "trench", "parka"), ["Wool", "Cotton", "Polyester", "Leather", "Nylon"]),
    (("dress", "blouse", "skirt", "slip", "gown"), ["Viscose", "Silk", "Cotton", "Linen", "Polyester"]),
    (("shirt", "tee", "t-shirt", "top", "tunic", "trouser", "pant", "short", "chino"), ["Cotton", "Linen", "Cotton, Elastane", "Polyester"]),
    (("sneaker", "trainer", "runner"), ["Leather", "Canvas", "Mesh", "Suede"]),
    (("boot", "loafer", "heel", "sandal", "flat", "shoe", "pump"), ["Leather", "Suede", "Patent Leather"]),
    (("bag", "belt", "wallet", "clutch", "tote", "purse"), ["Leather", "Canvas", "Suede", "Nylon"]),
    (("ring", "necklace", "bracelet", "earring", "jewel", "cuff", "pendant"), ["Sterling Silver", "Gold-plated Brass", "18k Gold", "Stainless Steel"]),
    (("sock", "scarf", "hat", "beanie", "glove", "mitten"), ["Cotton", "Wool", "Cashmere"]),
    (("sunglass", "glasses"), ["Acetate", "Metal"]),
    (("sofa", "seating", "sectional", "chair", "armchair", "ottoman", "bench", "stool"), ["Velvet", "Linen", "Leather", "Boucle", "Performance Fabric"]),
    (("table", "shelv", "desk", "console", "drawer", "cabinet", "bed", "frame"), ["Oak", "Walnut", "Ash", "Powder-coated Steel", "Marble"]),
    (("pillow", "throw", "cushion", "blanket", "sheet", "duvet"), ["Linen", "Cotton", "Wool", "Velvet"]),
    (("outdoor", "patio", "garden"), ["Teak", "Powder-coated Aluminium", "Rattan"]),
    (("lamp", "light"), ["Brass", "Steel", "Glass"]),
]


def _h(seed, mod):
    return int(hashlib.md5(str(seed).encode()).hexdigest(), 16) % mod


def _pick(seed, choices):
    return choices[_h(seed, len(choices))]


def enrich(rec, key, extra, today):
    seed = rec["groupcode"]
    words = (rec["subcategory"] + " " + rec["collection"] + " " + rec["name"]).lower()

    # rating: 1 dp, skewed to the good end like a real store
    if extra.get("rating") is not None:
        rec["rating"] = round(float(extra["rating"]), 1)
    else:
        rec["rating"] = round(3.4 + _h(seed + "r", 16) / 10, 1)        # 3.4 .. 4.9

    # margin: percent, in steps of 5
    if extra.get("margin") is not None:
        # Source margins arrive as 0 and 100 on a few dozen rows; neither
        # is a margin anyone would merchandise on.
        rec["margin"] = min(65, max(20, int(extra["margin"])))
    else:
        rec["margin"] = 20 + 5 * _h(seed + "m", 10)                    # 20 .. 65

    # activation date: 60% older, 25% last month, 15% still to come
    bucket = _h(seed + "d", 100)
    if bucket < 60:
        days = -(31 + _h(seed + "d1", 510))                            # -31 .. -540
    elif bucket < 85:
        days = -_h(seed + "d2", 31)                                    # -30 .. 0
    else:
        days = 1 + _h(seed + "d3", 60)                                 # +1 .. +60
    d = today + datetime.timedelta(days=days)
    rec["activation_date"] = d.isoformat()
    rec["is_new"] = -30 <= days <= 0
    rec["is_upcoming"] = days > 0

    # season, only where a vertical has seasons
    if key in SEASON_VERTICALS:
        src = extra.get("season")
        if src:
            rec["season"] = src
        else:
            half = "Spring/Summer" if 3 <= d.month <= 8 else "Fall/Winter"
            rec["season"] = f"{half} {str(d.year)[2:]}"

    # gender, only where it means something
    if key in GENDER_VERTICALS:
        g = extra.get("gender")
        if not g:
            col = rec["collection"].lower()
            if col in ("women", "womens", "womenswear") or "women" in words or "wmns" in words:
                g = "Women"
            elif col in ("men", "mens", "menswear") or " men" in words:
                g = "Men"
            else:
                g = "Unisex"
        rec["gender"] = g
    elif key == "beauty" and rec["collection"] == "Fragrance":
        rec["gender"] = extra.get("gender") or ("Women" if "women" in words else "Men" if " men" in words else "Unisex")

    # material, only where a product is made of something
    if key in MATERIAL_VERTICALS:
        m = extra.get("material")
        if not m:
            for keys, choices in MATERIALS:
                if any(k in words for k in keys):
                    m = _pick(seed + "t", choices)
                    break
        if m:
            rec["material_full"] = m                 # the full "Cotton, Denim, Lycra" for the PDP
            # The FACET reads `material`, so collapse to the PRIMARY material
            # (first before the comma). Otherwise every combination becomes its
            # own filter value and the Material facet explodes to 150+ entries.
            rec["material"] = m.split(",")[0].strip()


def build_catalog(key, cfg):
    products, paths, dupes = load_sources(cfg)
    site = site_for(key)
    if len(paths) > 1 or dupes:
        note = f"  merged {len(paths)} file(s)"
        if dupes:
            note += f", {dupes} duplicate product(s) dropped"
        print(note)
    colmap = cfg["collections"]
    records = []

    for p in products:
        ptype = p.get("product_type") or ""
        if ptype not in colmap:
            continue                                  # merch, gift cards, samples
        images = [i["src"] for i in p.get("images", [])]
        if not images:
            continue

        # The shade name belongs in the name, now that `color` is the
        # family. Only where the whole product is ONE colourway — a sofa
        # that comes in six upholsteries has no single shade to put in
        # its title. The material suffix is dropped, so
        # "Camel - Top Grain Leather" gives "Camel".
        shades = set()
        for _v in p.get("variants", []):
            _c = split_options(p, _v)["color"]
            if _c:
                shades.add(str(_c).split(" - ")[0].strip())
        shade_suffix = shades.pop() if len(shades) == 1 else None

        collection = colmap[ptype]
        subcat = subcategory(p["title"], collection, cfg, ptype)
        option_name = p["options"][0]["name"] if p.get("options") else "Title"

        for v in p["variants"]:
            opts = split_options(p, v)
            price = money(v.get("price"))
            if price <= 0:
                continue                              # samples and placeholders
            compare = money(v.get("compare_at_price"))
            # A handful of source rows carry a was-price a thousand times
            # the selling price (a 22.49 mask against 26,988.00), which
            # renders as a 100% discount, tops the Highest discounted row
            # and prints an absurd struck-through price. Anything implying
            # more than 90% off is bad data, not a sale.
            if compare > price * 10:
                compare = 0
            unit_price = compare if compare > price else price

            label = v.get("title")
            if label in (None, "Default Title"):
                label = None

            records.append({
                "id": str(v["id"]),                    # Shopify VARIANT id
                "groupcode": str(p["id"]),             # Shopify PRODUCT id
                "name": (p["title"] if not shade_suffix
                         or _squash(shade_suffix) in _squash(p["title"])
                         else p["title"] + (", " if " in " in p["title"]
                                            else " in ") + shade_suffix),
                "variant_label": label,
                "option_name": option_name,
                # Vertical first, so the demo vertical is the top level of the
                # category path. Insider maps g:product_type -> category, a
                # default attribute, so campaigns filter on "category contains
                # Beauty" rather than an obscure custom label.
                "taxonomy": [cfg.get("subvertical", collection), collection, subcat],
                "collection": collection,
                "subcategory": subcat,
                "vertical_label": cfg.get("subvertical", collection),
                "unit_price": unit_price,
                "unit_sale_price": price,
                "currency": cfg.get("currency", CURRENCY),
                "locale": cfg.get("locale", LOCALE),
                "color": color_family(opts["color"]),
                # The shade name as the source wrote it, for anything
                # that wants to show rather than filter.
                "color_name": opts["color"],
                "size": opts["size"],
                # The dimension names, so a chip row can be labelled with the
                # word the vertical actually uses.
                "color_label": opts["color_label"],
                "size_label": opts["size_label"],
                # Room / Cabin / Tier / Level of cover.
                "tier": opts["tier"],
                "tier_label": opts["tier_label"],
                "variant_extras": opts["extras"],
                # Every option in source order, tagged with the slot it landed
                # in. The PDP reads this to label its variant buttons.
                "variant_parts": opts["parts"],
                "stock": (v.get("inventory_quantity") if v.get("inventory_quantity") is not None
                          else (250 if v.get("available") else 0)),
                "in_stock": 1 if v.get("available") else 0,
                "sku": v.get("sku") or str(v["id"]),
                "vendor": cfg["brand"],
                "product_type": ptype,
                "handle": p["handle"],
                "image": (v.get("featured_image") or {}).get("src") or images[0],
                "images": images[:4],
                "description": clean(p.get("body_html")),
                "url": f"{site}/product.html?id={v['id']}",
                "tags": p.get("tags", [])[:8],
            })

    today = datetime.date.today()
    # For content verticals (telco, finance), the card's rate line and feature
    # rows live in content.product_cards, keyed by name. Stamp them onto the
    # product record itself so the card never depends on a runtime name-match
    # lookup that can miss (e.g. when Eureka returns a slightly different name) —
    # which is what made some finance cards render bare.
    pcards = (cfg.get("content") or {}).get("product_cards") or {}
    if pcards:
        for rec in records:
            pc = pcards.get(rec["name"])
            if pc:
                if pc.get("rate_line"): rec["rate_line"] = pc["rate_line"]
                if pc.get("blurb"):     rec["blurb"] = pc["blurb"]
                if pc.get("features"):  rec["features"] = pc["features"]

    for rec in records:
        prod = next((p for p in products if str(p.get("id")) == rec["groupcode"]), {})
        prod_extra = prod.get("salesdemo") or prod.get("canon") or {}
        enrich(rec, key, prod_extra, today)
        # Importer-supplied attributes that are not part of the shared
        # enrichment (Canon: condition, compatible_with, megapixels, sensor,
        # weight, connectivity, lens_mount…). Carried on the record and, in
        # feed_item, emitted as plainly named tags for the mapping.
        for k, v in (prod.get("canon") or {}).items():
            if k not in rec and v:
                rec[k] = v

    # Size gaps. The salesdemo source carries stock per product, not per size,
    # so nothing is ever "gone in your size" — and act six of the guide, the
    # Agent One back-in-stock capture, needs exactly that. Where a vertical
    # asks for it, one size on roughly a quarter of the multi-size styles is
    # marked out of stock, chosen from the id so it is the same size every
    # build. Real per-size stock from a source is never overridden.
    if cfg.get("size_gaps"):
        by_group = collections.defaultdict(list)
        for rec in records:
            by_group[rec["groupcode"]].append(rec)
        for gid, recs in by_group.items():
            sized = [r for r in recs if r.get("size") and r["in_stock"]]
            sizes = sorted({r["size"] for r in sized})
            if len(sizes) < 3 or len(sizes) != len({r["size"] for r in recs}):
                continue
            if _h(gid + "gap", 4) != 0:
                continue
            gone = sizes[_h(gid + "which", len(sizes))]
            for r in recs:
                if r["size"] == gone:
                    r["stock"], r["in_stock"] = 0, 0
                # Flag the whole group so the PLP card can show "Low stock" —
                # the size gap is visible from the grid, not only the PDP.
                r["some_size_out"] = 1

    # Fully out-of-stock styles for the back-in-stock demo: a handful of whole
    # products marked gone so the PLP shows clear "Sold out" cards. Chosen by id
    # so the same styles are OOS every build. Only where the vertical asks
    # (full_oos = N).
    n_oos = cfg.get("full_oos")
    if n_oos:
        by_group = collections.defaultdict(list)
        for rec in records:
            by_group[rec["groupcode"]].append(rec)
        gids = sorted(by_group.keys())
        # deterministic pick: every k-th group so they're spread across the catalogue
        step = max(1, len(gids)//max(1, n_oos))
        picked = gids[::step][:n_oos]
        for gid in picked:
            for r in by_group[gid]:
                r["stock"], r["in_stock"] = 0, 0
                r["some_size_out"] = 0

    if not records:
        raise ValueError(f"{key}: no products survived filtering — check `collections`")

    subs = collections.defaultdict(set)
    for r in records:
        subs[r["collection"]].add(r["subcategory"])
    ordered = {c: sorted(subs[c]) for c in cfg["order"] if c in subs}

    meta = {k: cfg[k] for k in (
        "brand", "tagline", "hero_title", "hero_lede", "hero_cta", "announce",
        "search_placeholder", "newsletter_title", "newsletter_lede", "theme",
        "vertical", "subvertical", "hero_eyebrow", "tiles_title", "grid_title",
        "reco_title", "sale_title", "reco_foot_title", "profile", "flow", "hero_category", "foryou_title", "showcase", "replenishment_days", "anniversary_months",
        "locale", "currency", "banner_slot", "direct_checkout", "template", "content", "tier_banner", "rate_card", "default_category", "show_credit_in_nav", "fulfilment"
    ) if k in cfg}
    meta["key"] = key
    # Journey wording, so one template covers retail, travel, telco and banking.
    labels = dict(CONFIG.get("_labels_default", {}))
    labels.update({k: v for k, v in (cfg.get("labels") or {}).items()
                   if not k.startswith("_")})
    meta["labels"] = labels

    os.makedirs("catalogs", exist_ok=True)
    out = f"catalogs/{key}.js"
    with open(out, "w") as f:
        f.write(f"/* {cfg['brand']} — generated by build.py, do not edit.\n"
                f"   Keyed on Shopify VARIANT id so Eureka and Smart Recommender\n"
                f"   results resolve to local product pages. */\n")
        f.write("window.VERTICAL = ")
        json.dump(meta, f, separators=(",", ":"))
        f.write(";\nwindow.CATALOG = ")
        json.dump(records, f, separators=(",", ":"))
        f.write(";\nwindow.COLLECTIONS = ")
        json.dump(ordered, f, indent=2)
        f.write(";\n")

    return records, ordered, out


# --------------------------------------------------------------------------
def feed_item(p):
    """One <item>. Three things here are load-bearing, all learned from a
    failed validation: prices are bare numbers, the title tag is g:title, and
    g:sale_price is present on every product because Insider marks price.USD
    required."""
    parts = [
        "  <item>",
        f"    <g:id>{escape(str(p['id'])[:32])}</g:id>",
        f"    <g:item_group_id>{escape(p['groupcode'])}</g:item_group_id>",
        f"    <g:title>{escape(clean(p['name'], 512))}</g:title>",
        f"    <description>{escape(clean(p['description'] or p['name'], 1024))}</description>",
        f"    <link>{escape(p['url'])}</link>",
        # Generated artwork is stored relative; Shopify CDN images already
        # absolute. The feed needs a full URL either way.
        f"    <g:image_link>{escape(p['image'] if p['image'].startswith('http') else SITE_ABS + '/' + p['image'])}</g:image_link>",
        f"    <g:price>{p['unit_price']:.2f}</g:price>",
        f"    <g:sale_price>{p['unit_sale_price']:.2f}</g:sale_price>",
        f"    <g:availability>{'in stock' if p['in_stock'] else 'out of stock'}</g:availability>",
        f"    <g:quantity>{p['stock']}</g:quantity>",
        # The separator between verticals. Campaigns filter on this.
        f"    <g:brand>{escape(p['vendor'])}</g:brand>",
        # "Beauty > Makeup > Lip" — Google Merchant's hierarchy convention.
        f"    <g:product_type>{escape(clean(' > '.join(p['taxonomy']), 1024))}</g:product_type>",
        "    <g:condition>" + ("refurbished" if str(p.get("condition","")).lower().startswith("refurb") else "new") + "</g:condition>",
        f"    <g:custom_label_0>{escape(clean(p['subcategory'], 512))}</g:custom_label_0>",
    ]
    if p.get("color"):
        parts.append(f"    <g:color>{escape(clean(p['color'], 512))}</g:color>")

    # --- merchandising numbers ---------------------------------------------
    # Eureka sorts by discount already (MostDiscountedFirst ranks on the gap
    # between price and original_price), but nothing carries the percentage as
    # a value, so it cannot be faceted, sorted in a rule, or compared against.
    # Emitted only where the product is actually reduced.
    if p["unit_price"] > p["unit_sale_price"] > 0:
        _pct = int(round((p["unit_price"] - p["unit_sale_price"]) / p["unit_price"] * 100))
        if _pct > 0:
            parts.append(f"    <discount_pct>{_pct}</discount_pct>")

    # margin travels twice. `margin` is the honest name and a custom attribute;
    # `multipack` is a DEFAULT numeric attribute nothing in this estate uses,
    # carrying the same number so merchandising rules can be built on a default
    # field. Canon is excluded: its ink and paper really are sold in packs.
    if p.get("margin") is not None and p.get("vendor") != "Canon":
        parts.append(f"    <g:multipack>{int(p['margin'])}</g:multipack>")

    if p.get("size"):
        parts.append(f"    <g:size>{escape(clean(p['size'], 512))}</g:size>")

    # Room, Cabin, Tier, Level of cover, Leg Style — the single variant
    # dimension of a vertical that has no sizes. It used to fall back into
    # g:size, which put "Slope", "Deluxe King" and "Economy" in the size facet
    # alongside M and L. Its own field, its own facet.
    if p.get("tier"):
        parts.append(f"    <option_group>{escape(clean(p['tier'], 512))}</option_group>")

    # Which dimension g:size actually holds, so a campaign or the Shopping
    # Agent can tell a Cabin from a dress size.
    dimension = p.get("size_label") or p.get("tier_label")
    if dimension:
        parts.append(f"    <g:custom_label_1>{escape(clean(dimension, 512))}</g:custom_label_1>")

    # Enrichment. Google Merchant has fields for gender and material; the rest
    # go out both as custom labels (auto-mapped) and as plainly named tags,
    # so the attribute mapping in the panel reads <rating>, <margin>,
    # <activation_date>, <season> rather than a label number.
    if p.get("gender"):
        parts.append(f"    <g:gender>{escape(p['gender'])}</g:gender>")
    if p.get("material"):
        parts.append(f"    <g:material>{escape(clean(p['material'], 512))}</g:material>")
    if p.get("season"):
        parts.append(f"    <g:custom_label_2>{escape(clean(p['season'], 512))}</g:custom_label_2>")
        parts.append(f"    <season>{escape(clean(p['season'], 512))}</season>")
    parts.append(f"    <g:custom_label_3>{p['rating']:.1f}</g:custom_label_3>")
    parts.append(f"    <rating>{p['rating']:.1f}</rating>")
    parts.append(f"    <g:custom_label_4>{p['margin']}</g:custom_label_4>")
    parts.append(f"    <margin>{p['margin']}</margin>")
    parts.append(f"    <activation_date>{p['activation_date']}</activation_date>")
    for k in ("condition", "compatible_with", "compatibility_source", "megapixels", "sensor",
              "iso_range", "weight", "connectivity", "lens_mount", "print_resolution", "print_speed"):
        if p.get(k):
            parts.append(f"    <{k}>{escape(clean(str(p[k]), 1024))}</{k}>")

    parts.append("  </item>")
    return "\n".join(parts)


def build_feed(key, cfg, records):
    """Per-vertical feed. Kept for reference and for anyone who wants a
    separate integration; the master feed is what InOne actually points at."""
    os.makedirs("feeds", exist_ok=True)
    out = f"feeds/{key}.xml"
    with open(out, "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n'
                f'  <title>{escape(cfg["brand"])}</title>\n'
                f'  <link>{site_for(key)}</link>\n'
                f'  <description>{escape(cfg["tagline"])}</description>\n'
                + "\n".join(feed_item(p) for p in records) + "\n</channel>\n</rss>\n")
    return out


def build(key):
    cfg = VERTICALS[key]
    records, ordered, cat_path = build_catalog(key, cfg)
    feed_path = build_feed(key, cfg, records)

    groups = len({r["groupcode"] for r in records})
    onsale = sum(1 for r in records if r["unit_sale_price"] < r["unit_price"])

    print(f"\n{cfg['brand']}  ({key})   {cfg.get('vertical','?')} / {cfg.get('subvertical','?')}")
    print(f"  {groups} products / {len(records)} variants · {onsale} discounted"
          f"  [{cfg.get('locale', LOCALE)} · {cfg.get('currency', CURRENCY)}]")
    if groups < 200:
        print(f"  note: {groups} products is thin for a search demo — "
              f"add more pages to `source` (Shopify caps at 250/page)")
    for c, subs in ordered.items():
        n = sum(1 for r in records if r["collection"] == c)
        print(f"    {n:4d}  {c}  —  {', '.join(subs)}")
    print(f"  -> {cat_path}")
    print(f"  -> {feed_path}")
    print(f"     store: {site_for(key)}")


def build_master():
    """One feed containing every vertical.

    This is the point of the design: a single XML integration in InOne that
    syncs hourly. Adding a vertical means regenerating this file and pushing
    it — no onboarding wizard, no revalidation, no attribute remapping.

    Verticals are separated at campaign level by g:brand, which is unique per
    vertical, so each vertical's Eureka and Smart Recommender campaigns filter
    to their own products.
    """
    items, per_brand, seen = [], collections.Counter(), {}

    for key, cfg in VERTICALS.items():
        # Standalone verticals (their own locale and feed, e.g. Canon en_CA)
        # never enter the master feed — mixing locales in one file is what
        # a separate locale exists to prevent.
        if cfg.get("standalone_feed"):
            continue
        cat = f"catalogs/{key}.js"
        if not os.path.exists(cat):
            continue
        raw = open(cat).read()
        start = raw.index("[", raw.index("window.CATALOG"))
        end = raw.index("];", start) + 1
        records = json.loads(raw[start:end])

        for p in records:
            pid = str(p["id"])
            if pid in seen:
                # Shopify ids are globally unique, so this should never fire.
                # If it does, the later vertical silently loses products, so
                # it is worth knowing about rather than swallowing.
                print(f"  ! id collision: {pid} in both {seen[pid]} and {key}")
                continue
            seen[pid] = key
            per_brand[p["vendor"]] += 1
            items.append(feed_item(p))

    # Retired products. The XML sync adds and updates but never removes, so a
    # product dropped from the feed stays in Insider's catalog, in stock and
    # searchable, until someone retires it by hand — 5,600 variants at fifteen
    # per page after the fashion swap. The only lever the sync does pull is
    # UPDATE, so retired ids are kept in the feed as out-of-stock, zero-
    # quantity stubs: the next sync flips them, and any campaign that excludes
    # out-of-stock products drops them. Needs the integration set to send all
    # products with stock status (the only-in-stock toggle OFF), otherwise the
    # stubs are skipped as out of stock and never applied.
    #
    # retired.json is a list of {id, groupcode, name}; append to it whenever a
    # catalog is replaced. Never remove entries — they cost nothing and keep
    # the product retired if it ever reappears.
    retired = json.load(open("retired.json")) if os.path.exists("retired.json") else []
    n_ret = 0
    for r in retired:
        if str(r["id"]) in seen:
            continue
        items.append("\n".join([
            "  <item>",
            f"    <g:id>{escape(str(r['id']))}</g:id>",
            f"    <g:item_group_id>{escape(str(r.get('groupcode', r['id'])))}</g:item_group_id>",
            f"    <g:title>{escape(clean(r.get('name', 'Retired product'), 512))}</g:title>",
            "    <description>Retired</description>",
            f"    <link>https://{APEX}/</link>",
            f"    <g:image_link>https://{APEX}/assets/img/retired.svg</g:image_link>",
            "    <g:price>1.00</g:price>",
            "    <g:sale_price>1.00</g:sale_price>",
            "    <g:availability>out of stock</g:availability>",
            "    <g:quantity>0</g:quantity>",
            "    <g:brand>Retired</g:brand>",
            "    <g:product_type>Retired</g:product_type>",
            "    <g:condition>new</g:condition>",
            "  </item>",
        ]))
        n_ret += 1
    if n_ret:
        print(f"  retired stubs: {n_ret} (out of stock, brand Retired)")

    os.makedirs("feeds", exist_ok=True)
    with open("feeds/master.xml", "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n'
                f'  <title>Insider demo catalog</title>\n'
                f'  <link>https://{APEX}</link>\n'
                '  <description>All verticals. Separated by brand at campaign level.</description>\n'
                + "\n".join(items) + "\n</channel>\n</rss>\n")

    print(f"\nMaster feed  ->  feeds/master.xml   (https://{APEX}/feeds/master.xml)")
    print(f"  {len(items)} records across {len(per_brand)} brand(s)")
    for brand, n in per_brand.most_common():
        print(f"    {n:6d}  {brand}")
    print("\n  Campaign filters — category starts with:")
    for key, cfg in VERTICALS.items():
        if os.path.exists(f"catalogs/{key}.js"):
            print(f"    {cfg.get('subvertical', key):14s} -> \"{cfg.get('subvertical', key)}\"")
    print("\n  One XML integration points at this file. Each vertical's campaigns")
    print("  filter on brand. Adding a vertical = rebuild, push, wait for sync.")


def write_manifest():
    manifest = {k: {"brand": v["brand"], "tagline": v.get("tagline", "")}
                for k, v in VERTICALS.items()
                if os.path.exists(f"catalogs/{k}.js")}
    with open("catalogs/manifest.js", "w") as f:
        f.write("/* Generated by build.py — which verticals are available. */\n")
        f.write("window.VERTICALS = ")
        json.dump(manifest, f, indent=2)
        f.write(";\n")
    return manifest


if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        print("configured:", ", ".join(VERTICALS))
        sys.exit(0)

    if args[0] == "--list":
        groups = collections.defaultdict(list)
        for k, v in VERTICALS.items():
            groups[v.get("vertical", "Unassigned")].append((k, v, True))
        for k, v in PLANNED.items():
            groups[v.get("vertical", "Unassigned")].append((k, v, False))

        for vert in sorted(groups):
            print(f"\n{vert}")
            for k, v, live in sorted(groups[vert]):
                sub = v.get("subvertical", "-")
                if not live:
                    print(f"    {sub:14s} {k:14s} —  not built")
                    continue
                try:
                    _, paths, _ = load_sources(v)
                    src = f"{len(paths)} file(s)"
                except Exception:
                    src = "SOURCE MISSING"
                built = "built" if os.path.exists(f"catalogs/{k}.js") else "not built"
                print(f"    {sub:14s} {k:14s} {v.get('template','ecommerce'):10s} "
                      f"{src:14s} {built}")
        print()
        sys.exit(0)

    keys = list(VERTICALS) if args[0] == "--all" else args
    failed = []
    for k in keys:
        if k not in VERTICALS:
            print(f"  ! unknown vertical: {k}")
            failed.append(k)
            continue
        try:
            build(k)
        except Exception as e:
            print(f"  ! {k}: {e}")
            failed.append(k)

    build_master()
    m = write_manifest()
    print(f"\n{len(m)} vertical(s) available: {', '.join(m)}")
    if failed:
        print(f"failed: {', '.join(failed)}")
        sys.exit(1)
