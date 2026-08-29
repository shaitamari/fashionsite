#!/usr/bin/env python3
"""Replace generated artwork with real photography from Unsplash.

    python3 photos.py hotels
    python3 photos.py hotels airlines
    python3 photos.py --dry-run hotels

Hotels and airlines are the two verticals where the photograph IS the product,
and a generated gradient card undercuts them. Banking, insurance and fintech
are fine as designed cards — nobody expects a photograph of a mortgage.

Needs an Unsplash Access Key in .env:

    UNSPLASH_KEY=your-access-key

Get one free at https://unsplash.com/developers — create an application, then
copy the "Access Key" (not the Secret Key). The demo tier allows 50 requests
an hour, which is plenty: this needs about 30.

Images are downloaded and rehosted locally, so a demo never depends on
someone else's CDN. Searches are per destination rather than per product,
because "Lisbon" returns Lisbon while "The Grand Lisbon hotel room" returns
noise; properties in the same city then share that city's photograph.
"""
import json, os, ssl, sys, time, urllib.parse, urllib.request, urllib.error

os.chdir(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.unsplash.com/search/photos"

# What to search for, per vertical. The key is the slug the generator already
# uses for its artwork, so downloads land on top of the right files.
QUERIES = {
    "hotels": {
        "lisbon": "lisbon portugal city", "kyoto": "kyoto japan temple",
        "reykjavik": "reykjavik iceland landscape", "marrakesh": "marrakesh morocco riad",
        "copenhagen": "copenhagen denmark harbour", "cape-town": "cape town south africa",
        "mexico-city": "mexico city architecture", "queenstown": "queenstown new zealand",
        "amalfi": "amalfi coast italy", "singapore": "singapore skyline",
        "edinburgh": "edinburgh scotland old town", "chiang-mai": "chiang mai thailand",
    },
    "airlines": {
        "london-new-york": "new york city skyline", "london-lisbon": "lisbon tram",
        "paris-tokyo": "tokyo japan night", "amsterdam-cape-town": "cape town table mountain",
        "madrid-mexico-city": "mexico city street", "berlin-reykjavik": "iceland northern lights",
        "dublin-chicago": "chicago skyline", "zurich-singapore": "singapore marina bay",
        "rome-marrakesh": "marrakesh market", "vienna-athens": "athens greece acropolis",
        "oslo-edinburgh": "edinburgh castle", "lisbon-sao-paulo": "sao paulo brazil",
        "copenhagen-bangkok": "bangkok thailand temple", "milan-casablanca": "casablanca morocco",
        "manchester-dubai": "dubai skyline",
    },
}


def load_key():
    if not os.path.exists(".env"):
        sys.exit("No .env — add UNSPLASH_KEY=your-access-key")
    for line in open(".env"):
        if line.strip().startswith("UNSPLASH_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("UNSPLASH_KEY missing from .env — get one at unsplash.com/developers")


def _verified():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _unverified():
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


VERIFIED, UNVERIFIED = _verified(), _unverified()
_warned = [False]


def _open(req, timeout):
    """Python on macOS ships without the system certificate store, so verified
    HTTPS fails until Install Certificates.command is run. Retry unverified
    rather than failing outright."""
    try:
        return urllib.request.urlopen(req, timeout=timeout, context=VERIFIED)
    except (ssl.SSLError, urllib.error.URLError) as e:
        reason = getattr(e, "reason", e)
        if not isinstance(reason, ssl.SSLError) and not isinstance(e, ssl.SSLError):
            raise
        if not _warned[0]:
            print("  (certificate verification failed — continuing unverified;")
            print("   `pip3 install certifi` fixes this properly)\n")
            _warned[0] = True
        return urllib.request.urlopen(req, timeout=timeout, context=UNVERIFIED)


def search(key, query):
    """Return (image_url, photographer, profile_url) for the best match."""
    url = f"{API}?{urllib.parse.urlencode({'query': query, 'per_page': 3, 'orientation': 'landscape'})}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Client-ID {key}",
        "Accept-Version": "v1",
    })
    with _open(req, 25) as r:
        data = json.loads(r.read().decode())
    results = data.get("results") or []
    if not results:
        return None
    p = results[0]
    # `regular` is about 1080px wide — the size the site actually displays.
    return (p["urls"]["regular"], p["user"]["name"],
            p["user"]["links"]["html"])


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "insiderdemo/1.0"})
    with _open(req, 30) as r:
        data = r.read()
    if len(data) < 2000:
        return False
    open(path, "wb").write(data)
    return True


def run(vertical, key, dry=False):
    queries = QUERIES.get(vertical)
    if not queries:
        print(f"  no queries defined for '{vertical}'")
        return {}

    out_dir = f"assets/img/{vertical}"
    os.makedirs(out_dir, exist_ok=True)
    credits = {}

    for slug, query in queries.items():
        target = f"{out_dir}/{slug}.jpg"
        old_svg = f"{out_dir}/{slug}.svg"
        try:
            hit = search(key, query)
        except urllib.error.HTTPError as e:
            print(f"  {slug:20s} HTTP {e.code}" +
                  ("  (rate limited — wait an hour)" if e.code == 403 else ""))
            continue
        except Exception as e:
            reason = getattr(e, "reason", None)
            print(f"  {slug:20s} {type(e).__name__}: {reason or e}")
            continue

        if not hit:
            print(f"  {slug:20s} no results for '{query}'")
            continue

        img_url, who, profile = hit
        if dry:
            print(f"  {slug:20s} would use photo by {who}")
            continue

        if download(img_url, target):
            credits[slug] = {"photographer": who, "profile": profile}
            if os.path.exists(old_svg):
                os.remove(old_svg)
            print(f"  {slug:20s} {who}")
        else:
            print(f"  {slug:20s} download failed")
        time.sleep(0.4)          # stay well inside the 50/hour demo limit

    return credits


def repoint_sources(vertical):
    """The generator wrote .svg paths into sources/; point them at the .jpg."""
    import glob
    changed = 0
    for src in glob.glob(f"sources/{vertical}-*.json"):
        raw = open(src).read()
        edited = raw.replace(f"assets/img/{vertical}/", f"assets/img/{vertical}/") \
                    .replace(".svg", ".jpg")
        if edited != raw:
            open(src, "w").write(edited)
            changed += 1
    return changed


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        print(__doc__)
        print("available:", ", ".join(QUERIES))
        sys.exit(0)

    key = load_key()
    all_credits = {}

    for v in args:
        print(f"\n{v}")
        credits = run(v, key, dry)
        if credits and not dry:
            n = repoint_sources(v)
            all_credits[v] = credits
            print(f"  {len(credits)} photo(s); {n} source file(s) repointed")

    if all_credits and not dry:
        # Unsplash asks for attribution. Nobody will check an internal demo,
        # but it costs nothing to keep the record.
        existing = {}
        if os.path.exists("PHOTO-CREDITS.json"):
            try:
                existing = json.load(open("PHOTO-CREDITS.json"))
            except Exception:
                pass
        existing.update(all_credits)
        json.dump(existing, open("PHOTO-CREDITS.json", "w"), indent=2)
        print("\ncredits written to PHOTO-CREDITS.json")
        print("next: python3 build.py --all")


if __name__ == "__main__":
    main()
