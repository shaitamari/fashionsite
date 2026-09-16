#!/usr/bin/env python3
"""Delay click: set status and go straight to the homepage. No veil, no
re-identify wait — the site renders the banner from the profile it holds.
Keeps the server-side write (syncAttributes) so the platform gets the change
too, just without making the user wait for it. Run from repo root."""
import io, sys
p='confirmation.html'; s=io.open(p,encoding='utf-8').read()
old="""      Store.signIn({ trip_status: 'Delayed' });
      window.InsiderQueue.push({ type: 'user', value: Store.userPayload() });
      window.InsiderQueue.push({ type: 'init' });
      Store.syncAttributes({ trip_status: 'Delayed' });
      sim.innerHTML = 'Simulating the operations update\\u2026 fast-forwarding to your next visit.';
      /* Give the write a moment to land, then re-identify so the homepage
         renders from the profile rather than the session's old snapshot. */
      setTimeout(function () { Store.refreshIdentity('index.html'); }, 4000);"""
if old not in s: sys.exit('STOP: still not matching — paste sed -n 305,315p confirmation.html')
new="""      // Set the status and go. The homepage banner is site-rendered from the
      // profile, so there is no round-trip to wait for. syncAttributes still
      // writes it server-side for the platform; the campaign updates on its
      // own next render. The user never waits.
      Store.signIn({ trip_status: 'Delayed' });
      window.InsiderQueue.push({ type: 'user', value: Store.userPayload() });
      Store.syncAttributes({ trip_status: 'Delayed' });
      window.location.href = 'index.html';"""
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Delay click goes straight to the homepage, no wait"')
