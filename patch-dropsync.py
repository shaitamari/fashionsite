#!/usr/bin/env python3
"""Remove the Store.syncAttributes call from the delay handler. store.js has no
such function, so the click was throwing and the page half-loaded (blank). The
site renders the banner from the tag push + profile; the sync was never needed.
Run from repo root."""
import io, sys
p='pages/confirmation.html'; s=io.open(p,encoding='utf-8').read()
line="      Store.syncAttributes({ trip_status: 'Delayed' });\n"
if line not in s: sys.exit('STOP: syncAttributes line not found; send sed -n 305,316p pages/confirmation.html')
s=s.replace(line, "")
# tidy the now-inaccurate comment
s=s.replace(
"      // profile, so there is no round-trip to wait for. syncAttributes still\n      // writes it server-side for the platform; the campaign updates on its\n      // own next render. The user never waits.\n",
"      // profile, so there is no round-trip to wait for. The tag push carries\n      // the status to the platform; the campaign updates on its next render.\n")
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Delay click: drop the missing syncAttributes call"')
