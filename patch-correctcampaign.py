#!/usr/bin/env python3
"""Correct the CAMPAIGN's banner in place instead of adding a second one.
The campaign renders the trip-status line from its own lagging snapshot, so it
shows the previous trip (or nothing). The site computes the current message and
overwrites the campaign's bar text when it differs; it also hides the site's own
#trip-banner duplicate so only the top campaign bar shows. Run from repo root
(vertical.js at repo root — script repoints to assets/)."""
import io, sys
p='assets/vertical.js'; s=io.open(p,encoding='utf-8').read()
old="""  function fillBannerFallback(slot) {
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
if old not in s: sys.exit('STOP: fresh-read fillBannerFallback not found')
new="""  // Recognise a trip-status line so we only ever touch the disruption banner,
  // never the loyalty/tier campaign that shares the ins-tier-message class.
  function looksLikeTripLine(txt) {
    if (!txt) return false;
    return /change to your .* booking|running late|not ready|cancelled|holding it for you/i.test(txt);
  }
  function fillBannerFallback(slot) {
    try {
      if (!window.Store || !Store.currentUser) return;
      var v = window.VERTICAL || {};
      var paint = function () {
        var u = Store.currentUser() || {};
        var msg = tripBannerText(u.trip_status, u.next_trip, v.key);
        // The campaign renders the disruption line from its own lagging
        // snapshot, so it can show the PREVIOUS trip or nothing. Correct any
        // campaign banner element in place: if the profile has a message,
        // set it there when it differs; if the profile has no disruption,
        // clear a stale campaign line. .ins-element-content is the campaign's
        // text node; we only touch ones that look like a trip line (or are
        // empty children of a tier-message), never the loyalty campaign.
        var camp = document.querySelectorAll('.ins-tier-message .ins-element-content, .ins-element-content');
        for (var i = 0; i < camp.length; i++) {
          var el = camp[i];
          var cur = (el.textContent || '').replace(/[\\u00a0\\u200b]/g, '').trim();
          var inTier = el.closest && el.closest('.ins-tier-message');
          if (msg) {
            if (looksLikeTripLine(cur) && cur !== msg) el.textContent = msg;
            else if (!cur && inTier) el.textContent = msg;
          } else {
            if (looksLikeTripLine(cur)) el.textContent = '';
          }
        }
        // Hide the site's own duplicate slot: the campaign bar is the one on
        // screen. Keep the slot in the DOM as a fallback only if no campaign
        // element exists at all.
        if (slot) {
          var anyCamp = document.querySelector('.ins-tier-message .ins-element-content, .ins-element-content');
          if (anyCamp) { slot.style.display = 'none'; }
          else {
            slot.style.display = '';
            if (msg) { if (slot.textContent !== msg) slot.textContent = msg; slot.setAttribute('data-fallback','1'); }
            else slot.textContent = '';
          }
        }
      };
      paint();
      var mo = new MutationObserver(paint);
      mo.observe(document.body, { childList: true, characterData: true, subtree: true });
      var t = 0, iv = setInterval(function () { paint(); if (++t >= 8) clearInterval(iv); }, 500);
      setTimeout(function () { mo.disconnect(); }, 10000);
    } catch (e) {}
  }"""
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Correct the campaign banner in place; one bar, current trip"')
