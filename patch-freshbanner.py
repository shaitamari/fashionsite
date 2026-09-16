#!/usr/bin/env python3
"""Banner reads the profile fresh on every paint, not once at first render.
Bug: msg was computed once above paint(), so when the observer re-fired (or the
page loaded a beat before the profile settled) it repainted the STALE trip.
Now paint() re-reads Store.currentUser() each time, so it always shows the
current trip and status. Run from repo root (vertical.js at repo root)."""
import io, sys
p='vertical.js'; s=io.open(p,encoding='utf-8').read()
old="""  function fillBannerFallback(slot) {
    try {
      if (!slot || !window.Store || !Store.currentUser) return;
      var u = Store.currentUser() || {};
      var v = window.VERTICAL || {};
      var msg = tripBannerText(u.trip_status, u.next_trip, v.key);
      if (!msg) return;
      // Only fill if the campaign hasn't already put something here.
      var paint = function () {
        // The site is the last word: whenever the slot is empty and the
        // profile says Delayed/Cancelled, the message is present. If the
        // campaign renders real text, it stays (we only fill when empty).
        if (!slot.textContent.trim()) {
          slot.textContent = msg;
          slot.setAttribute('data-fallback', '1');
        }
      };
      paint();
      // The onsite campaign paints a beat after first render and can clear the
      // slot with an empty result; watch for that and refill.
      var mo = new MutationObserver(paint);
      mo.observe(slot, { childList: true, characterData: true, subtree: true });
      // Stop watching after a few seconds: by then the campaign has run, and
      // a later real status change reloads the page anyway.
      setTimeout(function () { mo.disconnect(); }, 8000);
    } catch (e) {}
  }"""
if old not in s: sys.exit('STOP: fillBannerFallback not in expected form')
new="""  function fillBannerFallback(slot) {
    try {
      if (!slot || !window.Store || !Store.currentUser) return;
      var v = window.VERTICAL || {};
      var paint = function () {
        // Read the profile FRESH each paint — never a value frozen at first
        // render — so the banner always shows the current trip and status,
        // even if the page loaded a beat before the write settled. The site
        // is the last word: fill our slot whenever it is empty and the
        // profile says Delayed/Cancelled; a campaign's real text is left.
        var u = Store.currentUser() || {};
        var msg = tripBannerText(u.trip_status, u.next_trip, v.key);
        if (!msg) return;
        if (!slot.textContent.trim() || slot.getAttribute('data-fallback') === '1') {
          if (slot.textContent !== msg) slot.textContent = msg;
          slot.setAttribute('data-fallback', '1');
        }
      };
      paint();
      // Repaint if the profile changes or the campaign clears the slot.
      var mo = new MutationObserver(paint);
      mo.observe(slot, { childList: true, characterData: true, subtree: true });
      // Also re-read shortly after load, in case the write settled just after
      // first paint (delay set on the previous page, this page loading).
      var t = 0, iv = setInterval(function () { paint(); if (++t >= 6) clearInterval(iv); }, 500);
      setTimeout(function () { mo.disconnect(); }, 8000);
    } catch (e) {}
  }"""
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Banner reads the profile fresh on every paint"')
