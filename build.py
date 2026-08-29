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
import json, os, re, sys, glob, collections
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.abspath(__file__))
APEX = "insiderdemo.com"
SITE_ABS = f"https://{APEX}"


def site_for(key):
    """Each vertical gets its own hostname so campaign rules can't collide."""
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


def subcategory(title, collection, cfg):
    t = title.lower()
    for name, keys in cfg.get("subcats", {}).get(collection, []):
        if any(k in t for k in keys):
            return name
    return cfg.get("defaults", {}).get(collection, collection)


# --------------------------------------------------------------------------
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

        collection = colmap[ptype]
        subcat = subcategory(p["title"], collection, cfg)
        option_name = p["options"][0]["name"] if p.get("options") else "Title"

        for v in p["variants"]:
            price = money(v.get("price"))
            if price <= 0:
                continue                              # samples and placeholders
            compare = money(v.get("compare_at_price"))
            unit_price = compare if compare > price else price

            label = v.get("title")
            if label in (None, "Default Title"):
                label = None

            color = size = None
            if label:
                if option_name.lower() in ("shade", "color", "colour"):
                    color = label
                else:
                    size = label

            records.append({
                "id": str(v["id"]),                    # Shopify VARIANT id
                "groupcode": str(p["id"]),             # Shopify PRODUCT id
                "name": p["title"],
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
                "currency": CURRENCY,
                "locale": LOCALE,
                "color": color,
                "size": size,
                "stock": 250 if v.get("available") else 0,
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
        "reco_title", "profile", "flow"
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
        "    <g:condition>new</g:condition>",
        f"    <g:custom_label_0>{escape(clean(p['subcategory'], 512))}</g:custom_label_0>",
    ]
    if p.get("color"):
        parts.append(f"    <g:color>{escape(clean(p['color'], 512))}</g:color>")
    if p.get("size"):
        parts.append(f"    <g:size>{escape(clean(p['size'], 512))}</g:size>")
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
          f"  [{LOCALE} · {CURRENCY}]")
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
