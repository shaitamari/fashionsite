#!/usr/bin/env python3
"""Loyalty written server-side after a purchase, on every storefront. Run from the repo root."""
import io, sys, re
p='confirmation.html'; s=io.open(p,encoding='utf-8').read()
m=re.search(r"(\n\s*)Store\.signIn\(\{ loyalty_points: pts, membership_tier: tier \}\);", s)
if not m: sys.exit('STOP: loyalty signIn not found in confirmation.html')
ind=m.group(1)
ins=ind+"Store.syncAttributes({ loyalty_points: pts, membership_tier: tier, is_vip: tier === 'Gold' });"
s=s[:m.end()]+ins+s[m.end():]
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Loyalty written server-side"')
