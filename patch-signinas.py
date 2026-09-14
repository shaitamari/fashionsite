#!/usr/bin/env python3
"""Saved visitor sign-in ends the tag's session and re-identifies. Run from the repo root."""
import io, sys
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="""  function signInAs(persona) {
    if (!persona || !persona.uuid) return false;
    write(KEY.visitor, persona.uuid);
    localStorage.removeItem(KEY.user);"""
new="""  function signInAs(persona) {
    if (!persona || !persona.uuid) return false;
    write(KEY.visitor, persona.uuid);
    localStorage.removeItem(KEY.user);
    /* End the tag's current session: it may already be an anonymous profile
       with its own uuid, and the platform will not attach a second uuid to
       it. A fresh session identifies as the persona from the first push. */
    clearInsiderIdentity();"""
if old not in s: sys.exit('STOP: signInAs not found as expected in assets/store.js')
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
p='account.html'; s=io.open(p,encoding='utf-8').read()
old2="      if (Store.signInAs(p)) { location.href = 'index.html'; }"
new2="      if (Store.signInAs(p)) { Store.refreshIdentity('index.html'); }"
if old2 not in s: sys.exit('STOP: saved-visitor click handler not found in account.html')
s=s.replace(old2,new2,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Saved visitor sign-in re-identifies"')
