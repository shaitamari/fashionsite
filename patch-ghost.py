#!/usr/bin/env python3
"""A store whose local user does not match the estate-wide visitor id drops it,
so a hop lands you anonymous rather than as a stale person. Run from the repo root."""
import io, sys
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="""  function visitorId() {
    var id = readVisitorCookie() || read(KEY.visitor, null);"""
new="""  /* Runs once per page: if this store still remembers a user whose uuid is
     not the estate-wide visitor id, that user was set on another store or
     replaced since. Drop the local copy; the platform session is the
     cookie's person, and the header should say so. */
  (function reconcileLocalUser() {
    try {
      var cookieId = readVisitorCookie();
      var u = read(KEY.user, null);
      if (cookieId && u && u.uuid && u.uuid !== cookieId) {
        localStorage.removeItem(KEY.user);
      }
    } catch (e) {}
  })();
  function visitorId() {
    var id = readVisitorCookie() || read(KEY.visitor, null);"""
if old not in s: sys.exit('STOP: visitorId (cookie version) not found — run patch-visitorcookie first')
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Drop a stale local user when the visitor id changed"')
