#!/usr/bin/env python3
"""
patch-canon-compat-self.py

Fixes the self-reference in Canon's derived `compatible_with`: a product
listing its own model as something it is compatible with.

compat_from() already tries to exclude the product's own model, but it tests
whether the whole extracted code appears in the title as one run of text.
Canon's titles put words in between — "PIXMA MegaTank G3270 ..." — so the
code "PIXMA G3270" is not found and survives. Matching on the code's tokens
instead catches it.

Touches import_canon.py only. Idempotent: run it twice and the second run
STOPs without writing.

After patching, re-run the Canon import and rebuild, then deploy.

Usage:
    python3 patch-canon-compat-self.py              # from the repo root
    python3 patch-canon-compat-self.py /path/to/posh
"""

import sys
from pathlib import Path

OLD = """        if code.lower() in own_title.lower():
            continue"""

NEW = """        # The product's own model, dropped so a product never lists itself.
        # Token-wise, because Canon's titles interleave other words:
        # "PIXMA MegaTank G3270 ..." contains "PIXMA" and "G3270" but not
        # the contiguous string "PIXMA G3270".
        title_l = own_title.lower()
        if all(tok.lower() in title_l for tok in code.split()):
            continue"""


def stop(msg):
    print("STOP: " + msg)
    sys.exit(0)


def main():
    root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.cwd()
    target = root / "import_canon.py"

    if not target.exists():
        stop(f"{target} not found — run this from the repo root, or pass the path.")

    src = target.read_text(encoding="utf-8")

    if "title_l = own_title.lower()" in src:
        stop("already patched — nothing to do.")

    if OLD not in src:
        stop(
            "the self-reference check in compat_from() does not match what this\n"
            "      patch expects. Someone has edited it; patch by hand."
        )

    target.write_text(src.replace(OLD, NEW, 1), encoding="utf-8")

    print("patched " + str(target))
    print("  - compat_from() now drops a product's own model token-wise")
    print("\nRe-run the Canon import, rebuild, deploy.")


if __name__ == "__main__":
    main()
