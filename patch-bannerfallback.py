#!/usr/bin/env python3
"""Local fallback for the trip-status banner: the site fills #trip-banner with
the same copy the onsite campaign uses, so the disruption message never shows
blank in a demo even if the campaign lags or the profile hasn't propagated.
The campaign, if it renders, overwrites with identical text. Run from repo root."""
import io, sys
p='assets/vertical.js'; s=io.open(p,encoding='utf-8').read()
anchor="        var anchor = document.querySelector('.hero') || document.querySelector('header');\n        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor.nextSibling);\n      };"
if anchor not in s: sys.exit('STOP: banner slot placement not found — vertical.js differs from expected')
add = """        var anchor = document.querySelector('.hero') || document.querySelector('header');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor.nextSibling);
        fillBannerFallback(slot);
      };"""
s=s.replace(anchor, add, 1)

# the fallback function + shared copy, inserted just before applyVertical
marker="  /* --- theme + copy, applied once the catalog has parsed ----------------- */"
if marker not in s: sys.exit('STOP: applyVertical marker not found')
fn = """  /* --- trip-banner local fallback --------------------------------------
     The disruption message is an Insider One onsite campaign reading
     trip_status / next_trip from the profile. In a live account that is the
     whole story. In a demo the campaign can render a beat late, or the
     profile write may not have propagated to the onsite renderer yet, and an
     empty navy bar is worse than no bar. So the site writes the SAME sentence
     into the slot from what it already knows about the signed-in profile; if
     the campaign then renders, it overwrites with identical text. One copy
     source (tripBannerText) keeps them from drifting. Only fires when the
     profile actually says Delayed/Cancelled, so it can never show a wrong or
     stale message. */
  function tripBannerText(status, trip, vkey) {
    var t = trip || 'your trip';
    var hotel = vkey === 'hotels';
    if (status === 'Delayed') {
      return hotel
        ? "There's a change to your " + t + " booking: your room isn't ready yet. We're holding it and the first drink's on us."
        : "There's a change to your " + t + " booking: it's running late at our end. We're holding it for you and will text the new time \\u2014 and your first drink's on us.";
    }
    if (status === 'Cancelled') {
      return hotel
        ? "Your " + t + " booking was cancelled at our end. We've held the same room nearby \\u2014 details are in your email."
        : "Your " + t + " booking was cancelled at our end. You're on the next departure at no charge \\u2014 details are in your email.";
    }
    return '';
  }
  function fillBannerFallback(slot) {
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
  }

""" + marker
s=s.replace(marker, fn, 1)
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Trip banner: local fallback so the demo never shows blank"')
