#!/usr/bin/env python3
"""Trip banner only on the homepage, matching the campaign's page-rule.
The homepage is the only page with a .hero element, so gate slot placement on
it. Removes the banner (and the stray-bar mismatch) from product/cart/etc.
Run from repo root."""
import io, sys
p='assets/vertical.js'; s=io.open(p,encoding='utf-8').read()
old="""      var placeSlot = function () {
        if (document.getElementById('trip-banner')) return;
        var slot = document.createElement('div');"""
if old not in s: sys.exit('STOP: placeSlot not in expected form — send sed -n 704,720p assets/vertical.js')
new="""      var placeSlot = function () {
        if (document.getElementById('trip-banner')) return;
        // Homepage only, to match the disruption campaign's page rule. The
        // homepage is the one page with a hero; other pages get no banner.
        if (!document.querySelector('.hero')) return;
        var slot = document.createElement('div');"""
s=s.replace(old,new,1)
# the anchor line can now assume a hero exists
s=s.replace("var anchor = document.querySelector('.hero') || document.querySelector('header');",
            "var anchor = document.querySelector('.hero');", 1)
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Trip banner homepage only"')
