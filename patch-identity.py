#!/usr/bin/env python3
"""Identity rule: the browser's visitor id is the uuid, for life. Sign-in never
switches it; the whois lookup never switches it; only picking a saved visitor
(or New visitor) changes it. Email is an attribute. Run from the repo root."""
import sys, io
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
pairs=[
# sign-in: keep the visitor id
("""    var merged = Object.assign({}, currentUser() || {}, profile);
    if (profile && profile.email && (!merged.uuid || merged.uuid.indexOf('LMN-') === 0)) merged.uuid = stableId(profile.email);
    if (!merged.uuid) merged.uuid = stableId(merged.email);""",
"""    var merged = Object.assign({}, currentUser() || {}, profile);
    /* The uuid is the browser's visitor id, for life. It is never replaced
       by an email-derived one: the platform keeps one uuid per profile, and
       switching at sign-in split every new booking onto a second record.
       Only a saved visitor (signInAs) or New visitor changes the id. */
    if (!merged.uuid) merged.uuid = visitorId();"""),
# whois: never switch identity on the strength of an email
("""  function adoptKnown(email) {
    return fetch('/.netlify/functions/whois', {""",
"""  function adoptKnown(email) {
    /* Disabled: adopting a known profile's uuid for a typed email switched
       the browser's identity mid-session, which is the split we are
       removing. A typed email attaches to THIS profile; to become an
       existing person, pick a saved visitor. */
    return Promise.resolve(false);
    return fetch('/.netlify/functions/whois', {"""),
]
for old,new in pairs:
    if old not in s: sys.exit('STOP: expected text not found:\n'+old[:100])
    s=s.replace(old,new,1)
# anonymous pushes: restore the uuid if patch-uuid removed it (either state is fine)
s=s.replace("""    var base = { language: env('locale', 'en_GB'), gdpr_optin: true };
    if (u && u.uuid) base.uuid = u.uuid;""",
"""    var base = { uuid: visitorId(), language: env('locale', 'en_GB'), gdpr_optin: true };""")
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Identity: visitor id is the uuid for life"')
