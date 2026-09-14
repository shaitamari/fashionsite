#!/usr/bin/env python3
"""Longer, visible waits around re-identification. Run from the repo root."""
import sys, io
def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s: sys.exit('STOP: expected text not found in ' + path + ':\n' + old[:120])
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s); print('patched', path)

patch('assets/store.js', [
("""  function refreshIdentity(next) {
    clearInsiderIdentity();
    location.href = (next || location.pathname) + '#reid';
  }
  (function () {
    if (location.hash !== '#reid') return;
    setTimeout(function () {
      location.replace(location.pathname + location.search);
    }, 2500);
  })();""",
"""  function refreshIdentity(next) {
    clearInsiderIdentity();
    location.href = (next || location.pathname) + '#reid';
  }
  /* Second load: hold the page under a small veil while the tag
     re-identifies, then load once more so campaigns render from the fresh
     profile. Six seconds is long enough for the user push to be processed;
     two and a half was not always. */
  (function () {
    if (location.hash !== '#reid') return;
    document.addEventListener('DOMContentLoaded', function () {
      var v = document.createElement('div');
      v.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.85);z-index:99999;display:flex;align-items:center;justify-content:center;font:500 1rem/1.4 system-ui,sans-serif;color:#333';
      v.textContent = 'Updating your profile\\u2026';
      document.body.appendChild(v);
    });
    setTimeout(function () {
      location.replace(location.pathname + location.search);
    }, 6000);
  })();"""),
])
patch('confirmation.html', [
("""      setTimeout(function () { Store.refreshIdentity('index.html'); }, 2000);""",
 """      setTimeout(function () { Store.refreshIdentity('index.html'); }, 4000);"""),
])
print('done — now: posh "Longer re-identify waits"')
