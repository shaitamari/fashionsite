# Posh Street — Insider One demo storefront

A plain multi-page storefront wired to the **salesdemo** account (`10002548`), built on the **real Posh Street catalog**. No framework, no bundler, no service worker, no client-side router. Every navigation is a real page load, so the Insider Tag re-initialises from scratch each time.

## The important part: product identity

The catalog is keyed on **Shopify variant id**, because that is what salesdemo is keyed on:

```
id        = "46156615385362"   Shopify VARIANT id  ← the catalog key
groupcode = "8526117110034"    Shopify PRODUCT id
```

This is why the previous build's recommendations never rendered: it used invented ids that did not exist in salesdemo, so every returned id resolved to nothing. Now Smart Recommender and Eureka return ids that match local products, and clicks stay on this site.

250 variants across three collections — Shoes Collection (128), Home Decor (74), Pets Collection (48) — generated from the live Shopify export by `build_catalog.py`. Images are served from Shopify's CDN, so the store looks like Posh without hosting any assets.

### Refreshing the catalog

```bash
# save https://poshstreet.shop/products.json?limit=250 over the old export
python3 build_catalog.py
```

Shopify pages at 250. This export covers footwear, home and pets; **apparel lives on later pages** (`&page=2`, `&page=3`). Add those exports and re-run to bring in Women's and Men's Collection, which is also where multi-variant sizing appears — the code already handles it, there just aren't any size variants in this slice.

### One caution about the shared catalog

With Clickstream enabled, a `type: 'product'` push updates the catalog record. Since this site and the live Posh store write to the same salesdemo catalog, the `url` field here is deliberately set to the **canonical poshstreet.shop URL**, not this site's, so browsing the demo cannot overwrite Posh's own product URLs in emails and campaigns. Navigation inside this site is handled client-side and is unaffected.

---

## Run it

```bash
python3 serve.py          # http://localhost:8000
```

Use this rather than `python3 -m http.server` — it sends the same `no-store` headers as production.

## Deploy it

Static host, no build step. Cache headers are pre-written: `_headers` (Netlify / Cloudflare Pages), `netlify.toml`, `vercel.json`. All send `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`.

The `<meta http-equiv>` cache tags in each page are a second line only — browsers largely ignore them. The response headers do the work.

---

## Panel prerequisites

### Custom attributes and events

Create in **InOne → Attributes and Events**. Values for undefined names are dropped silently.

| Attribute | Type |  | Event | Parameters |
|---|---|---|---|---|
| `membership_tier` | string |  | `site_search` | `search_term`, `results_count` |
| `loyalty_points` | number |  | `product_wishlisted` | `product_id`, `product_name` |
| `preferred_category` | string |  | `size_guide_opened` | `product_id` |
| `signup_date` | datetime |  | `newsletter_signup` | `source` |
| `is_vip` | boolean |  | `filter_applied` | `filter_name`, `filter_value` |

### Eureka

- **Search pop-up** — a Pop-up campaign attached to `<input id="search-input">` (same markup on all eight pages). No code here touches it; the panel owns its rendering and logging. Point its "view all results" redirect at `/search.html?q={query}`.
- **Full-page search** — a **JavaScript SDK** campaign matching `/search`.
- **Category pages** — a **JavaScript SDK** campaign matching `/category`.

Campaign ids come from `eureka:sdk:campaign:ready`, so nothing is hard-coded. Control-group visitors get local data and **still** fire the same track call, which is what keeps the A/B read valid.

### Smart Recommender

**Integrate via JavaScript SDK** campaigns; put ids in `config.js` under `reco.campaigns`. Slots: `#reco-home`, `#reco-product`, `#reco-cart`, `#reco-confirmation`. Leave an id `null` and the slot takes the first campaign that fires on that page.

Markup follows **Track 2** (`ins-preview-wrapper-{variationId}`, `ins-web-smart-recommender-body`, `data-recommended-items`, `ins-product-id`, `event-collection="true"`), so impressions and clicks reach the analytics dashboard.

### Targeting, given Posh runs on the same account

Scope every rule to this hostname, not just a path, or Posh's live campaigns and this site's will collide. Note Netlify serves both `/search` and `/search.html`, so match on `/search` rather than the extension.

---

## What each page sends

Order on every page: `InsiderQueue` → tag → `user` → `currency` → page type → `init`.

| Page | Page type | Also sends |
|---|---|---|
| `index.html` | `home` | `newsletter_signup` |
| `category.html` | `category` (breadcrumb) | `filter_applied` on sort |
| `product.html` | `product` (full variant record) | `add_to_cart`, `product_wishlisted`, `size_guide_opened` |
| `search.html` | `other` — "search results" | `site_search`, restated with real `results_count` |
| `cart.html` | `cart` (total + items) | `add_to_cart`, `remove_from_cart`, re-`init` on change |
| `checkout.html` | `other` — "checkout" | `user` with the collected fields |
| `confirmation.html` | `purchase` (order + items) | — |
| `account.html` | `other` — "account" | `user` + `init` on save |

Two deliberate choices: `type: 'cart'` is pushed only on the cart page, because it sets the page type *and* refreshes contents — pushing it everywhere means two page types per load. And every mid-page `type: 'user'` is followed by `init`, because a user push alone is never transmitted.

---

## The telemetry console

Bottom-right pill on every page. Wraps `InsiderQueue.push` and mirrors each payload with timestamps.

- Status: tag loaded, Eureka availability, page type, visitor uuid, signed-in state
- **Copy log** — whole session as JSON
- **New visitor** — clears identity and cart, reloads
- `?debug=0` hides it for clean screen shares

Green-bordered rows are `init` pushes. Raw log at `window.insDebugLog`.

The `source` line under each grid says where the products on screen came from: green for Eureka, rust for the local fallback.

---

## Files

```
index category product search cart checkout confirmation account  (.html)

assets/
  config.js         account + campaign settings
  catalog.js        250 variants, generated
  store.js          cart, identity, sign-in, rendering
  insider-debug.js  telemetry console
  eureka.js         search + category listing
  reco.js           Smart Recommender
  styles.css

build_catalog.py    regenerate catalog.js from products.json
serve.py            local server with production headers
_headers  netlify.toml  vercel.json
```
