/* sync — write Array-of-Objects attributes to a profile through the Upsert API.
   ----------------------------------------------------------------------------
   The web tag's user object cannot carry an Array of Objects (it is dropped
   on a 200); the only route is Upsert's object_attributes with patch actions.
   The UCD token must stay server-side, so the page posts the array here and
   this function writes it: one "add" action per object, or "replace" when
   the page asks to reset.

   POST { uuid, attribute, items: [ {...}, ... ], mode: "add" | "replace" }
   -> { ok, status, response }

   Tokens are Netlify environment variables, one per account:
     INSIDER_UCD_TOKEN_PARTNERSANDBOX   (…-sandbox.insiderdemo.com)
     INSIDER_UCD_TOKEN_SALESDEMO        (bare insiderdemo.com hostnames)
   Only insiderdemo.com pages (and localhost) may call it, and only the
   attributes listed in ALLOWED can be written. */

function clean(t) { return String(t || '').replace(/[^\x21-\x7E]/g, ''); }
const ACCOUNTS = {
  partnersandbox: clean(process.env.INSIDER_UCD_TOKEN_PARTNERSANDBOX),
  salesdemo: clean(process.env.INSIDER_UCD_TOKEN_SALESDEMO)
};
const ALLOWED = ['bookings', 'purchases'];
// Flat custom attributes the page may write directly. The tag also sends
// these, but a tag write can be lost when the session is reset moments
// later; Upsert lands on the profile immediately and unconditionally.
const FLAT = ['trip_status', 'next_trip', 'next_trip_date', 'next_trip_when', 'membership_tier', 'loyalty_points', 'is_vip'];

function accountFor(host) {
  host = String(host || '').toLowerCase();
  if (host.indexOf('-sandbox.insiderdemo.com') > -1) return 'partnersandbox';
  if (host.indexOf('insiderdemo.com') > -1) return 'salesdemo';
  return 'partnersandbox';
}
function allowed(origin) {
  if (!origin) return true;
  try { var h = new URL(origin).hostname; return /(^|\.)insiderdemo\.com$/.test(h) || h === 'localhost' || h === '127.0.0.1'; }
  catch (e) { return false; }
}

exports.handler = async function (event) {
  var origin = event.headers.origin || event.headers.referer || '';
  var cors = {
    'Access-Control-Allow-Origin': allowed(origin) ? (origin.replace(/\/[^/]*$/, '') || '*') : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: '' };
  if (!allowed(origin)) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'origin' }) };

  var body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  var uuid = String(body.uuid || '').trim();
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

  var host = event.headers['x-forwarded-host'] || event.headers.host || '';
  try { if (origin) host = new URL(origin).hostname; } catch (e) {}
  var account = accountFor(host);
  var token = ACCOUNTS[account];
  if (!token) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'no token for ' + account }) };

  // One patch action per object. "replace" is expressed as a remove-all
  // followed by adds where the platform supports it; we send adds and let
  // the page decide when to clear.
  var payload = { users: [{ identifiers: { uuid: uuid } }] };
  if (hasFlat) payload.users[0].attributes = { custom: flat };
  if (items.length && ALLOWED.indexOf(attribute) > -1) {
    var actions = items.map(function (v) { return { action: mode === 'replace' ? 'replace' : 'add', value: v }; });
    payload.users[0].object_attributes = { custom: {} };
    payload.users[0].object_attributes.custom[attribute] = actions;
  }

  try {
    var res = await fetch('https://unification.useinsider.com/api/user/v1/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PARTNER-NAME': account, 'X-REQUEST-TOKEN': token },
      body: JSON.stringify(payload)
    });
    var text = await res.text();
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: res.ok, status: res.status, response: text.slice(0, 800) }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};
