#!/usr/bin/env python3
"""Delay link appears only after the booking's re-identify has finished. Run from the repo root."""
import io, sys
p='confirmation.html'; s=io.open(p,encoding='utf-8').read()
old="    if (!sim || !V.banner_slot || !ORDER || !Store.currentUser()) return;"
new="""    // Not on the first load of a fresh booking: that page re-identifies itself
    // seconds later, and a click inside that window is lost with the page.
    // The link appears on the reloaded confirmation, when the profile is settled.
    if (!sim || !V.banner_slot || !ORDER || !Store.currentUser() || FRESH) return;"""
if old not in s: sys.exit('STOP: sim guard not found in confirmation.html')
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Delay link only after the booking has settled"')
