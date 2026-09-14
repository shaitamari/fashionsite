#!/usr/bin/env python3
"""Veil copy that tells the story: fast-forwarding to the next visit. Run from the repo root."""
import io, sys
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="      v.textContent = 'Updating your profile\\u2026';"
new="""      var V = window.VERTICAL || {};
      var travel = V.vertical === 'Travel';
      var op = V.key === 'hotels' ? "the hotel's" : "the airline's";
      v.textContent = travel
        ? 'Simulating ' + op + ' operations update\\u2026 fast-forwarding to your next visit'
        : 'Fast-forwarding to your next visit\\u2026';"""
if old not in s: sys.exit('STOP: veil text not found in assets/store.js')
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
p='confirmation.html'; s=io.open(p,encoding='utf-8').read()
old2="      sim.innerHTML = 'Updating your trip\\u2026 taking you to the homepage.';"
new2="      sim.innerHTML = 'Simulating the operations update\\u2026 fast-forwarding to your next visit.';"
if old2 in s: s=s.replace(old2,new2,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
else: print('note: delay-click text not found in confirmation.html (skipped)')
print('done — now: posh "Veil copy: fast-forwarding to your next visit"')
