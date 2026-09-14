#!/usr/bin/env python3
"""Re-identify after every profile write a campaign reads; award loyalty once.
Run from the repo root."""
import sys, io, re
def load(p): return io.open(p, encoding='utf-8').read()
def save(p, s): io.open(p, 'w', encoding='utf-8').write(s); print('patched', p)

# --- confirmation.html ---------------------------------------------------
p='confirmation.html'; s=load(p)
# 1. loyalty only on a fresh order
m = re.search(r"\n(\s*)if \(([^\n]*?)ORDER\.total > 0\) \{", s)
if not m: sys.exit('STOP: loyalty condition not found in ' + p)
cond = m.group(2)
if 'FRESH' not in cond:
    s = s[:m.start(2)] + 'FRESH && ' + s[m.start(2):]
# 2. re-identify once the loyalty write is done: append after the debug note line
m2 = re.search(r"\n(\s*)if \(window\.insDebugNote\) window\.insDebugNote\('loyalty: \+'[^\n]*\n", s)
if not m2: sys.exit('STOP: loyalty debug line not found in ' + p)
indent = m2.group(1)
s = s[:m2.end()] + indent + "/* Points, tier, trip and history were just written. Re-identify so the\n" + indent + "   next page renders from the profile. Runs once: the reload marks the\n" + indent + "   order as sent, so FRESH is false afterwards. */\n" + indent + "setTimeout(function () { Store.refreshIdentity('confirmation.html'); }, 4000);\n" + s[m2.end():]
save(p, s)

# --- index.html ------------------------------------------------------------
p='index.html'; s=load(p)
old="""    msg.textContent = 'Subscribed. email + email_optin written to the profile.';
    ev.target.reset();"""
new="""    msg.textContent = 'Subscribed. Updating your profile\\u2026';
    ev.target.reset();
    /* Email and opt-in were just written; re-identify so anything keyed on
       them renders from the profile. */
    setTimeout(function () { Store.refreshIdentity('index.html'); }, 4000);"""
if old not in s: sys.exit('STOP: signup handler not found in ' + p)
save(p, s.replace(old, new, 1))
print('done — now: posh "Re-identify after purchase and signup; loyalty awarded once"')
