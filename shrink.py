#!/usr/bin/env python3
"""Shrink the product imagery.

    python3 shrink.py            # resize everything oversized
    python3 shrink.py --dry-run  # report what would change, touch nothing
    python3 shrink.py electronics home   # only these verticals

Retailers serve product photos at 2000px and up. The site displays them at
about 400px, and the PDP main image at roughly 700px, so anything beyond
1000px is bytes nobody sees — and a multi-gigabyte repo makes every clone and
deploy slow.

Rewrites in place. Skips anything already small enough, so it is safe to
re-run after pulling more catalogs.
"""
import os, sys

MAX_EDGE = 1000        # longest side, in pixels
QUALITY = 82           # JPEG quality; 82 is visually indistinguishable here
ROOT = "assets/img"

os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is needed:  pip3 install pillow")


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def shrink(path, dry=False):
    """Returns (bytes_before, bytes_after). Equal values mean untouched."""
    before = os.path.getsize(path)
    try:
        with Image.open(path) as im:
            if max(im.size) <= MAX_EDGE and path.lower().endswith((".jpg", ".jpeg")):
                return before, before

            im.load()
            if max(im.size) > MAX_EDGE:
                scale = MAX_EDGE / max(im.size)
                im = im.resize((max(1, int(im.width * scale)),
                                max(1, int(im.height * scale))),
                               Image.LANCZOS)

            # Flatten transparency onto white — these are product shots on
            # white backgrounds anyway, and JPEG is far smaller than PNG.
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                flat = Image.new("RGB", im.size, (255, 255, 255))
                flat.paste(im, mask=im.split()[-1])
                im = flat
            elif im.mode != "RGB":
                im = im.convert("RGB")

            if dry:
                return before, int(before * 0.15)   # rough estimate for reporting

            target = os.path.splitext(path)[0] + ".jpg"
            im.save(target, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            if target != path:
                os.remove(path)
            return before, os.path.getsize(target)
    except Exception:
        # A file that will not open is almost certainly a truncated download.
        # Leave it; build.py will simply reference a broken image.
        return before, before


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv

    if not os.path.isdir(ROOT):
        sys.exit(f"No {ROOT} — nothing to do.")

    verticals = args or sorted(d for d in os.listdir(ROOT)
                               if os.path.isdir(os.path.join(ROOT, d)))

    grand_before = grand_after = 0
    renamed = {}

    for v in verticals:
        d = os.path.join(ROOT, v)
        if not os.path.isdir(d):
            continue
        files = [f for f in sorted(os.listdir(d))
                 if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))]
        if not files:
            continue

        before = after = touched = 0
        for i, f in enumerate(files):
            p = os.path.join(d, f)
            b, a = shrink(p, dry)
            before += b
            after += a
            if a != b:
                touched += 1
                if not dry and not f.lower().endswith((".jpg", ".jpeg")):
                    renamed[f"{v}/{f}"] = f"{v}/{os.path.splitext(f)[0]}.jpg"
            if not dry and i and i % 250 == 0:
                print(f"    {v}: {i}/{len(files)}…", flush=True)

        grand_before += before
        grand_after += after
        pct = (1 - after / before) * 100 if before else 0
        print(f"  {v:14s} {len(files):5d} files  "
              f"{human(before):>8s} -> {human(after):>8s}  ({pct:.0f}% smaller, "
              f"{touched} changed)")

    pct = (1 - grand_after / grand_before) * 100 if grand_before else 0
    print(f"\n  {'total':14s} {human(grand_before)} -> {human(grand_after)}  ({pct:.0f}% smaller)")

    if dry:
        print("\n  --dry-run: nothing was changed. Estimates are approximate.")
        return

    if renamed:
        # PNGs became JPEGs, so the catalogs point at filenames that no longer
        # exist. Rewriting the sources is simpler than special-casing the build.
        print(f"\n  {len(renamed)} file(s) changed extension — updating sources…")
        import glob, json
        for src in glob.glob("sources/*.json"):
            raw = open(src).read()
            edited = raw
            for old, new in renamed.items():
                edited = edited.replace(f"assets/img/{old}", f"assets/img/{new}")
            if edited != raw:
                open(src, "w").write(edited)
        print("  sources updated — run: python3 build.py --all")


if __name__ == "__main__":
    main()
