#!/usr/bin/env python3
"""New visitor ends the tag's session as well as the site's. Run from the repo root."""
import io, sys, re
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="""  function resetVisitor() {
    [KEY.visitor, KEY.user, KEY.cart, KEY.wish, 'lmn.views', 'lmn.order'].forEach(function (k) {
      localStorage.removeItem(k);
    });
    location.reload();
  }"""
new="""  function resetVisitor() {
    [KEY.visitor, KEY.user, KEY.cart, KEY.wish, 'lmn.views', 'lmn.order'].forEach(function (k) {
      localStorage.removeItem(k);
    });
    /* End the tag's session too. Otherwise the tag keeps its profile and the
       site pushes a fresh random uuid into it; a saved visitor picked next
       then cannot attach its own uuid to that profile. */
    clearInsiderIdentity();
    location.href = location.pathname + '#reid';
  }"""
if old not in s: sys.exit('STOP: resetVisitor not found as expected')
# clearInsiderIdentity is defined later in the file than resetVisitor; function hoisting makes that fine.
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "New visitor ends the tag session"')
