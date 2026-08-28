# Insider One demo storefront — multi-vertical

One deploy, one codebase, many subverticals — each on its own subdomain:

    https://beauty.insiderdemo.com      Lumen        makeup, skincare, fragrance
    https://lifestyle.insiderdemo.com   Posh Street  footwear, home, pets

The subdomain is what picks the vertical. That matters for campaign targeting:
a rule scoped to `beauty.insiderdemo.com` cannot collide with another vertical,
whereas a shared domain would need every rule to also match a query parameter —
across eight verticals and several campaign types, that goes wrong eventually.

`?v=beauty` still works on localhost and Netlify deploy previews, where there is
no subdomain to read.

Each vertical brings its own catalog, XML feed, brand, copy, palette and
journey wording. The runtime — `store.js`, `eureka.js`, `reco.js`,
`insider-debug.js` — is shared and should stay that way.

## Structure

Two levels. `vertical` is the parent, `subvertical` the child; a vertical with
no children repeats the name in both.

```
Retail     Beauty · Fashion · Luxury · Supermarkets · Lifestyle
Travel     Hotels · Airlines
Banking    Banking · Insurance · Fintech
Telco      Telco
```

`python3 build.py --list` prints this with build status for each.

## One template, many journeys

Every vertical is a catalog of things with a price, an image and a category —
handsets, hotel rooms, insurance policies, lipsticks. What changes is the
wording of the journey, not the page model, so each entry can override labels:

```json
"labels": {
  "add_to_cart": "Reserve",
  "cart": "Your stay",
  "checkout": "Complete booking",
  "place_order": "Confirm booking",
  "confirm_title": "Your booking is confirmed."
}
```

Anything omitted falls back to `_labels_default`. Worked examples for telco,
hotels, airlines, banking and insurance are in the `_planned_*` stubs.

A catalog is worth having even where it feels tangential — a recommender
strip showing "customers also viewed this handset" demos far better than an
empty slot, and it costs nothing to include.

Account: **onesandbox (10014057)** · Domain: **insiderdemo.com**

---

## Adding a vertical

Three steps, about ten minutes.

**1. Get the catalog.** Most retailers run Shopify, which exposes its catalog
publicly. Shopify caps the endpoint at **250 products per page**, so a real
catalog comes in several files:

```
https://<store>/products.json?limit=250&page=1   ->  sources/<key>-1.json
https://<store>/products.json?limit=250&page=2   ->  sources/<key>-2.json
https://<store>/products.json?limit=250&page=3   ->  sources/<key>-3.json
```

Keep going until a page returns `{"products":[]}`. `build.py` merges every file
matching the `source` glob and deduplicates on product id, so overlapping dumps
are harmless and you can add pages later without redoing anything.

Aim for **500+ products per vertical**. Search relevance, faceting and
recommendation quality all look thin below that. Prefer multi-brand retailers
over single labels — a boutique brand's entire catalogue is often under 150
products, and retailers also give you real brand variety for merchandising
rules. Some stores disable the endpoint; try another.

**2. Add a config block.** Copy `_template` in `verticals.json`, rename the key,
and fill in brand, copy, theme and collections. The one part that needs thought
is `collections`, which maps Shopify `product_type` values to the collections
shown on site. Anything unmapped is dropped, which is how merch, gift cards and
samples get filtered out.

To see what you're mapping:

```bash
python3 -c "import json,collections; \
print(collections.Counter(p['product_type'] for p in json.load(open('sources/<key>.json'))['products']).most_common())"
```

**3. Build.**

```bash
python3 build.py <key>     # one vertical
python3 build.py --all     # everything
python3 build.py --list    # what's configured, what has a source, what's built
```

**4. Point the subdomain at the site.** In Netlify: Domain management > Add
domain alias > `<key>.insiderdemo.com`. DNS is already managed by Netlify, so it
resolves in a minute or two and the certificate follows.

**5. Register it on the account.** Add `https://<key>.insiderdemo.com/` to the
multiDomains list in InOne. The tag loads on any domain but ingests on none
unless the origin is registered — that failure mode is silent, so this step is
easy to skip and expensive to debug.

Then commit. Feeds are served from the apex —
`https://insiderdemo.com/feeds/<key>.xml` — and stay there regardless of which
subdomain the store runs on.

---

## Panel setup, per vertical

The site side is one command. The panel side is the part that takes time.

**XML integration** — Components > Product Catalog Management > XML Integration.

| Field | Value |
|---|---|
| Format | Google Merchant |
| Source URL | `https://insiderdemo.com/feeds/<key>.xml` |
| Product tag | `item` |
| Currency | USD |
| Locale | see the note below |

**Attribute mapping** — Google Merchant auto-maps most of it, but check these
four, which the wizard gets wrong or leaves blank:

| Insider attribute | XML field |
|---|---|
| url | `link` — *not* `image_link`, which is what it defaults to |
| original_price.USD | `g:price` |
| price.USD | `g:sale_price` |
| in_stock | Custom Match on `g:availability` → `in stock` |

**Locale.** An XML integration binds one catalog to one locale. If a locale can
only hold one catalog, eight verticals need eight locales, and each vertical's
`user.language` push has to match its catalog locale or Eureka returns nothing.
Confirm this before loading the third catalog — it is expensive to redo.

**Then** Eureka campaigns (JavaScript SDK type, targeting `/search` and
`/category`) and Smart Recommender campaigns (Integrate via JavaScript SDK,
IDs into `assets/config.js`).

Scope every rule to that vertical's hostname — `beauty.insiderdemo.com`, not
`insiderdemo.com`, or it will fire on all eight. Match on `/search` rather than
`/search.html`, since Netlify serves both forms. Set campaigns Live rather than
Test, and regenerate the panel after editing.

---

## Feed format

Three things that fail validation, all encoded in `build.py`:

- prices must be **bare numbers** — `105.00`, not `105.00 USD`
- the title tag must be **`g:title`**, not `title`
- **`g:sale_price` on every item**, not just discounted ones, because Insider
  marks `price.USD` required

---

## Product identity

Every catalog record is a Shopify **variant**, because that is what the Insider
catalog is keyed on:

    id        = "48440263049461"   variant id  ← the catalog key
    groupcode = "9763083223285"    product id

Getting this wrong means recommendations return IDs that resolve to nothing.
Product pages show a picker for sibling variants; switching shade is a real
navigation, because each variant is its own catalog record needing its own
product view. Grids show one card per product, not one per shade.

---

## Layout

```
verticals.json        every vertical's config
build.py              sources -> catalogs + feeds
sources/<key>.json    Shopify exports (input)
catalogs/<key>.js     generated: CATALOG, COLLECTIONS, VERTICAL
feeds/<key>.xml       generated: Google Merchant feed

index category product search cart checkout confirmation account   (.html)

assets/
  vertical.js         picks the catalog from ?v=, applies theme and copy
  config.js           account and campaign settings
  store.js            cart, identity, sign-in, rendering
  insider-debug.js    on-page SDK telemetry console
  eureka.js           search + category listing
  reco.js             Smart Recommender
  styles.css          themed by CSS variables that vertical.js overrides
```

`serve.py` runs it locally with the same no-store headers as production.
