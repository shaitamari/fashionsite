#!/usr/bin/env python3
"""Same-page re-identify must reload, not just change the hash. Run from the repo root."""
import io, sys
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
pairs=[
("""  function refreshIdentity(next) {
    clearInsiderIdentity();
    location.href = (next || location.pathname) + '#reid';
  }""",
"""  function refreshIdentity(next) {
    clearInsiderIdentity();
    var target = next || location.pathname;
    var here = location.pathname.split('/').pop() || 'index.html';
    var there = target.split('/').pop() || 'index.html';
    // A hash-only change does not reload the page; same page needs reload().
    if (here === there || (here === '' && there === 'index.html')) {
      location.hash = 'reid';
      location.reload();
    } else {
      location.href = target + '#reid';
    }
  }"""),
("""    clearInsiderIdentity();
    location.href = location.pathname + '#reid';
  }""",
"""    clearInsiderIdentity();
    location.hash = 'reid';
    location.reload();
  }"""),
]
for old,new in pairs:
    if old not in s: sys.exit('STOP: expected text not found:\\n'+old[:100])
    s=s.replace(old,new,1)
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Same-page re-identify reloads"')
