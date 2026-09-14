#!/usr/bin/env python3
"""Finish patch-reid3: the homepage signup re-identify. Safe to re-run."""
import sys, io, re
p='index.html'; s=io.open(p,encoding='utf-8').read()
if "refreshIdentity('index.html')" in s:
    print('index.html already patched'); sys.exit(0)
i = s.find("newsletter_signup")
if i < 0: sys.exit('STOP: no newsletter_signup in index.html')
j = s.find("ev.target.reset();", i)
if j < 0:
    j = s.find("\n  });", i)  # end of the submit handler
    if j < 0: sys.exit('STOP: could not find the end of the signup handler')
    ins = "\n    setTimeout(function () { Store.refreshIdentity('index.html'); }, 4000);"
    s = s[:j] + ins + s[j:]
else:
    k = j + len("ev.target.reset();")
    ins = "\n    /* Email and opt-in were just written; re-identify so anything keyed on\n       them renders from the profile. */\n    setTimeout(function () { Store.refreshIdentity('index.html'); }, 4000);"
    s = s[:k] + ins + s[k:]
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Re-identify after purchase and signup; loyalty awarded once"')
