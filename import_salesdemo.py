#!/usr/bin/env python3
"""Bring the salesdemo catalog (Çakıl's search-tuned export) into the estate.

    python3 import_salesdemo.py path/to/salesdemo.csv            # fashion only
    python3 import_salesdemo.py path/to/salesdemo.csv --list     # what else is in it
    python3 import_salesdemo.py path/to/salesdemo.csv --vertical beauty
    python3 import_salesdemo.py path/to/salesdemo.csv --all      # every vertical it feeds

Writes Shopify-shaped source files (sources/<key>-1.json, -2.json ...) that
build.py reads exactly like a products.json dump, so nothing downstream
changes: build.py <key> still owns the catalog, the feed and the category
path. Then `python3 localize.py <key>` pulls the images in from the Shopify
CDN so the demo never depends on someone else's hosting.

WHAT IS PRESERVED, AND WHY
The search team tuned against this data — names, category values, colours,
sizes, descriptions. All of that is kept exactly. Product ids stay the
salesdemo ids (groupcode -> product id, item_id -> variant id), so anything
keyed on an id still matches. The only things that change are the brand on
the feed (the vertical's brand, as for every other vertical) and the URL
pattern, which has to point at the demo site.

WHAT IS LEFT OUT OF FASHION
Lingerie and underwear are excluded on purpose: the current fashion catalog
is being replaced because it reads as too racy, and this must not reintroduce
that. Rows without an image or a price are dropped, as build.py would drop
them anyway.
"""
import ast, csv, json, os, re, sys, collections
from urllib.parse import urlparse

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Top-level salesdemo category -> which vertical it belongs to. Everything not
# listed is reported by --list and imported by nothing.
VERTICAL_OF = {
    "fashion": {"Women's Collection", "Men's Collection", "Shoes Collection",
                "Accessories", "Jewelry", "Men's Accessories"},
    "beauty":  {"Health & Beauty", "Cosmetics", "Skincare", "Hair Care", "Fragrance"},
    "home":    {"Home Decor", "Appliances"},
    "nutrition": {"Nutrition", "Treats"},
}
# Verticals that already have a catalog of their own: the import is ADDED
# beside it (sources/<key>-sd-N.json) rather than replacing it. Fashion is
# a replacement; beauty keeps Lumen's shade-level catalog, which carries
# the variant-grouping demo, and gains these on top.
ADD_TO = {"beauty", "home"}
EXCLUDE_SECOND = {"Women's Lingerie", "Men's Underwear", "Lingerie", "Underwear"}
EXCLUDE_TOP = {"Men's Underwear"}
# Beauty and homeware that the source filed under Accessories by mistake.
EXCLUDE_TITLE = ("wig head", "mirror", "spray bottle", "color scale", "ipad case",
                 "ottoman", "brush attachment", "trolley", "luggage tag",
                 "textile", "candle", "woven shirt", "sweatshirt", "denim")


def lit(s, default=None):
    if s in (None, "", "-"):
        return default
    try:
        return ast.literal_eval(s)
    except (ValueError, SyntaxError):
        return default


def usd(s):
    d = lit(s, {})
    if isinstance(d, dict):
        for v in d.values():
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return 0.0


def handle_of(url, fallback):
    try:
        path = urlparse(url).path.rstrip("/").split("/")[-1]
        return path or fallback
    except Exception:
        return fallback


def clean_desc(s):
    s = (s or "").replace("\r", "").strip()
    return s if s and s != "-" else ""


def read(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    for r in rows:
        cats = lit(r.get("category"), [])
        if not isinstance(cats, list):
            cats = [str(cats)]
        r["_cats"] = [c for c in cats if c]
    return rows


def group(rows, vertical):
    keep = VERTICAL_OF[vertical]
    products = collections.OrderedDict()
    skipped = collections.Counter()
    for r in rows:
        cats = r["_cats"]
        top = cats[0] if cats else ""
        second = cats[1] if len(cats) > 1 else ""
        if top not in keep:
            continue
        if top in EXCLUDE_TOP or second in EXCLUDE_SECOND or (
                top in ("Accessories", "Jewelry")
                and any(k in r["name"].lower() for k in EXCLUDE_TITLE)):
            skipped["excluded on purpose"] += 1
            continue
        if not r["image_url"].startswith("http"):
            skipped["no image"] += 1
            continue
        price = usd(r["price"])
        if price <= 0:
            skipped["no price"] += 1
            continue
        gid = str(r["groupcode"]).split(".")[0]
        if not gid or gid == "-":
            gid = str(r["item_id"])
        products.setdefault(gid, []).append(r)
    return products, skipped


def product_type_for(cats):
    """The second-level category is the honest product type: 'Women's Tops',
    'Men's Jackets', 'Sneakers'. When there is none, the top level stands in."""
    if not cats:
        return ""
    top = cats[0]
    second = cats[1] if len(cats) > 1 else ""
    gender = {"Women's Collection": "Women's", "Men's Collection": "Men's"}.get(second)
    if gender:
        # 'Shoes Collection > Women's Collection' means women's shoes, not a
        # women's-collection product that happens to be a shoe.
        noun = {"Shoes Collection": "Shoes", "Accessories": "Accessories",
                "Jewelry": "Jewelry"}.get(top)
        return f"{gender} {noun}" if noun else top
    if second and second != "SALE":
        return second
    return top


REFINE = {
    # Bare 'Health & Beauty' rows: decide from the title, since the type is
    # what routes the product into a collection.
    "Health & Beauty": [
        ("Fragrance", ("parfum", "perfume", "eau de", "cologne", "fragrance", "scent")),
        ("Hair Care", ("hair", "shampoo", "conditioner", "styler", "dryer", "iron",
                       "brush", "curl", "scalp", "kerasilk", "ghd", "t3 ", "wand")),
        ("Cosmetics", ("lipstick", "lip", "palette", "eyeshadow", "blush", "mascara",
                       "foundation", "concealer", "bronzer", "blonzer", "eyeliner",
                       "brow", "primer", "gloss", "makeup", "powder")),
    ],
    # Bare 'Appliances' rows are overwhelmingly spare parts.
    "Appliances": [
        ("Replacement Parts", ("element", "knob", "tray", "cap ", "assembly", "filter",
                               "seal", "gasket", "thermostat", "hinge", "burner", "shelf",
                               "rack", "hose", "valve", "switch", "bulb", "lamp", "grill",
                               "door", "handle", "motor", "pump", "belt", "ring", "plate",
                               "spare", "kit")),
    ],
}


def refine_type(ptype, title):
    rules = REFINE.get(ptype)
    if not rules:
        return ptype
    t = title.lower()
    for new, keys in rules:
        if any(k in t for k in keys):
            return new
    return {"Health & Beauty": "Skincare"}.get(ptype, ptype)


def to_shopify(gid, rows, brand_tag=True):
    first = rows[0]
    cats = first["_cats"]
    ptype = refine_type(product_type_for(cats), first["name"])
    attrs = lit(first.get("product_attributes"), {}) or {}
    tags = []
    if first.get("gender"):
        tags.append("Gender:" + first["gender"])
    if first.get("brand") and first["brand"] != "-" and brand_tag:
        tags.append("Brand:" + first["brand"])
    for c in cats:
        tags.append("Category:" + c)
    for t in (attrs.get("shopify_tag") or [])[:4]:
        if isinstance(t, str) and t not in tags:
            tags.append(t)

    colors = [r["color"] for r in rows if r["color"] and r["color"] != "-"]
    for r in rows:
        if r["color"] and r["color"] != "-":
            r["color"] = r["color"][0].upper() + r["color"][1:]
    sizes = [r["size"] for r in rows if r["size"] and r["size"] != "-"]
    options = []
    if colors:
        options.append({"name": "Color", "position": len(options) + 1})
    if sizes:
        options.append({"name": "Size", "position": len(options) + 1})

    images, seen = [], set()
    for r in rows:
        u = r["image_url"]
        if u not in seen:
            seen.add(u)
            images.append({"src": u})

    variants = []
    for i, r in enumerate(rows):
        color = r["color"] if r["color"] and r["color"] != "-" else None
        if color:
            # 'black' and 'Black' are the same swatch; one facet value, not two.
            color = color[0].upper() + color[1:]
        size = r["size"] if r["size"] and r["size"] != "-" else None
        opts = []
        if colors:
            opts.append(color or "")
        if sizes:
            opts.append(size or "")
        title = " / ".join(o for o in opts if o) or "Default Title"
        price = usd(r["price"])
        orig = usd(r["original_price"])
        variants.append({
            "id": int(r["item_id"]),
            "product_id": int(gid) if gid.isdigit() else gid,
            "title": title,
            "option1": opts[0] if len(opts) > 0 else "Default Title",
            "option2": opts[1] if len(opts) > 1 else None,
            "option3": None,
            "sku": r["sku"] if r["sku"] and r["sku"] != "-" else str(r["item_id"]),
            "requires_shipping": True,
            "taxable": True,
            "featured_image": {"src": r["image_url"]},
            "available": r["in_stock"] == "1" and r["is_status_passive"] != "1",
            "inventory_quantity": int(r["stock_count"]) if str(r.get("stock_count", "")).isdigit() else None,
            "price": f"{price:.2f}",
            "compare_at_price": f"{orig:.2f}" if orig > price else "0.00",
            "position": i + 1,
        })

    # Merchandising attributes the search team's catalog carries and the
    # Shopify shape has no home for. build.py reads them off `salesdemo`
    # and fills anything missing so every product in the estate has a
    # value, real where one exists.
    def rating():
        try:
            return round(float(first.get("rating")), 1)
        except (TypeError, ValueError):
            return None
    extra = {
        "gender": first.get("gender") or None,
        "rating": rating(),
        "margin": attrs.get("margin") if isinstance(attrs.get("margin"), (int, float)) else None,
        "season": attrs.get("season") or None,
        "material": attrs.get("material") or None,
        "activation_date": attrs.get("activation_date") or None,
    }

    return {
        "id": int(gid) if gid.isdigit() else gid,
        "salesdemo": {k: v for k, v in extra.items() if v not in (None, "", "-")},
        "title": first["name"].strip(),
        "handle": handle_of(first["url"], gid),
        "body_html": clean_desc(first["description"]),
        "vendor": first.get("brand") or "",
        "product_type": ptype,
        "tags": tags[:8],
        "variants": variants,
        "images": images,
        "options": options,
    }


def write_sources(key, products):
    stem = f"{key}-sd" if key in ADD_TO else key
    for old in [f for f in os.listdir("sources") if re.match(rf"{stem}-\d+\.json$", f)]:
        os.remove(os.path.join("sources", old))
    items = list(products.items())
    n = 0
    for start in range(0, len(items), 250):
        n += 1
        chunk = [to_shopify(g, rows) for g, rows in items[start:start + 250]]
        with open(f"sources/{stem}-{n}.json", "w") as fh:
            json.dump({"products": chunk}, fh, ensure_ascii=False)
    return stem, n


def listing(rows):
    top = collections.Counter()
    styles = collections.defaultdict(set)
    second = collections.Counter()
    for r in rows:
        cats = r["_cats"]
        t = cats[0] if cats else "(none)"
        top[t] += 1
        styles[t].add(str(r["groupcode"]))
        if len(cats) > 1:
            second[(t, cats[1])] += 1
    owner = {c: k for k, cs in VERTICAL_OF.items() for c in cs}
    print(f"{'top-level category':28s} {'styles':>7s} {'variants':>9s}  vertical")
    for t, n in top.most_common():
        print(f"{t:28s} {len(styles[t]):7d} {n:9d}  {owner.get(t, '-')}")
    print("\nsecond level (top 30):")
    for (t, s), n in second.most_common(30):
        print(f"  {t} > {s}: {n}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(1)
    rows = read(args[0])
    if "--list" in sys.argv:
        listing(rows)
        return
    verticals = ["fashion"]
    if "--vertical" in sys.argv:
        verticals = [sys.argv[sys.argv.index("--vertical") + 1]]
    if "--all" in sys.argv:
        verticals = list(VERTICAL_OF)
    for vertical in verticals:
        products, skipped = group(rows, vertical)
        stem, n = write_sources(vertical, products)
        nvar = sum(len(v) for v in products.values())
        mode = "added beside the existing catalog" if vertical in ADD_TO else "replaces the catalog"
        print(f"{vertical}: {len(products)} products, {nvar} variants -> sources/{stem}-1..{n}.json ({mode})")
        for k, v in skipped.items():
            print(f"  skipped {v} rows: {k}")
        types = collections.Counter(refine_type(product_type_for(r[0]['_cats']), r[0]['name'])
                                    for r in products.values())
        print("  product types: " + ", ".join(f"{t} {c}" for t, c in types.most_common()))


if __name__ == "__main__":
    main()
