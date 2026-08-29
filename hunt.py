#!/usr/bin/env python3
"""Find and download Shopify catalogs for a vertical.

Most retailers on Shopify expose /products.json publicly. This checks a list of
candidate domains, reports which ones work and how big their catalog is, then
downloads the good ones.

    python3 hunt.py check electronics          # test the built-in candidates
    python3 hunt.py check mystore.com other.com   # test specific domains
    python3 hunt.py grab mystore.com electronics   # download as-is
    python3 hunt.py borrow mystore.com electronics # download, rebrand, rehost

`grab` writes sources/<vertical>-1.json, -2.json ... which build.py merges.

Nothing here is scraping: products.json is a public endpoint Shopify provides
for exactly this purpose. Stores that disable it simply return 404 and get
skipped.
"""
import json, os, ssl, sys, time, urllib.request, urllib.error

os.chdir(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def _verified_context():
    """certifi if present, otherwise the system default."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _unverified_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


# Python on macOS ships without the system certificate store, so HTTPS fails
# verification until Install Certificates.command is run. Try verified first,
# fall back to unverified — acceptable for reading a public product feed.
SSL_VERIFIED = _verified_context()
SSL_UNVERIFIED = _unverified_context()
_ssl_warned = [False]


def _open(req, timeout):
    try:
        return urllib.request.urlopen(req, timeout=timeout, context=SSL_VERIFIED)
    except ssl.SSLError:
        if not _ssl_warned[0]:
            print("  (certificate verification failed — continuing unverified;")
            print("   run `pip3 install certifi` or Install Certificates.command to fix properly)\n")
            _ssl_warned[0] = True
        return urllib.request.urlopen(req, timeout=timeout, context=SSL_UNVERIFIED)
    except urllib.error.URLError as e:
        if isinstance(getattr(e, "reason", None), ssl.SSLError):
            if not _ssl_warned[0]:
                print("  (certificate verification failed — continuing unverified;")
                print("   run `pip3 install certifi` or Install Certificates.command to fix properly)\n")
                _ssl_warned[0] = True
            return urllib.request.urlopen(req, timeout=timeout, context=SSL_UNVERIFIED)
        raise

# Starting points per vertical. These are guesses — `check` tells you which
# actually work, and you can pass your own domains instead.
CANDIDATES = {
    "electronics": ["jbhifi.com.au", "sennheiser.com", "turtlebeach.com", "elgato.com",
                    "svsound.com", "nomadgoods.com", "boat-lifestyle.com", "tivoliaudio.com",
                    "ugreen.com", "anker.com", "soundcore.com", "case-mate.com"],
    "fashion":     ["fashionnova.com", "aloyoga.com", "gymshark.com", "represent.com",
                    "cider.com", "princesspolly.com", "peppermayo.com", "hellomolly.com",
                    "meshki.com.au", "showpo.com", "whitefoxboutique.com", "oh-polly.com"],
    "luxury":      ["farfetch.com", "vestiairecollective.com", "therealreal.com",
                    "mytheresa.com", "cettire.com", "ssense.com", "matchesfashion.com",
                    "brownsfashion.com", "lyst.com", "hardlyeverwornit.com"],
    # Big grocers run custom platforms, so aim at specialty food retailers —
    # they are on Shopify and have real product photography. Two or three
    # together cover enough aisles to read as a supermarket.
    "supermarket": ["souschef.co.uk", "thespicery.com", "borough-market-online.myshopify.com",
                    "farmison.com", "pastaevangelists.com", "odysea.com",
                    "buywholefoodsonline.co.uk", "healthysupplies.co.uk",
                    "realfoods.co.uk", "hidayahfoods.co.uk", "melburyandappleton.co.uk",
                    "theasiancookshop.co.uk", "britishcornershop.co.uk",
                    "gousto.co.uk", "planetorganic.com", "wholefoodsearth.com",
                    "japancentre.com", "souschef.co.uk", "natoora.co.uk",
                    "hoxtonmonstersupplies.com"],
    "telco":       ["backmarket.com", "swappie.com", "reboxed.co", "gazelle.com",
                    "mobileshop.eu", "phonebot.com.au", "mresell.com", "refurbed.com"],
    "home":        ["article.com", "burrow.com", "floydhome.com", "made.com",
                    "castlery.com", "interiordefine.com", "joybird.com", "koala.com"],
}


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with _open(req, timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def probe(domain, verbose=False):
    """Return (product_count, note). count of -1 means unusable.

    Reports the actual failure rather than a generic message — a 403 from
    Cloudflare and a missing endpoint need different responses.
    """
    attempts = []
    for scheme in ("https://www.", "https://"):
        url = f"{scheme}{domain}/products.json?limit=250"
        try:
            data = fetch(url)
        except urllib.error.HTTPError as e:
            attempts.append(f"{e.code}")
            continue
        except urllib.error.URLError as e:
            attempts.append(f"{type(e.reason).__name__ if hasattr(e,'reason') else 'URLError'}")
            continue
        except json.JSONDecodeError:
            attempts.append("not JSON (probably an HTML page)")
            continue
        except Exception as e:
            attempts.append(type(e).__name__)
            continue

        products = data.get("products")
        if products is None:
            return -1, "JSON but no products key"
        if not products:
            return 0, "empty catalog"

        p = products[0]
        types = {x.get("product_type") for x in products if x.get("product_type")}
        return len(products), f'{scheme}{domain}  ·  eg "{p["title"][:38]}"  ·  {len(types)} types'

    return -1, " / ".join(attempts) or "unreachable"


def check(domains):
    print(f"\n{'domain':32s} {'page 1':>8s}   notes")
    print("-" * 96)
    good = []
    for d in domains:
        n, note = probe(d)
        if n > 0:
            good.append((d, n))
            print(f"{d:32s} {n:8d}   {note}")
        else:
            print(f"{d:32s} {'—':>8s}   {note}")
        time.sleep(0.4)

    if good:
        print("\nWorking. 250 on page 1 usually means there are more pages:")
        for d, n in sorted(good, key=lambda x: -x[1]):
            print(f"  python3 hunt.py grab {d} <vertical>")
    else:
        print("\nNothing usable. Try other retailers — multi-brand ones tend to be bigger.")


def grab(domain, vertical, max_pages=12):
    os.makedirs("sources", exist_ok=True)
    total, page = 0, 1
    while page <= max_pages:
        got = None
        for scheme in ("https://www.", "https://"):
            try:
                got = fetch(f"{scheme}{domain}/products.json?limit=250&page={page}")
                break
            except Exception:
                continue
        if got is None:
            print(f"  page {page}: failed, stopping")
            break

        products = got.get("products", [])
        if not products:
            print(f"  page {page}: empty — done")
            break

        path = f"sources/{vertical}-{page}.json"
        json.dump({"products": products}, open(path, "w"))
        total += len(products)
        print(f"  page {page}: {len(products):4d} products  ->  {path}")
        page += 1
        time.sleep(0.6)

    print(f"\n{total} products for '{vertical}'.")
    if total < 500:
        print("Thin for a search demo. Consider a second store, or a bigger retailer.")
    print(f"\nNext: add a '{vertical}' block to verticals.json, then")
    print(f"  python3 build.py {vertical}")



# --------------------------------------------------------------------- borrow

# Invented brands per vertical. Positioned deliberately — a premium tier, a
# value tier, a couple of mid-range — so "boost the premium brand" and similar
# merchandising rules are demoable rather than arbitrary.
BRANDS = {
    "electronics": [("Nordvik", "premium"), ("Aurelian", "premium"), ("Kestrel", "mid"),
                    ("Meridian Home", "mid"), ("Palto", "mid"), ("Brightwell", "value"),
                    ("Everdon", "value")],
    "home":        [("Aldgate", "premium"), ("Rowan & Vale", "premium"), ("Marlow", "mid"),
                    ("Fenwick House", "mid"), ("Stanmore", "mid"), ("Oakline", "value"),
                    ("Trenton", "value")],
    "fashion":     [("Ashford Lane", "premium"), ("Verity", "premium"), ("Nine Mile", "mid"),
                    ("Corso", "mid"), ("Halden", "mid"), ("Brixton Row", "value"),
                    ("Tallow", "value")],
    "luxury":      [("Beaumont Vale", "premium"), ("Maison Lorei", "premium"),
                    ("Aurelle", "premium"), ("Saint Auban", "premium"), ("Verrocchio", "premium")],
    "supermarket": [("Harvest Row", "premium"), ("Ferndale", "premium"), ("Kitchen Table", "mid"),
                    ("Greenbank", "mid"), ("Daily Basket", "value"), ("Pennywise", "value")],
    "telco":       [("Aether", "premium"), ("Northpoint", "premium"), ("Vantis", "mid"),
                    ("Cobalt", "mid"), ("Ridgeway", "value")],
}

# Model-name fragments, so generated names read like products rather than codes.
SERIES = ["Aria", "Vega", "Lumen", "Atlas", "Vista", "Corin", "Nova", "Juno", "Selva",
          "Orbis", "Kite", "Harlow", "Sable", "Mira", "Pike", "Solace", "Wren", "Tor"]


def _singular(word):
    """Product types arrive plural — "Washing Machines" — but a product name
    reads as one item."""
    exceptions = {"Dishes": "Dish", "Knives": "Knife", "Shelves": "Shelf",
                  "Accessories": "Accessory", "Watches": "Watch", "Boxes": "Box"}
    if word in exceptions:
        return exceptions[word]
    for suffix, repl in (("ies", "y"), ("ses", "s"), ("shes", "sh"), ("ches", "ch")):
        if word.endswith(suffix):
            return word[: -len(suffix)] + repl
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def invent_name(original, product_type, brand, rnd):
    """A plausible product name built from the type, so the catalog reads as
    one retailer's own range rather than a scrape of someone else's."""
    import re as _re
    kind = (product_type or "").strip() or "Product"
    kind = " ".join(_singular(w) for w in kind.replace("_", " ").title().split())
    series = rnd.choice(SERIES)

    # Carry any size or capacity through — "10kg", "55 inch", "1800W" — because
    # those are exactly what people search an appliance catalog for.
    spec = ""
    m = _re.search(r"\b(\d+(?:\.\d+)?\s?(?:kg|litre|liter|ltr|l|ml|cm|mm|inch|in|w|kw))\b",
                   original or "", _re.I)
    if m:
        raw = _re.sub(r"\s+", "", m.group(1))
        # Wattage reads as 1800W, capacity as 10kg, screens as 55"
        spec = (raw.upper() if _re.search(r"(?i)k?w$", raw) else raw.lower())
        spec = spec.replace("inch", '"') + " "

    return _re.sub(r"\s+", " ", f"{brand} {series} {spec}{kind}").strip()


def _sized(url, width=1000):
    """Ask the CDN for a resized copy rather than the original.

    Shopify serves any product image at an arbitrary width via a query
    parameter, so pulling `?width=1000` fetches roughly a tenth of the bytes
    of the original and lands at exactly the size the site displays. Saves
    both the download time and the shrink pass afterwards.
    """
    if "cdn.shopify.com" in url or "/cdn/shop/" in url:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}width={width}"
    return url


def download_image(url, out_dir, name, seen):
    """Fetch once, reuse thereafter. Rehosting rather than hotlinking so a
    demo never depends on someone else's CDN staying up."""
    if url in seen:
        return seen[url]
    ext = ".jpg"
    for e in (".png", ".webp", ".jpeg", ".gif"):
        if e in url.lower():
            ext = e
            break
    path = f"{out_dir}/{name}{ext}"
    if not os.path.exists(path):
        for attempt in (_sized(url), url):        # sized first, original as fallback
            try:
                req = urllib.request.Request(attempt, headers={"User-Agent": UA})
                with _open(req, 25) as r:
                    data = r.read()
                if len(data) < 500:
                    continue
                open(path, "wb").write(data)
                break
            except Exception:
                continue
        else:
            return None
    seen[url] = path
    return path


def borrow(domain, vertical, max_pages=12, max_images=1200, prefix="1"):
    """Pull a catalog, reassign brands and names, rehost the imagery."""
    import random, hashlib
    rnd = random.Random(hashlib.md5(vertical.encode()).hexdigest())
    brands = BRANDS.get(vertical) or [(vertical.title(), "mid")]

    img_dir = f"assets/img/{vertical}"
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs("sources", exist_ok=True)

    seen_images, downloaded, page, total = {}, 0, 1, 0
    while page <= max_pages:
        got = None
        for scheme in ("https://www.", "https://"):
            try:
                got = fetch(f"{scheme}{domain}/products.json?limit=250&page={page}")
                break
            except Exception:
                continue
        if got is None or not got.get("products"):
            break

        out = []
        for p in got["products"]:
            brand, tier = brands[rnd.randrange(len(brands))]
            p["vendor"] = brand
            p["title"] = invent_name(p.get("title", ""), p.get("product_type"), brand, rnd)
            p["tags"] = [t for t in (p.get("tags") or []) if len(t) < 30][:6] + [tier]

            images = []
            for i, img in enumerate(p.get("images", [])[:3]):
                if downloaded >= max_images:
                    break
                src = img.get("src")
                if not src:
                    continue
                local = download_image(src, img_dir, f"{p['id']}-{i}", seen_images)
                if local:
                    if local not in seen_images.values() or True:
                        downloaded += 1
                    images.append({"src": local})
            if not images:
                continue
            p["images"] = images
            for v in p.get("variants", []):
                v["featured_image"] = None
            out.append(p)

        # prefix keeps several stores in one vertical from overwriting
        # each other; build.py merges everything matching the glob.
        path = f"sources/{vertical}-{prefix}{page:02d}.json"
        json.dump({"products": out}, open(path, "w"))
        total += len(out)
        print(f"    page {page}: {len(out):4d} products, {downloaded} images  ->  {path}")
        page += 1
        time.sleep(0.5)

    print(f"\n{total} products for '{vertical}' · {downloaded} images in {img_dir}")
    print(f"brands: {', '.join(b for b, _ in brands)}")
    print(f"\nNext: add a '{vertical}' block to verticals.json, then")
    print(f"  python3 build.py {vertical}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        print("built-in candidate lists:", ", ".join(CANDIDATES))
        sys.exit(0)

    cmd = args[0]
    if cmd == "check":
        rest = args[1:]
        if not rest:
            print("Pick a vertical or pass domains. Available:", ", ".join(CANDIDATES))
            sys.exit(1)
        domains = CANDIDATES.get(rest[0], rest) if len(rest) == 1 else rest
        check(domains)
    elif cmd == "borrow":
        if len(args) < 3:
            print("usage: python3 hunt.py borrow <domain> <vertical>")
            sys.exit(1)
        borrow(args[1], args[2])
    elif cmd == "grab":
        if len(args) < 3:
            print("usage: python3 hunt.py grab <domain> <vertical>")
            sys.exit(1)
        grab(args[1], args[2])
    else:
        print(__doc__)
