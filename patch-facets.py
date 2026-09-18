#!/usr/bin/env python3
"""Colour families, and a size field that only holds sizes.

    python3 patch-facets.py

TWO PROBLEMS, both of which make merchandising and faceting useless on the
values a merchandiser actually wants to work with.

COLOUR. `g:color` carried the raw variant value — 668 distinct values across
11,597 products, 280 of them on one or two products, and Aldgate's fused the
upholstery into the colour ("Camel - Top Grain Leather", "Georgia Clay -
Performance Chenille"). A merchandiser who wants to bury grey this season has
to write a rule per value, and the colour facet reads as a paint chart.

After this, `g:color` is the FAMILY — Black, White, Grey, Brown, Beige, Blue,
Green, Red, Pink, Purple, Orange, Yellow, Metallic, Multi. One rule covers a
family. The shade name is untouched on the page: the PDP chips read the
variant's own title, not this field.

SIZE. `g:size` was doing double duty — a real size where one existed, and
otherwise whatever the vertical's single option happened to be. So the size
facet held "Slope" and "Block" (Aldgate leg styles, 2,586 products between
them), "Deluxe King", "Business", "Economy". Of 402 values only 112 were
sizes.

After this, `g:size` holds sizes only, and Room / Cabin / Tier / Leg Style go
out as `option_group`, their own field and their own facet.

THE SHADE MOVES TO THE TITLE. A product whose variants are all one colourway
gets the shade in its name — "Cape Dress" becomes "Cape Dress in Navy" — so
the word is searchable and visible where a shopper expects it, while the
colour field stays a family. Products that come in several colours at once
(an Aldgate sofa with six upholsteries) keep their title as it is.

Canon is untouched by all three: its variants carry no colour and no size.

Applies to build.py in place. Then: python3 build.py --all, push, and in the
panel declare `option_group` (String), map it on the master-feed integration,
and set Facetable — plus Merchandising on anything you want to boost by.
"""
import os
import re
import sys

# Every colour word the site already knows, grouped. The site's swatch map is
# the vocabulary; this is the same list with a family against each word, plus
# the words the catalogue uses that the swatch map never needed.
FAMILY_WORDS = {
    "black": ["black", "phantom", "midnight", "obsidian", "onyx", "jet", "ink", "carbon", "noir", "raven"],
    "white": ["white", "ivory", "cream", "chalk", "snow", "talc", "coconut",
              "vanilla", "pearl", "crema", "porcelain", "gardenia", "powder", "lily", "alabaster"],
    "grey": ["grey", "gray", "charcoal", "slate", "granite", "pewter", "smoke",
             "fog", "shale", "gravel", "ash", "graphite", "cloud", "storm",
             "steel", "stone", "pebble", "flint", "mineral", "mushroom", "dove", "quarry", "concrete", "zinc", "clear"],
    "metallic": ["silver", "platinum", "stainless", "gold", "bronze", "copper",
                 "chrome", "brass", "gunmetal"],
    "blue": ["blue", "navy", "cobalt", "azure", "sky", "denim", "indigo",
             "marine", "teal", "turquoise", "aqua", "agate", "coastal",
             "seaglass", "glacier", "iris", "aurora", "lagoon", "harbour", "harbor", "cornflower"],
    "green": ["green", "mint", "sage", "olive", "moss", "forest", "lichen",
              "lime", "jade", "nori", "khaki", "fern", "eucalyptus", "kiwi", "sherwood", "juniper", "cypress", "basil", "pistachio", "avocado", "seafoam", "emerald"],
    "red": ["red", "chilli", "cherry", "wine", "burgundy", "maroon", "ruby",
            "coral", "salmon", "brick", "scarlet", "crimson", "clay",
            "safflower", "strawberry", "madder", "garnet", "poppy", "paprika"],
    "pink": ["pink", "blush", "rose", "raspberry", "magenta", "fuchsia",
             "peony", "petal", "flamingo", "peony", "guava", "sorbet"],
    "purple": ["purple", "lilac", "lavender", "violet", "plum", "mulberry",
               "fig", "aubergine", "amethyst"],
    "orange": ["orange", "apricot", "peach", "terra", "rust", "sienna",
               "mango", "tangerine", "papaya", "ochre", "marigold", "persimmon", "clementine"],
    "yellow": ["yellow", "butter", "mustard", "honey", "champagne", "amber",
               "saffron", "lemon"],
    "brown": ["brown", "chocolate", "cocoa", "espresso", "chestnut", "walnut",
              "oak", "birch", "almond", "tan", "camel", "caramel", "toast",
              "mud", "umami", "mocha", "hazel", "cedar", "tortoiseshell",
              "tort", "leather", "truffle", "cinnamon", "pecan", "acorn", "driftwood", "bark"],
    "beige": ["beige", "sand", "sandstone", "taupe", "oyster", "oatmeal",
              "natural", "linen", "biscuit", "wheat", "bone", "nude", "opalite", "barley", "parchment", "flax", "sisal", "jute", "putty"],
    "multi": ["multi", "check", "floral", "stripe", "print", "pattern",
              "zebra", "tiger", "leopard", "rainbow", "assorted", "prism",
              "starry", "glimmer", "shimmer", "highlighter", "varsity", "colourblock", "colorblock"],
}

COLOR_BLOCK = '''
# --- colour families -------------------------------------------------------
# `g:color` carries the FAMILY, not the shade name. The raw values were 668
# distinct across the catalogue — "Camel - Top Grain Leather", "Georgia Clay -
# Performance Chenille", "Crushed Gravel" — which makes a colour facet a paint
# chart and a merchandising rule a per-value chore. Families are the unit a
# merchandiser works in: bury grey, boost black.
#
# The shade name is NOT lost: the PDP reads the variant's own title, so the
# chips still say "Camel - Top Grain Leather". This is the facet value only.
#
# Matching is by the EARLIEST colour word in the string, so "Dark Navy" is
# blue and "Sandstone" beats "sand". Anything with no colour word at all comes
# back None and the product simply has no colour — better than a wrong family.
COLOR_FAMILY_WORDS = %(words)r

# word -> family, longest first so "sandstone" wins over "sand".
_FAMILY_BY_WORD = {w: fam for fam, ws in COLOR_FAMILY_WORDS.items() for w in ws}
_FAMILY_KEYS = sorted(_FAMILY_BY_WORD, key=len, reverse=True)


def _squash(value):
    """Loose comparison form: 'Tweed & Net' and 'Tweed and Net' both collapse
    to 'tweedandnet', so a title that already names the shade is left alone."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower().replace("&", "and"))


def color_family(value):
    """'Brown' for 'Camel - Top Grain Leather'. None when nothing matches."""
    t = str(value or "").lower()
    if not t:
        return None
    best, best_at = None, len(t) + 1
    for w in _FAMILY_KEYS:
        at = t.find(w)
        if at > -1 and at < best_at:
            best_at, best = at, w
    if best is None:
        return None
    fam = _FAMILY_BY_WORD[best]
    return "Multi" if fam == "multi" else fam.capitalize()

'''


def patch(path="build.py"):
    if not os.path.exists(path):
        sys.exit("Run this from the repo root (no build.py here).")
    s = open(path).read()
    done = []

    # 1. the family map and helper, before split_options
    if "def color_family(" not in s:
        anchor = "def option_role(name):"
        if anchor not in s:
            sys.exit("build.py: could not find option_role() to insert before.")
        s = s.replace(anchor, (COLOR_BLOCK % {"words": FAMILY_WORDS}).lstrip("\n") + "\n" + anchor, 1)
        done.append("colour family map added")

    # 2. the record carries the family
    old = '                "color": opts["color"],'
    if old in s:
        s = s.replace(old, '                "color": color_family(opts["color"]),\n'
                           '                # The shade name as the source wrote it, for anything\n'
                           '                # that wants to show rather than filter.\n'
                           '                "color_name": opts["color"],', 1)
        done.append("record colour is the family")

    # 3. the shade name moves into the title, where one colourway covers the
    #    whole product
    anchor = "        collection = colmap[ptype]"
    if "shade_suffix" not in s and anchor in s:
        shade = (
            "        # The shade name belongs in the name, now that `color` is the\n"
            "        # family. Only where the whole product is ONE colourway — a sofa\n"
            "        # that comes in six upholsteries has no single shade to put in\n"
            "        # its title. The material suffix is dropped, so\n"
            "        # \"Camel - Top Grain Leather\" gives \"Camel\".\n"
            "        shades = set()\n"
            "        for _v in p.get(\"variants\", []):\n"
            "            _c = split_options(p, _v)[\"color\"]\n"
            "            if _c:\n"
            "                shades.add(str(_c).split(\" - \")[0].strip())\n"
            "        shade_suffix = shades.pop() if len(shades) == 1 else None\n\n"
        )
        s = s.replace(anchor, shade + anchor, 1)
        old_name = '                "name": p["title"],'
        new_name = (
            '                "name": (p["title"] if not shade_suffix\n'
            '                         or _squash(shade_suffix) in _squash(p["title"])\n'
            '                         else p["title"] + (", " if " in " in p["title"]\n'
            '                                            else " in ") + shade_suffix),'
        )
        if old_name in s:
            s = s.replace(old_name, new_name, 1)
        done.append("shade name moves into the title")

    # 4. size holds sizes; Room / Cabin / Tier / Leg Style get their own field
    old = '''    size_value = p.get("size") or p.get("tier")
    if size_value:
        parts.append(f"    <g:size>{escape(clean(size_value, 512))}</g:size>")'''
    new = '''    if p.get("size"):
        parts.append(f"    <g:size>{escape(clean(p['size'], 512))}</g:size>")

    # Room, Cabin, Tier, Level of cover, Leg Style — the single variant
    # dimension of a vertical that has no sizes. It used to fall back into
    # g:size, which put "Slope", "Deluxe King" and "Economy" in the size facet
    # alongside M and L. Its own field, its own facet.
    if p.get("tier"):
        parts.append(f"    <option_group>{escape(clean(p['tier'], 512))}</option_group>")'''
    if old in s:
        s = s.replace(old, new, 1)
        done.append("size split from option_group")

    # 5. the old comment above it describes behaviour that is now gone
    stale = '''    # g:size carries the real size when there is one. Where a vertical has no
    # sizes at all — hotels, airlines, banking, insurance, fintech — its single
    # variant dimension falls back into g:size so the existing facet keeps
    # working. It never shares the field with a real size, so fashion's Colour
    # and Size facets stay clean either way. When Eureka gains a custom
    # searchable attribute (blocked item 2), tier moves out of g:size and the
    # fallback below can go.
'''
    if stale in s:
        s = s.replace(stale, "", 1)
        done.append("stale comment removed")

    open(path, "w").write(s)
    for d in done:
        print("  " + d)
    if not done:
        print("  nothing to do — already patched")


if __name__ == "__main__":
    print("Colour families and a clean size field")
    patch()
    print("\nNext: python3 build.py --all, then push.")
    print("In the panel: declare option_group (String), map it on the")
    print("master-feed integration, set it Facetable; colour needs no new")
    print("mapping — g:color is already mapped, the values just get sane.")
