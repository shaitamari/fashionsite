#!/usr/bin/env python3
"""Re-identify after every profile write a campaign reads; award loyalty once.
Run from the repo root."""
import sys, io
def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s: sys.exit('STOP: expected text not found in ' + path + ':\n' + old[:120])
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s); print('patched', path)

patch('confirmation.html', [
# loyalty: only on the first load of a fresh order, then re-identify
("""  if (ORDER && Store.currentUser() && ORDER.total > 0) {
    var cu = Store.currentUser();""",
"""  if (FRESH && ORDER && Store.currentUser() && ORDER.total > 0) {
    var cu = Store.currentUser();"""),
("""    if (window.insDebugNote) window.insDebugNote('loyalty: +' + Math.round(ORDER.total) + ' pts → ' + pts + ' · ' + tier, 'ok');
  }""",
"""    if (window.insDebugNote) window.insDebugNote('loyalty: +' + Math.round(ORDER.total) + ' pts → ' + pts + ' · ' + tier, 'ok');
    /* Points, tier, trip and purchase history were just written. Re-identify
       so the next page renders from the profile, not the session's snapshot.
       Runs once: the reload marks the order as sent, so FRESH is false. */
    setTimeout(function () { Store.refreshIdentity('confirmation.html'); }, 4000);
  }"""),
])

patch('index.html', [
("""    msg.textContent = 'Subscribed. email + email_optin written to the profile.';
    ev.target.reset();""",
"""    msg.textContent = 'Subscribed. Updating your profile\\u2026';
    ev.target.reset();
    /* Email and opt-in were just written; re-identify so anything keyed on
       them renders from the profile. */
    setTimeout(function () { Store.refreshIdentity('index.html'); }, 4000);"""),
])
print('done — now: posh "Re-identify after purchase and signup; loyalty awarded once"')
