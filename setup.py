#!/usr/bin/env python3
"""Build every vertical in one pass.

    python3 setup.py                 # everything not already built
    python3 setup.py electronics     # just one
    python3 setup.py --force         # rebuild even if sources exist
    python3 setup.py --plan          # show the plan, change nothing

For each vertical it will:
  1. probe candidate stores and pick the ones that work
  2. pull their catalogs, reassign brands, rename products, rehost images
  3. derive collections from what actually came back
  4. write the config block into verticals.json
  5. build the catalog and feed

Verticals with no store behind them (banking, hotels…) come from generate.py
instead. Same output either way, so build.py can't tell the difference.

Safe to re-run: anything already sourced is skipped unless --force.
"""
import json, os, subprocess, sys, collections

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

TARGET_PRODUCTS = 700          # per vertical; stop pulling stores past this
MAX_STORES_PER_VERTICAL = 3

# Never touch these. Customers, or otherwise off-limits.
EXCLUDE = {"jbhifi.com.au"}


# --------------------------------------------------------------------------
# One entry per vertical. `candidates` is a starting list; whichever respond
# get used. `generator` means build it from generate.py instead.
PLAN = {
    "fashion": {
        "vertical": "Retail", "subvertical": "Fashion",
        "brand": "Ashford Lane", "tagline": "Womenswear, menswear and footwear",
        "hero_title": "Dress for the<br>life you have.", "hero_cta": "Shop new in",
        "hero_lede": "Everyday clothing built to last longer than the season.",
        "hero_eyebrow": "New season", "announce": "Free returns within 30 days",
        "search_placeholder": "Search clothing, shoes, accessories",
        "newsletter_title": "First look", "newsletter_lede": "New arrivals and early access to sale.",
        "tiles_title": "Shop by category", "grid_title": "New in", "reco_title": "Picked for you",
        "theme": {"bg": "#FFFDFB", "alt": "#F4EFE9", "ink": "#211E1C", "muted": "#726A64",
                  "rule": "#E5DDD4", "accent": "#8C5A3C",
                  "display": "'Fraunces', Georgia, serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Jost:wght@300;400;500"},
        "candidates": ["princesspolly.com", "peppermayo.com", "hellomolly.com",
                       "whitefoxboutique.com", "oh-polly.com", "meshki.com.au",
                       "showpo.com", "cider.com"],
    },
    "electronics": {
        "vertical": "Retail", "subvertical": "Electronics",
        "brand": "Kestrel", "tagline": "Home appliances and technology",
        "hero_title": "Built to run<br>for years.", "hero_cta": "Shop appliances",
        "hero_lede": "Appliances, audio and technology, with installation included.",
        "hero_eyebrow": "This season", "announce": "Free delivery and installation over €300",
        "search_placeholder": "Search appliances, TVs, audio",
        "newsletter_title": "Deals first", "newsletter_lede": "Price drops and new models, monthly.",
        "tiles_title": "Shop by category", "grid_title": "New models", "reco_title": "You might also like",
        "theme": {"bg": "#FCFCFD", "alt": "#EFF1F4", "ink": "#15181C", "muted": "#616873",
                  "rule": "#DDE1E7", "accent": "#1D4E89",
                  "display": "'Jost', Helvetica, sans-serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Jost:wght@300;400;500;600"},
        "candidates": ["svsound.com", "turtlebeach.com", "tivoliaudio.com", "ugreen.com"],
    },
    "telco": {
        "vertical": "Telco", "subvertical": "Telco",
        "brand": "Vantis", "tagline": "Phones, plans and accessories",
        "hero_title": "Better signal.<br>Fewer surprises.", "hero_cta": "Shop devices",
        "hero_lede": "Handsets, accessories and plans with no lock-in.",
        "hero_eyebrow": "Connect", "announce": "Keep your number · No contract",
        "search_placeholder": "Search phones and accessories",
        "newsletter_title": "Stay posted", "newsletter_lede": "New devices and plan changes.",
        "tiles_title": "Shop by category", "grid_title": "Latest devices", "reco_title": "Pairs well with",
        "theme": {"bg": "#FDFDFC", "alt": "#EEF2EF", "ink": "#12201A", "muted": "#5F6F68",
                  "rule": "#DAE3DE", "accent": "#136B4B",
                  "display": "'Jost', Helvetica, sans-serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Jost:wght@300;400;500;600"},
        "candidates": ["case-mate.com", "nomadgoods.com", "boat-lifestyle.com"],
    },
    "home": {
        "vertical": "Retail", "subvertical": "Home",
        "brand": "Aldgate", "tagline": "Furniture and homeware",
        "hero_title": "Rooms that<br>settle in.", "hero_cta": "Shop living",
        "hero_lede": "Furniture made to be lived with, not looked after.",
        "hero_eyebrow": "New collection", "announce": "Free delivery on orders over €200",
        "search_placeholder": "Search furniture and homeware",
        "newsletter_title": "Room by room", "newsletter_lede": "New pieces and styling ideas.",
        "tiles_title": "Shop by room", "grid_title": "New in", "reco_title": "Completes the room",
        "theme": {"bg": "#FDFCFA", "alt": "#F1EDE6", "ink": "#221F1B", "muted": "#6E6862",
                  "rule": "#E3DCD1", "accent": "#6B5B3E",
                  "display": "'Fraunces', Georgia, serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Jost:wght@300;400;500"},
        "candidates": ["floydhome.com", "burrow.com", "castlery.com", "koala.com",
                       "article.com", "joybird.com"],
    },
    "luxury": {
        "vertical": "Retail", "subvertical": "Luxury",
        "brand": "Beaumont Vale", "tagline": "Designer, curated",
        "hero_title": "Fewer things.<br>Better ones.", "hero_cta": "Shop the edit",
        "hero_lede": "A small, considered selection from designers worth keeping.",
        "hero_eyebrow": "The edit", "announce": "Complimentary delivery and returns worldwide",
        "search_placeholder": "Search designers and pieces",
        "newsletter_title": "Private view", "newsletter_lede": "New arrivals, before anyone else.",
        "tiles_title": "Browse the edit", "grid_title": "Just arrived", "reco_title": "You may also like",
        "theme": {"bg": "#FBFAF8", "alt": "#EDEAE4", "ink": "#191714", "muted": "#6B655C",
                  "rule": "#DFD9CE", "accent": "#8A7145",
                  "display": "'Fraunces', Georgia, serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Jost:wght@300;400;500"},
        "candidates": ["cettire.com", "hardlyeverwornit.com", "vestiairecollective.com"],
    },
    "supermarket": {
        "vertical": "Retail", "subvertical": "Supermarkets",
        "brand": "Harvest Row", "tagline": "Food, drink and household",
        "hero_title": "Your weekly shop,<br>done properly.", "hero_cta": "Start shopping",
        "hero_lede": "Fresh food, cupboard staples and household essentials.",
        "hero_eyebrow": "This week", "announce": "Free delivery over €60 · Slots seven days a week",
        "search_placeholder": "Search groceries",
        "newsletter_title": "This week's offers", "newsletter_lede": "Deals and seasonal picks, weekly.",
        "tiles_title": "Shop by aisle", "grid_title": "New this week", "reco_title": "Often bought together",
        "theme": {"bg": "#FDFDFA", "alt": "#EFF3E9", "ink": "#1A2016", "muted": "#626B5B",
                  "rule": "#DEE5D4", "accent": "#3F6B2E",
                  "display": "'Jost', Helvetica, sans-serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Jost:wght@300;400;500;600"},
        "candidates": ["thrivemarket.com", "misfitsmarket.com", "weee.com", "iherb.com"],
    },

    # No store behind these — generate.py builds them. hotels and airlines
    # already have hand-written configs in verticals.json and are left alone.
    "hotels":    {"generator": "hotels", "keep_config": True},
    "airlines":  {"generator": "airlines", "keep_config": True},

    "banking": {
        "generator": "banking", "vertical": "Banking", "subvertical": "Banking",
        "brand": "Northbank", "tagline": "Everyday banking, cards and lending",
        "hero_title": "Banking that<br>stays out of the way.", "hero_cta": "Explore products",
        "hero_lede": "Accounts, cards, loans and mortgages, without the branch visit.",
        "hero_eyebrow": "Personal", "announce": "FSCS protected · Open an account in minutes",
        "search_placeholder": "Search accounts, cards, loans",
        "newsletter_title": "Rate alerts", "newsletter_lede": "Rate changes and new products.",
        "tiles_title": "Browse products", "grid_title": "Popular", "reco_title": "You might also need",
        "theme": {"bg": "#FCFDFE", "alt": "#EDF1F6", "ink": "#131B24", "muted": "#5E6A78",
                  "rule": "#DCE3EB", "accent": "#1E3A57",
                  "display": "'Jost', Helvetica, sans-serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Jost:wght@300;400;500;600"},
    },
    "insurance": {
        "generator": "insurance", "vertical": "Banking", "subvertical": "Insurance",
        "brand": "Fairhaven", "tagline": "Cover for the things that matter",
        "hero_title": "Cover you can<br>actually read.", "hero_cta": "Compare cover",
        "hero_lede": "Motor, home, travel and life cover with no jargon and no auto-renewal.",
        "hero_eyebrow": "Protect", "announce": "Cover starts the day you buy · 14-day cooling off",
        "search_placeholder": "Search cover types",
        "newsletter_title": "Stay covered", "newsletter_lede": "Renewal reminders and cover tips.",
        "tiles_title": "Browse cover", "grid_title": "Popular cover", "reco_title": "Often taken together",
        "theme": {"bg": "#FCFDFC", "alt": "#EBF3EE", "ink": "#141E19", "muted": "#5C6B63",
                  "rule": "#D8E5DD", "accent": "#23503F",
                  "display": "'Jost', Helvetica, sans-serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Jost:wght@300;400;500;600"},
    },
    "fintech": {
        "generator": "fintech", "vertical": "Banking", "subvertical": "Fintech",
        "brand": "Loop", "tagline": "Money, moved properly",
        "hero_title": "Money that<br>keeps up.", "hero_cta": "Explore plans",
        "hero_lede": "Spend, save, invest and get paid — personal and business, one app.",
        "hero_eyebrow": "Plans", "announce": "No minimum balance · Cancel any time",
        "search_placeholder": "Search plans and accounts",
        "newsletter_title": "Product updates", "newsletter_lede": "New features, monthly.",
        "tiles_title": "Browse plans", "grid_title": "Most popular", "reco_title": "Works well with",
        "theme": {"bg": "#FDFCFF", "alt": "#F0ECFA", "ink": "#1A1630", "muted": "#645C80",
                  "rule": "#E1DAF2", "accent": "#4B3B9E",
                  "display": "'Jost', Helvetica, sans-serif", "body": "'Jost', Helvetica, sans-serif",
                  "fonts": "family=Jost:wght@300;400;500;600"},
    },
}

# Journey wording where "add to cart" would read wrong.
LABELS = {
    "banking":   {"add_to_cart": "Start application", "cart": "Your application",
                  "cart_title": "Your application", "cart_empty": "Nothing selected yet",
                  "checkout": "Review application", "place_order": "Submit application",
                  "order": "application", "confirm_title": "Your application is submitted.",
                  "browse_cta": "Explore products"},
    "insurance": {"add_to_cart": "Get a quote", "cart": "Your quote",
                  "cart_title": "Your quote", "cart_empty": "No cover selected yet",
                  "checkout": "Review quote", "place_order": "Buy cover",
                  "order": "policy", "confirm_title": "You're covered.",
                  "browse_cta": "Compare cover"},
    "fintech":   {"add_to_cart": "Get started", "cart": "Your plan",
                  "cart_title": "Your plan", "cart_empty": "Nothing selected yet",
                  "checkout": "Review", "place_order": "Confirm", "order": "signup",
                  "confirm_title": "You're all set.", "browse_cta": "Explore plans"},
    "telco":     {"add_to_cart": "Add to basket", "cart": "Basket", "cart_title": "Your basket",
                  "confirm_title": "Your order is confirmed."},
    "supermarket": {"add_to_cart": "Add to trolley", "cart": "Trolley",
                    "cart_title": "Your trolley", "cart_empty": "Your trolley is empty",
                    "confirm_title": "Your order is confirmed.", "browse_cta": "Start shopping"},
}


# --------------------------------------------------------------------------
def derive_collections(products, max_collections=6):
    """Group the store's product types into a handful of collections.

    Shopify product_type is messy — dozens of near-duplicates. Take the most
    common as collections and fold the tail into the nearest by word overlap,
    so the site's navigation stays short without discarding products.
    """
    counts = collections.Counter(
        (p.get("product_type") or "").strip() for p in products if p.get("product_type"))
    counts.pop("", None)
    if not counts:
        return {}, ["All"]

    tops = [t for t, _ in counts.most_common(max_collections)]
    mapping, order = {}, []

    def tidy(t):
        return " ".join(w.capitalize() for w in t.replace("_", " ").replace("-", " ").split())

    for t in tops:
        label = tidy(t)
        mapping[t] = label
        if label not in order:
            order.append(label)

    for t in counts:
        if t in mapping:
            continue
        words = set(t.lower().replace("_", " ").split())
        best, score = None, 0
        for cand in tops:
            overlap = len(words & set(cand.lower().replace("_", " ").split()))
            if overlap > score:
                best, score = cand, overlap
        mapping[t] = mapping[best] if best else order[0]

    return mapping, order


def sources_for(key):
    import glob
    return sorted(glob.glob(f"sources/{key}-*.json"))


def load_products(key):
    out = []
    for p in sources_for(key):
        try:
            out += json.load(open(p)).get("products", [])
        except Exception:
            pass
    return out


def run(cmd):
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run([sys.executable] + cmd, capture_output=False).returncode


# --------------------------------------------------------------------------
def source_vertical(key, spec, force=False):
    """Pull enough products for one vertical, from as many stores as it takes."""
    if spec.get("generator"):
        if sources_for(key) and not force:
            print(f"  already generated ({len(load_products(key))} products)")
            return True
        return run(["generate.py", spec["generator"]]) == 0

    if sources_for(key) and not force:
        print(f"  already sourced ({len(load_products(key))} products)")
        return True

    import hunt
    total, used = 0, []
    for domain in spec.get("candidates", []):
        if domain in EXCLUDE:
            print(f"  skipping {domain} (excluded)")
            continue
        if total >= TARGET_PRODUCTS or len(used) >= MAX_STORES_PER_VERTICAL:
            break
        n, note = hunt.probe(domain)
        if n <= 0:
            print(f"  {domain}: {note}")
            continue
        print(f"  {domain}: {n} on page 1 — pulling")
        before = len(load_products(key))
        hunt.borrow(domain, key, prefix=f"{len(used)+1}")
        gained = len(load_products(key)) - before
        total += gained
        used.append(domain)

    if not used:
        print(f"  ! no working store for '{key}' — add candidates to setup.py")
        return False
    print(f"  {total} products from {', '.join(used)}")
    return True


def configure(key, spec):
    """Write this vertical's block into verticals.json, deriving its
    collections from whatever actually came back."""
    cfg = json.load(open("verticals.json"))
    products = load_products(key)
    if not products:
        return False

    mapping, order = derive_collections(products)
    if spec.get("keep_config") and key in cfg and cfg[key].get("order"):
        print("  keeping existing hand-written config")
        return True

    block = {k: v for k, v in spec.items()
             if k not in ("candidates", "generator", "keep_config")}
    block.update({
        "template": "ecommerce",
        "source": f"sources/{key}-*.json",
        "collections": mapping or {"": "All"},
        "order": order,
        "subcats": {},
        "defaults": {c: "All" for c in order},
    })
    if key in LABELS:
        block["labels"] = LABELS[key]
    if "brand" not in block:                       # generated verticals carry their own
        existing = cfg.get(key, {})
        block = {**existing, **block}

    cfg[key] = block
    cfg.pop(f"_planned_{key}", None)
    json.dump(cfg, open("verticals.json", "w"), indent=2)
    print(f"  collections: {', '.join(order)}")
    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    force = "--force" in flags
    keys = args or list(PLAN)

    if "--plan" in flags:
        print(f"\n{'vertical':14s} {'parent':10s} {'source':38s} status")
        print("-" * 88)
        for k in keys:
            s = PLAN[k]
            src = "generate.py" if s.get("generator") else ", ".join(s.get("candidates", [])[:2]) + "…"
            built = "built" if os.path.exists(f"catalogs/{k}.js") else \
                    ("sourced" if sources_for(k) else "-")
            print(f"{k:14s} {s.get('vertical','?'):10s} {src[:38]:38s} {built}")
        print()
        return

    print(f"\nBuilding {len(keys)} vertical(s). Target {TARGET_PRODUCTS} products each.\n")
    done, failed = [], []
    for key in keys:
        if key not in PLAN:
            print(f"! unknown vertical: {key}")
            continue
        print(f"── {key} " + "─" * (60 - len(key)))
        spec = PLAN[key]
        if not source_vertical(key, spec, force):
            failed.append(key)
            continue
        if not configure(key, spec):
            failed.append(key)
            continue
        done.append(key)
        print()

    if done:
        print("Building catalogs and feeds…\n")
        run(["build.py"] + done)

    print(f"\n{len(done)} ready: {', '.join(done) or '—'}")
    if failed:
        print(f"{len(failed)} need attention: {', '.join(failed)}")
    print("\nNext: register subdomains, then create campaigns per vertical.")


if __name__ == "__main__":
    main()
