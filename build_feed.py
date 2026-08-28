"""Build a Google Merchant Center XML feed for Insider One catalog integration.

Google Merchant format is chosen because Insider auto-maps its attributes, so
no manual field matching is needed during the XML integration wizard.

Key decisions:
  g:id            = Shopify VARIANT id, matching assets/catalog.js exactly, so
                    Eureka and Smart Recommender results resolve to local pages
  g:item_group_id = Shopify PRODUCT id
  link            = insiderdemo.com product page (this catalog belongs to
                    onesandbox, which is ours, so links should stay on our site)
"""
import json, re
from xml.sax.saxutils import escape

SRC = "assets/catalog.js"
OUT = "feed.xml"
SITE = "https://insiderdemo.com"

# catalog.js is `window.CATALOG = [...];` — pull the JSON array out of it.
raw = open(SRC).read()
start = raw.index("[", raw.index("window.CATALOG"))
end = raw.index("];", start) + 1
products = json.loads(raw[start:end])


def clean(text, limit):
    if not text:
        return ""
    text = re.sub(r"\s+", " ", str(text)).strip()
    return text[:limit]


items = []
for p in products:
    # item_id is capped at 32 characters; Shopify variant ids are ~14 digits.
    pid = str(p["id"])[:32]
    on_sale = p["unit_sale_price"] < p["unit_price"]

    parts = [
        "  <item>",
        f"    <g:id>{escape(pid)}</g:id>",
        f"    <g:item_group_id>{escape(str(p['groupcode']))}</g:item_group_id>",
        f"    <title>{escape(clean(p['name'], 512))}</title>",
        f"    <description>{escape(clean(p.get('description') or p['name'], 1024))}</description>",
        f"    <link>{escape(SITE)}/product.html?id={escape(pid)}</link>",
        f"    <g:image_link>{escape(p['image'])}</g:image_link>",
        f"    <g:price>{p['unit_price']:.2f} USD</g:price>",
    ]
    if on_sale:
        parts.append(f"    <g:sale_price>{p['unit_sale_price']:.2f} USD</g:sale_price>")

    parts += [
        f"    <g:availability>{'in stock' if p.get('in_stock') else 'out of stock'}</g:availability>",
        f"    <g:quantity>{int(p.get('stock') or 0)}</g:quantity>",
        f"    <g:brand>{escape(clean(p.get('vendor') or 'Posh Street', 512))}</g:brand>",
        f"    <g:product_type>{escape(clean(p['collection'], 1024))}</g:product_type>",
        f"    <g:condition>new</g:condition>",
    ]

    # A couple of extras worth having available for merchandising rules.
    if p.get("subcategory"):
        parts.append(f"    <g:custom_label_0>{escape(clean(p['subcategory'], 512))}</g:custom_label_0>")
    if p.get("sku"):
        parts.append(f"    <g:mpn>{escape(clean(p['sku'], 512))}</g:mpn>")

    parts.append("  </item>")
    items.append("\n".join(parts))

xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Posh Street</title>
  <link>{SITE}</link>
  <description>Posh Street demo catalog for Insider One</description>
{chr(10).join(items)}
</channel>
</rss>
"""

open(OUT, "w").write(xml)

on_sale_count = sum(1 for p in products if p["unit_sale_price"] < p["unit_price"])
print(f"{len(products)} products written to {OUT}")
print(f"  {on_sale_count} with sale prices")
print(f"  feed URL once pushed: {SITE}/feed.xml")
print()
print("First item:")
print("\n".join(items[0].split("\n")[:8]))
