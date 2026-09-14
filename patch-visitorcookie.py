#!/usr/bin/env python3
"""One visitor id for the whole estate: kept in a cookie on the parent domain
(like the tag's own), so every storefront pushes the same uuid and a hop
between stores never creates a second profile for one browser.
Run from the repo root."""
import io, sys
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="""  function visitorId() {
    var id = read(KEY.visitor, null);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
                              : 'anon-' + Math.random().toString(36).slice(2) + Date.now());
      write(KEY.visitor, id);
    }
    return id;
  }"""
new="""  /* The visitor id lives in a cookie on the parent domain (insiderdemo.com),
     the same scope as the tag's own cookies, so every storefront in this
     browser pushes the same uuid. localStorage is per hostname; keeping the
     id there gave each store its own uuid while the tag session was shared,
     and the platform refused the second uuid. */
  var VISITOR_COOKIE = 'lmn_visitor';
  function cookieDomain() {
    var parts = location.hostname.split('.');
    return parts.length > 2 ? '.' + parts.slice(-2).join('.') : location.hostname;
  }
  function readVisitorCookie() {
    var m = document.cookie.match(new RegExp('(?:^|; )' + VISITOR_COOKIE + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeVisitorCookie(id) {
    var base = VISITOR_COOKIE + '=' + encodeURIComponent(id) + '; path=/; max-age=31536000; SameSite=Lax';
    document.cookie = base + '; domain=' + cookieDomain();
    document.cookie = base;  // localhost and single-label hosts
    write(KEY.visitor, id);  // mirror for the pages that read it directly
  }
  function clearVisitorCookie() {
    ['; domain=' + cookieDomain(), ''].forEach(function (d) {
      document.cookie = VISITOR_COOKIE + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT' + d;
    });
    localStorage.removeItem(KEY.visitor);
  }
  function visitorId() {
    var id = readVisitorCookie() || read(KEY.visitor, null);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
                              : 'anon-' + Math.random().toString(36).slice(2) + Date.now());
    }
    if (readVisitorCookie() !== id) writeVisitorCookie(id);
    return id;
  }"""
if old not in s: sys.exit('STOP: visitorId not found as expected')
s=s.replace(old,new,1)
# every place that sets or removes the visitor id must go through the cookie
reps=[
("    write(KEY.visitor, persona.uuid);\n    localStorage.removeItem(KEY.user);",
 "    writeVisitorCookie(persona.uuid);\n    localStorage.removeItem(KEY.user);"),
("    localStorage.removeItem(KEY.user);\n    localStorage.removeItem(KEY.visitor);   // next visitor gets a fresh id",
 "    localStorage.removeItem(KEY.user);\n    clearVisitorCookie();   // next visitor gets a fresh id"),
("    if (read(KEY.visitor, null) !== merged.uuid) write(KEY.visitor, merged.uuid);",
 "    if (visitorId() !== merged.uuid) writeVisitorCookie(merged.uuid);"),
("    [KEY.visitor, KEY.user, KEY.cart, KEY.wish, 'lmn.views', 'lmn.order'].forEach(function (k) {\n      localStorage.removeItem(k);\n    });",
 "    [KEY.visitor, KEY.user, KEY.cart, KEY.wish, 'lmn.views', 'lmn.order'].forEach(function (k) {\n      localStorage.removeItem(k);\n    });\n    clearVisitorCookie();"),
]
n=0
for a,b in reps:
    if a in s: s=s.replace(a,b,1); n+=1
    else: print('note: not found (may already differ):', a[:60].replace('\n',' '))
io.open(p,'w',encoding='utf-8').write(s); print('patched', p, '(%d call sites)' % n)
print('done — now: posh "One visitor id across the estate"')
