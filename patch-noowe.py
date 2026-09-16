#!/usr/bin/env python3
"""syncAttributes no longer owes a refresh. The debt made the homepage reload
itself after a delay write (message -> reload -> blank). The site renders the
banner from the profile, so no re-identify is needed; the Upsert write still
happens for the platform. Removes only the oweRefresh() inside syncAttributes.
Run from repo root."""
import io, sys
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="""  function syncAttributes(custom) {
    oweRefresh();
    return fetch('/.netlify/functions/sync', {"""
if old not in s: sys.exit('STOP: syncAttributes head not in expected form; send sed -n 978,982p assets/store.js')
new="""  function syncAttributes(custom) {
    // No oweRefresh: the site renders the banner from the profile, so there is
    // nothing to re-identify for. The Upsert write below still reaches the
    // platform; the campaign updates on its own next render.
    return fetch('/.netlify/functions/sync', {"""
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "syncAttributes no longer forces a homepage reload"')
