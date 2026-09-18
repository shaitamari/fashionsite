#!/usr/bin/env python3
"""
patch-canon-links-and-compat.py

Two fixes.

1. HOSTNAME. build.py mints every product link as
   https://<vertical>.insiderdemo.com/..., so Canon's products link to
   canon.insiderdemo.com while the site actually lives on
   canon-sandbox.insiderdemo.com. This adds an optional per-vertical
   "hostname" override in verticals.json and sets Canon's to
   canon-sandbox.insiderdemo.com. Every other vertical is untouched.

2. SELF-REFERENCE in compatible_with. Products list their own model as
   something they are compatible with. Fixed in two places:
     - import_canon.py, so a fresh import doesn't reintroduce it;
     - sources/canon-*.json, so you do NOT need the Canon CSV to get the
       fix into the next build.

   NOTE: this supersedes patch-canon-compat-self.py, which compared the
   model code to the title as plain lowercase substrings. That was too
   loose for single-character tokens: "EOS R" matched "EOS C70 Body
   (Refurbished)" because the letter r appears inside "Refurbished", and
   a legitimate compatibility would have been deleted. This version
   matches punctuation-insensitively for multi-character tokens and
   requires a whole-word match for single-character ones. It is safe to
   run whether or not the earlier patch was applied.

Idempotent: run it twice and the second run reports nothing left to do.

Usage:
    python3 patch-canon-links-and-compat.py              # from the repo root
    python3 patch-canon-links-and-compat.py /path/to/posh
"""

import glob
import json
import re
import sys
from pathlib import Path

CANON_HOST = "canon-sandbox.insiderdemo.com"

OLD_SITE_FOR = '''def site_for(key):
    """Each vertical gets its own hostname so campaign rules can't collide."""
    return f"https://{key}.{APEX}"'''

NEW_SITE_FOR = '''def site_for(key):
    """Each vertical gets its own hostname so campaign rules can't collide.

    A vertical may override it with "hostname" in verticals.json, for the
    cases where the storefront does not live at <key>.<apex> — Canon is on
    canon-sandbox.insiderdemo.com, not canon.insiderdemo.com."""
    override = (VERTICALS.get(key) or {}).get("hostname")
    if override:
        return f"https://{override}"
    return f"https://{key}.{APEX}"'''

# The self-reference check as originally shipped in import_canon.py.
COMPAT_ORIGINAL = """        if code.lower() in own_title.lower():
            continue"""

# The check as left by patch-canon-compat-self.py (too loose — see the
# module docstring).
COMPAT_FIRST_PATCH = """        # The product's own model, dropped so a product never lists itself.
        # Token-wise, because Canon's titles interleave other words:
        # "PIXMA MegaTank G3270 ..." contains "PIXMA" and "G3270" but not
        # the contiguous string "PIXMA G3270".
        title_l = own_title.lower()
        if all(tok.lower() in title_l for tok in code.split()):
            continue"""

COMPAT_FIXED = """        # The product's own model, dropped so a product never lists itself.
        # Compared token by token, because Canon's titles interleave other
        # words and punctuate inconsistently: "PIXMA MegaTank G3270" and
        # "RF100-500mm" both name models that the extracted code spells
        # differently. Multi-character tokens are matched with punctuation
        # and spacing removed; a single-character token has to match as a
        # whole word, or the r in "Refurbished" would swallow "EOS R".
        if _names_self(code, own_title):
            continue"""

HELPER = '''

def _names_self(code, own_title):
    """True when `code` is the product's own model, as written in its title."""
    title = (own_title or "").lower()
    squashed = re.sub(r"[^a-z0-9]", "", title)
    for tok in code.lower().split():
        if len(tok) == 1:
            if not re.search(r"\\b" + re.escape(tok) + r"\\b", title):
                return False
        elif re.sub(r"[^a-z0-9]", "", tok) not in squashed:
            return False
    return True

'''


def names_self(code, title):
    t = (title or "").lower()
    squashed = re.sub(r"[^a-z0-9]", "", t)
    for tok in code.lower().split():
        if len(tok) == 1:
            if not re.search(r"\b" + re.escape(tok) + r"\b", t):
                return False
        elif re.sub(r"[^a-z0-9]", "", tok) not in squashed:
            return False
    return True


def fail(msg):
    print("STOP: " + msg)
    sys.exit(1)


def main():
    root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.cwd()
    for name in ("build.py", "verticals.json", "import_canon.py"):
        if not (root / name).exists():
            fail(f"{root / name} not found — run this from the repo root, or pass the path.")

    done, skipped = [], []

    # --- 1a. build.py -----------------------------------------------------
    bp = root / "build.py"
    src = bp.read_text(encoding="utf-8")
    if "hostname" in src and "override" in src:
        skipped.append("build.py already honours a hostname override")
    elif OLD_SITE_FOR in src:
        bp.write_text(src.replace(OLD_SITE_FOR, NEW_SITE_FOR, 1), encoding="utf-8")
        done.append("build.py: site_for() honours a per-vertical hostname")
    else:
        fail("site_for() in build.py does not match what this patch expects — patch by hand.")

    # --- 1b. verticals.json ----------------------------------------------
    vj = root / "verticals.json"
    cfg = json.loads(vj.read_text(encoding="utf-8"))
    if "canon" not in cfg:
        fail("'canon' missing from verticals.json — apply patch-canon-shared.py first.")
    if cfg["canon"].get("hostname") == CANON_HOST:
        skipped.append("verticals.json already sets canon.hostname")
    else:
        cfg["canon"]["hostname"] = CANON_HOST
        vj.write_text(
            json.dumps(cfg, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        done.append(f"verticals.json: canon.hostname = {CANON_HOST}")

    # --- 2a. import_canon.py ---------------------------------------------
    ic = root / "import_canon.py"
    src = ic.read_text(encoding="utf-8")
    if "_names_self(" in src:
        skipped.append("import_canon.py already uses the corrected check")
    else:
        if COMPAT_FIRST_PATCH in src:
            src = src.replace(COMPAT_FIRST_PATCH, COMPAT_FIXED, 1)
        elif COMPAT_ORIGINAL in src:
            src = src.replace(COMPAT_ORIGINAL, COMPAT_FIXED, 1)
        else:
            fail("the self-reference check in compat_from() does not match — patch by hand.")
        anchor = "def compat_from(text, own_title):"
        if anchor not in src:
            fail("compat_from() not found in import_canon.py.")
        src = src.replace(anchor, HELPER.lstrip("\n") + "\n" + anchor, 1)
        ic.write_text(src, encoding="utf-8")
        done.append("import_canon.py: corrected self-reference check")

    # --- 2b. sources/canon-*.json ----------------------------------------
    files = sorted(glob.glob(str(root / "sources" / "canon-*.json")))
    if not files:
        fail("no sources/canon-*.json found.")
    removed = touched = 0
    for path in files:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        dirty = False
        for prod in data.get("products", []):
            extras = prod.get("canon") or {}
            cw = extras.get("compatible_with")
            if not cw:
                continue
            codes = [c.strip() for c in str(cw).split(",") if c.strip()]
            keep = [c for c in codes if not names_self(c, prod.get("title", ""))]
            if len(keep) != len(codes):
                removed += len(codes) - len(keep)
                extras["compatible_with"] = ", ".join(keep) if keep else None
                if not keep:
                    extras["compatibility_source"] = None
                dirty = True
        if dirty:
            Path(path).write_text(
                json.dumps(data, ensure_ascii=False), encoding="utf-8"
            )
            touched += 1
    if removed:
        done.append(
            f"sources/canon-*.json: removed {removed} self-references across {touched} files"
        )
    else:
        skipped.append("sources/canon-*.json: no self-references left")

    for line in done:
        print("  + " + line)
    for line in skipped:
        print("  · " + line)
    if done:
        print("\nRebuild and deploy:  python3 build.py --all  &&  posh \"...\"")
    else:
        print("\nNothing to do.")


if __name__ == "__main__":
    main()
