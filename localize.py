#!/usr/bin/env python3
"""Pull a vertical's remote product images in, then rebuild.

    python3 localize.py fashion
    python3 localize.py fashion --dry-run
    python3 localize.py beauty --all-hosts   # also pull images from other CDNs

Reads sources/<key>-*.json, downloads every image still served from another
host into assets/img/<key>/<product>-<n>.jpg, rewrites the source files to
point at the local copies, and clears any image in that folder the sources no
longer mention. Run `python3 shrink.py <key>` afterwards, then `build.py`.

Why: a demo that loads its photography from someone else's CDN breaks the
day that store changes, and the salesdemo store is not ours to keep.

Safe to re-run — anything already local is skipped, and a failed download
leaves the remote URL in place rather than a broken path.
"""
import glob, json, os, re, ssl, sys, time, urllib.request

os.chdir(os.path.dirname(os.path.abspath(__file__)))
CTX = ssl.create_default_context()

# Only the salesdemo store's CDN by default. Lumen's own catalog is served
# from another Shopify CDN and has worked that way since day one; pulling
# thousands of its images in is a separate decision (--all-hosts).
SALESDEMO_CDN = "cdn.shopify.com/s/files/1/0804/7552/1298/"


def fetch(url, path, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30, context=CTX) as r, open(path, "wb") as fh:
                fh.write(r.read())
            return True
        except Exception as e:  # noqa: BLE001
            if attempt == tries - 1:
                print(f"  ! {url}: {e}")
                return False
            time.sleep(1.5)


def ext_of(url):
    m = re.search(r"\.(jpe?g|png|webp)(?:\?|$)", url, re.I)
    return "." + m.group(1).lower().replace("jpeg", "jpg") if m else ".jpg"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    all_hosts = "--all-hosts" in sys.argv
    if not args:
        print(__doc__)
        sys.exit(1)
    key = args[0]
    out_dir = f"assets/img/{key}"
    os.makedirs(out_dir, exist_ok=True)

    paths = sorted(glob.glob(f"sources/{key}-*.json"))
    if not paths:
        sys.exit(f"no sources for {key}")

    wanted, mapping, todo = set(), {}, []
    for path in paths:
        data = json.load(open(path))
        for p in data["products"]:
            pid = p["id"]
            urls = []
            for img in p.get("images", []):
                if img["src"] not in urls:
                    urls.append(img["src"])
            for v in p.get("variants", []):
                src = (v.get("featured_image") or {}).get("src")
                if src and src not in urls:
                    urls.append(src)
            for n, url in enumerate(urls):
                if not url.startswith("http") or (
                        not all_hosts and SALESDEMO_CDN not in url):
                    wanted.add(url)
                    continue
                local = f"{out_dir}/{pid}-{n}{ext_of(url)}"
                mapping[url] = local
                wanted.add(local)
                if not os.path.exists(local):
                    todo.append((url, local))

    print(f"{key}: {len(mapping)} remote image(s), {len(todo)} to download")
    if dry:
        return

    ok = 0
    for i, (url, local) in enumerate(todo, 1):
        if fetch(url, local):
            ok += 1
        if i % 50 == 0:
            print(f"  {i}/{len(todo)}")
    print(f"  downloaded {ok}/{len(todo)}")

    # Rewrite sources: only URLs that actually landed on disk.
    for path in paths:
        data = json.load(open(path))
        for p in data["products"]:
            for img in p.get("images", []):
                loc = mapping.get(img["src"])
                if loc and os.path.exists(loc):
                    img["src"] = loc
            for v in p.get("variants", []):
                fi = v.get("featured_image")
                if fi:
                    loc = mapping.get(fi.get("src"))
                    if loc and os.path.exists(loc):
                        fi["src"] = loc
        json.dump(data, open(path, "w"), ensure_ascii=False)

    # Clear images the sources no longer mention (the old catalog's photos).
    stale = [f for f in glob.glob(f"{out_dir}/*") if f not in wanted]
    for f in stale:
        os.remove(f)
    print(f"  removed {len(stale)} image(s) no source references")
    print(f"next: python3 shrink.py {key} && python3 build.py {key}")


if __name__ == "__main__":
    main()
