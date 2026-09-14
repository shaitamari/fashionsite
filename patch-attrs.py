#!/usr/bin/env python3
"""Flat attributes written server-side through Upsert (trip status, next trip,
loyalty), so a mid-session write lands on the profile regardless of the tag.
Run from the repo root."""
import io, sys
def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s: sys.exit('STOP: expected text not found in ' + path + ':\n' + old[:120])
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s); print('patched', path)

# --- netlify/functions/sync.js: accept { uuid, custom: {...} } as well -----
patch('netlify/functions/sync.js', [
("const ALLOWED = ['bookings', 'purchases'];",
 "const ALLOWED = ['bookings', 'purchases'];\n"
 "// Flat custom attributes the page may write directly. The tag also sends\n"
 "// these, but a tag write can be lost when the session is reset moments\n"
 "// later; Upsert lands on the profile immediately and unconditionally.\n"
 "const FLAT = ['trip_status', 'next_trip', 'next_trip_date', 'next_trip_when', 'membership_tier', 'loyalty_points', 'is_vip'];"),
("""  var uuid = String(body.uuid || '').trim();
  var attribute = String(body.attribute || '').trim();
  var items = Array.isArray(body.items) ? body.items : [];
  var mode = body.mode === 'replace' ? 'replace' : 'add';
  if (!uuid || ALLOWED.indexOf(attribute) === -1 || !items.length) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'uuid, attribute and items required' }) };
  }
""",
"""  var uuid = String(body.uuid || '').trim();
  var attribute = String(body.attribute || '').trim();
  var items = Array.isArray(body.items) ? body.items : [];
  var mode = body.mode === 'replace' ? 'replace' : 'add';
  var custom = (body.custom && typeof body.custom === 'object') ? body.custom : null;
  var flat = {};
  if (custom) Object.keys(custom).forEach(function (k) { if (FLAT.indexOf(k) > -1) flat[k] = custom[k]; });
  var hasFlat = Object.keys(flat).length > 0;
  if (!uuid || (!hasFlat && (ALLOWED.indexOf(attribute) === -1 || !items.length))) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'uuid and either custom attributes or attribute+items required' }) };
  }
"""),
("""  var actions = items.map(function (v) { return { action: mode === 'replace' ? 'replace' : 'add', value: v }; });
  var payload = { users: [{ identifiers: { uuid: uuid }, object_attributes: { custom: {} } }] };
  payload.users[0].object_attributes.custom[attribute] = actions;
""",
"""  var payload = { users: [{ identifiers: { uuid: uuid } }] };
  if (hasFlat) payload.users[0].attributes = { custom: flat };
  if (items.length && ALLOWED.indexOf(attribute) > -1) {
    var actions = items.map(function (v) { return { action: mode === 'replace' ? 'replace' : 'add', value: v }; });
    payload.users[0].object_attributes = { custom: {} };
    payload.users[0].object_attributes.custom[attribute] = actions;
  }
"""),
])

# --- assets/store.js: Store.syncAttributes(custom) ----------------------------
patch('assets/store.js', [
("""  /* Sync the bookings that have not been sent yet; mark them on success.""",
"""  /* Write flat custom attributes straight to the profile through the same
     function. Used for the writes a campaign reads in the same session
     (trip status, next trip, loyalty), so they land regardless of what the
     tag does with its queue when the session is reset. */
  function syncAttributes(custom) {
    return fetch('/.netlify/functions/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: visitorId(), custom: custom || {} })
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (window.insDebugNote) window.insDebugNote('attributes → Upsert: ' + (out.ok ? 'ok' : 'failed ' + (out.status || out.reason || out.error || '')), out.ok ? 'ok' : 'warn');
      return out;
    }).catch(function () {
      if (window.insDebugNote) window.insDebugNote('attributes → Upsert: unreachable', 'warn');
      return { ok: false };
    });
  }

  /* Sync the bookings that have not been sent yet; mark them on success."""),
("    currentUser: currentUser, signIn: signIn, signOut: signOut, refreshIdentity: refreshIdentity, userPayload: userPayload,",
 "    currentUser: currentUser, signIn: signIn, signOut: signOut, refreshIdentity: refreshIdentity, syncAttributes: syncAttributes, userPayload: userPayload,"),
])

# --- confirmation.html: delay click and booking write go server-side too -----
patch('confirmation.html', [
("""      Store.signIn({ trip_status: 'Delayed' });
      window.InsiderQueue.push({ type: 'user', value: Store.userPayload() });
      window.InsiderQueue.push({ type: 'init' });""",
"""      Store.signIn({ trip_status: 'Delayed' });
      window.InsiderQueue.push({ type: 'user', value: Store.userPayload() });
      window.InsiderQueue.push({ type: 'init' });
      Store.syncAttributes({ trip_status: 'Delayed' });"""),
("""      trip_status: 'On time'
    });""",
"""      trip_status: 'On time'
    });
    var cuT = Store.currentUser() || {};
    Store.syncAttributes({ next_trip: cuT.next_trip, next_trip_date: cuT.next_trip_date, next_trip_when: cuT.next_trip_when, trip_status: 'On time' });"""),
])
print('done — now: posh "Trip attributes written server-side"')
