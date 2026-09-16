#!/usr/bin/env python3
"""Keep the trip-banner fallback as the last word: if the onsite campaign
renders and empties the slot while the profile still says Delayed/Cancelled,
refill with the same copy. Run from repo root. (Applies on top of
patch-bannerfallback.)"""
import io, sys
p='assets/vertical.js'; s=io.open(p,encoding='utf-8').read()
old="""      if (slot.textContent.trim()) return;
      slot.textContent = msg;
      slot.setAttribute('data-fallback', '1');
    } catch (e) {}
  }"""
if old not in s: sys.exit('STOP: fillBannerFallback body not found — run patch-bannerfallback first')
new="""      var paint = function () {
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
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Trip banner fallback is the last word"')
