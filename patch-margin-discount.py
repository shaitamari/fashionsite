#!/usr/bin/env python3
"""Two merchandising fields in the feed: discount_pct, and margin on multipack.

    python3 patch-margin-discount.py

DISCOUNT. Eureka already sorts by discount — the search API's
MostDiscountedFirst ranks on the gap between price and original_price, and the
Highest discounted recommendation strategy does the same. What neither gives
you is the NUMBER, so a merchandiser cannot say "bury anything over 50% off"
and a shopper cannot filter "30-50% off". This emits `discount_pct` as an
integer percentage on every product that is actually reduced.

MARGIN ON MULTIPACK. `margin` is a custom attribute, and custom attributes
have been awkward to switch on for merchandising. `multipack` is a DEFAULT
numeric attribute the estate does not use for anything — nothing in the feed
emits it — so the same number also goes out as multipack, where the default
attribute's own toggles apply.

The cost, and it is worth knowing before you build rules on it: the rule reads
"Multipack greater than 40". Right behaviour, wrong word, in front of whoever
you hand the panel to. `margin` is still emitted, so if its own toggle works
after all, use that and drop this — the values are identical.

Canon is excluded from the multipack overload: its ink and paper are genuinely
sold in packs, so the field may hold a real multipack count there one day and
the two meanings must not collide in one column.

Applies to build.py in place. Then: python3 build.py --all, push, and in the
panel map multipack and discount_pct on the master-feed integration.
"""
import os
import sys

FEED_BLOCK = '''
    # --- merchandising numbers ---------------------------------------------
    # Eureka sorts by discount already (MostDiscountedFirst ranks on the gap
    # between price and original_price), but nothing carries the percentage as
    # a value, so it cannot be faceted, sorted in a rule, or compared against.
    # Emitted only where the product is actually reduced.
    if p["unit_price"] > p["unit_sale_price"] > 0:
        _pct = int(round((p["unit_price"] - p["unit_sale_price"]) / p["unit_price"] * 100))
        if _pct > 0:
            parts.append(f"    <discount_pct>{_pct}</discount_pct>")

    # margin travels twice. `margin` is the honest name and a custom attribute;
    # `multipack` is a DEFAULT numeric attribute nothing in this estate uses,
    # carrying the same number so merchandising rules can be built on a default
    # field. Canon is excluded: its ink and paper really are sold in packs.
    if p.get("margin") is not None and p.get("vendor") != "Canon":
        parts.append(f"    <g:multipack>{int(p['margin'])}</g:multipack>")
'''


# Two data-quality guards, both found by building the fields above.
PRICE_GUARD = ("            compare = money(v.get(\"compare_at_price\"))\n"
               "            unit_price = compare if compare > price else price\n")
PRICE_GUARD_NEW = (
    "            compare = money(v.get(\"compare_at_price\"))\n"
    "            # A handful of source rows carry a was-price a thousand times\n"
    "            # the selling price (a 22.49 mask against 26,988.00), which\n"
    "            # renders as a 100% discount, tops the Highest discounted row\n"
    "            # and prints an absurd struck-through price. Anything implying\n"
    "            # more than 90% off is bad data, not a sale.\n"
    "            if compare > price * 10:\n"
    "                compare = 0\n"
    "            unit_price = compare if compare > price else price\n")

MARGIN_GUARD = '        rec["margin"] = int(extra["margin"])\n'
MARGIN_GUARD_NEW = ('        # Source margins arrive as 0 and 100 on a few dozen rows; neither\n'
                    '        # is a margin anyone would merchandise on.\n'
                    '        rec["margin"] = min(65, max(20, int(extra["margin"])))\n')


def main():
    path = "build.py"
    if not os.path.exists(path):
        sys.exit("Run this from the repo root (no build.py here).")
    s = open(path).read()
    done = []

    if "discount_pct" in s:
        print("  already patched")
        return

    # The colour line is the last of the optional per-product fields; hang the
    # new ones off the same block so they sit with their neighbours.
    anchor = '''    if p.get("color"):
        parts.append(f"    <g:color>{escape(clean(p['color'], 512))}</g:color>")
'''
    if anchor not in s:
        sys.exit("build.py: could not find the g:color block to insert after.")
    s = s.replace(anchor, anchor + FEED_BLOCK, 1)
    done.append("discount_pct emitted where a product is reduced")
    done.append("margin also emitted as multipack (Canon excluded)")

    if PRICE_GUARD in s:
        s = s.replace(PRICE_GUARD, PRICE_GUARD_NEW, 1)
        done.append("was-prices implying >90% off treated as no sale")
    if MARGIN_GUARD in s:
        s = s.replace(MARGIN_GUARD, MARGIN_GUARD_NEW, 1)
        done.append("source margins clamped to 20-65")

    open(path, "w").write(s)
    for d in done:
        print("  " + d)
    print("\nNext: python3 build.py --all, then push.")
    print("In the panel, on the master-feed integration:")
    print("  multipack      -> Exact Match g:multipack   (default attribute)")
    print("  discount_pct   -> declare as a custom Number, then Exact Match")
    print("Then Merchandising/Facetable/Sortable toggles, and the next index.")


if __name__ == "__main__":
    print("Merchandising numbers in the feed")
    main()
