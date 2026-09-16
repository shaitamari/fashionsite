#!/usr/bin/env python3
"""Site is the last word on the trip banner, campaign left fully live.
(1) Watch #trip-banner: if it is emptied while the profile says Delayed/
    Cancelled, refill with the same copy.
(2) Hide any OTHER .trip-banner element the campaign renders empty (the stray
    blank bar), so two banners never show. A campaign element with real text
    is left alone.
Run from repo root. Applies to the fallback-only vertical.js."""
import io, sys
p='assets/vertical.js'; s=io.open(p,encoding='utf-8').read()
old="""  function fillBannerFallback(slot) {
    try {
      if (!slot || !window.Store || !Store.currentUser) return;
      var u = Store.currentUser() || {};
      var v = window.VERTICAL || {};
      var msg = tripBannerText(u.trip_status, u.next_trip, v.key);
      if (!msg) return;
      // Only fill if the campaign hasn't already put something here.
      if (slot.textContent.trim()) return;
      slot.textContent = msg;
      slot.setAttribute('data-fallback', '1');
    } catch (e) {}
  }"""
if old not in s: sys.exit('STOP: fillBannerFallback not in the expected form — send me sed -n 685,700p assets/vertical.js')
new="""  function fillBannerFallback(slot) {
    try {
      if (!slot || !window.Store || !Store.currentUser) return;
      var u = Store.currentUser() || {};
      var v = window.VERTICAL || {};
      var msg = tripBannerText(u.trip_status, u.next_trip, v.key);
      if (!msg) return;
      var paint = function () {
        // Site is the last word on our slot: whenever it is empty and the
        // profile says Delayed/Cancelled, the message is present. A campaign
        // that renders REAL text into our slot is left (we only fill empty).
        if (!slot.textContent.trim()) {
          slot.textContent = msg;
          slot.setAttribute('data-fallback', '1');
        }
        // The campaign may also render its OWN banner element elsewhere and
        // leave it blank. Hide any empty .trip-banner that is not our slot,
        // so two bars never show; one with real text is left visible.
        var bars = document.querySelectorAll('.trip-banner');
        for (var i = 0; i < bars.length; i++) {
          if (bars[i] === slot) continue;
          if (!bars[i].textContent.trim()) bars[i].style.display = 'none';
          else bars[i].style.display = '';
        }
      };
      paint();
      var mo = new MutationObserver(paint);
      mo.observe(document.body, { childList: true, characterData: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 8000);
    } catch (e) {}
  }"""
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Site is the last word on the trip banner; hide the empty campaign bar"')
