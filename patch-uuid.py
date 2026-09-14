#!/usr/bin/env python3
"""Anonymous pages no longer push a uuid. Run from the repo root."""
import sys, io
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="""    var base = { uuid: visitorId(), language: env('locale', 'en_GB'),

                 gdpr_optin: true };"""
new="""    /* No uuid until someone signs in. An anonymous browser used to push its
       random visitor id as uuid, so the profile got a uuid before the email
       arrived; at sign-in the site switched to the email-derived id, the
       platform could not attach a second uuid, and the attributes went to a
       record the session never rendered. Anonymous profiles are keyed on the
       tag's own id; the first uuid the platform sees is the one to keep. */
    var base = { language: env('locale', 'en_GB'), gdpr_optin: true };
    if (u && u.uuid) base.uuid = u.uuid;"""
if old not in s: sys.exit('STOP: expected text not found in ' + p)
s=s.replace(old,new,1); io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Anonymous visitors push no uuid"')
