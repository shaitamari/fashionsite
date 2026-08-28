"""Turn the Posh Street Shopify export into the site catalog.

Critical detail, taken from what salesdemo actually receives:

    id        = Shopify VARIANT id   ("46156615385362")
    groupcode = Shopify PRODUCT id   ("8526117110034")

Insider's catalog is keyed on the variant, so every record here is a variant.
Getting this wrong is why recommendations returned ids that resolved to nothing.
"""
import json, re, collections

SRC = "products.json"
OUT = "assets/catalog.js"

# Collection names as Insider sees them, matching the taxonomy shape observed
# on a live product page: a single-element array holding the collection title.
COLLECTIONS = [
    ("Shoes Collection", lambda t: "shoes" in t.lower()),
    ("Pets Collection",  lambda t: t.lower().startswith("pet_")
                                   or "dog food" in t.lower()
                                   or "cat food" in t.lower()
                                   or "cat litter" in t.lower()
                                   or "chews" in t.lower()),
    ("Home Decor",       lambda t: True),   # everything else
]

# Tidy display names for the second-level filter chips.
SUBCAT_FIXES = {"chair": "Chairs", "Chair": "Chairs", "Bedrooms": "Bedroom", "": "Other"}


def collection_for(product_type):
    for name, test in COLLECTIONS:
        if test(product_type or ""):
            return name
    return "Home Decor"


def clean(html):
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&amp;", "&").replace("&nbsp;", " ")
                .replace("&quot;", '"').replace("&#39;", "'")
                .replace("&lt;", "<").replace("&gt;", ">"))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:400]


def money(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


products = json.load(open(SRC))["products"]
records = []

for p in products:
    ptype = p.get("product_type") or ""
    collection = collection_for(ptype)
    subcat = SUBCAT_FIXES.get(ptype, ptype) or "Other"
    images = [i["src"] for i in p.get("images", [])]
    if not images:
        continue

    for v in p["variants"]:
        price = money(v.get("price"))
        compare = money(v.get("compare_at_price"))
        # Shopify puts the ORIGINAL price in compare_at_price when an item is
        # discounted, so unit_price is the higher of the two.
        unit_price = compare if compare > price else price
        unit_sale_price = price

        option = v.get("option1")
        size = None if option in (None, "Default Title") else option

        variant_img = None
        if v.get("featured_image") and v["featured_image"].get("src"):
            variant_img = v["featured_image"]["src"]

        records.append({
            "id": str(v["id"]),                     # VARIANT id — the catalog key
            "groupcode": str(p["id"]),              # product id
            "name": p["title"],
            "taxonomy": [collection],               # single-element, as observed
            "collection": collection,
            "subcategory": subcat,
            "unit_price": unit_price,
            "unit_sale_price": unit_sale_price,
            "currency": "USD",
            "locale": "en_US",
            "color": None,
            "size": size,
            "stock": 499 if v.get("available") else 0,
            "in_stock": 1 if v.get("available") else 0,
            "sku": v.get("sku") or str(v["id"]),
            "vendor": p.get("vendor") or "Posh Street",
            "product_type": ptype,
            "handle": p["handle"],
            "image": variant_img or images[0],
            "images": images[:4],
            "description": clean(p.get("body_html")),
            # Canonical Shopify URL. Deliberately NOT this site's URL — see the
            # catalog-pollution note in the README.
            "url": f"https://poshstreet.shop/products/{p['handle']}?variant={v['id']}",
            "tags": p.get("tags", [])[:8],
        })

by_collection = collections.Counter(r["collection"] for r in records)
subcats = collections.defaultdict(set)
for r in records:
    subcats[r["collection"]].add(r["subcategory"])

with open(OUT, "w") as f:
    f.write("/* Posh Street catalog — generated from the live Shopify export.\n"
            "   Keyed on Shopify VARIANT id, which is what the salesdemo catalog\n"
            "   uses. Recommendation and Eureka results resolve against these ids.\n"
            "   Regenerate with build_catalog.py after refreshing products.json. */\n")
    f.write("window.CATALOG = ")
    json.dump(records, f, separators=(",", ":"))
    f.write(";\n\nwindow.COLLECTIONS = ")
    ORDER = ["Shoes Collection", "Home Decor", "Pets Collection"]
    ordered = {c: sorted(subcats[c]) for c in ORDER if c in subcats}
    json.dump(ordered, f, indent=2)
    f.write(";\n")

print(f"{len(records)} variants from {len(products)} products")
for c, n in by_collection.most_common():
    print(f"  {n:4d}  {c}  ({len(subcats[c])} subcategories)")
print("\nsample:", json.dumps(records[0], indent=2)[:420])
