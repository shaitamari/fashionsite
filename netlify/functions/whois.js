/* whois — look up the profile the platform already holds for an email.
   ----------------------------------------------------------------------------
   The site signs people in by uuid: at login the browser adopts the uuid the
   platform knows for that email, so the same person resolves to the same
   profile from any machine. Identity resolution on these accounts is
   uuid-first with a limit of one uuid per profile, so sending a known email
   on a fresh uuid would create a stranger instead.

   The UCD token must never reach the browser, so the lookup runs here.
   Tokens are Netlify environment variables, one per account:
     INSIDER_UCD_TOKEN_PARTNERSANDBOX   (…-sandbox.insiderdemo.com)
     INSIDER_UCD_TOKEN_SALESDEMO        (bare insiderdemo.com hostnames)

   POST { email }  ->  { found, uuid, name, surname, tier, points, email }
   Only answers requests from insiderdemo.com (or localhost for testing). */

// Tokens pasted into Netlify sometimes arrive with invisible characters
// (a zero-width space at the start was the first one). Headers must be
// plain ASCII, so anything outside the printable range is dropped.
function clean(t) { return String(t || '').replace(/[^\x21-\x7E]/g, ''); }
const ACCOUNTS = {
  partnersandbox: clean(process.env.INSIDER_UCD_TOKEN_PARTNERSANDBOX),
  salesdemo: clean(process.env.INSIDER_UCD_TOKEN_SALESDEMO)
};

function accountFor(host) {
  host = String(host || '').toLowerCase();
  if (host.indexOf('-sandbox.insiderdemo.com') > -1) return 'partnersandbox';
  if (host.indexOf('insiderdemo.com') > -1) return 'salesdemo';
  return 'partnersandbox';   // localhost and previews
}

function allowed(origin) {
  if (!origin) return true;
  try {
    var h = new URL(origin).hostname;
    return /(^|\.)insiderdemo\.com$/.test(h) || h === 'localhost' || h === '127.0.0.1';
  } catch (e) { return false; }
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

  var email = '';
  try { email = String((JSON.parse(event.body || '{}').email || '')).trim().toLowerCase(); } catch (e) {}
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'email' }) };
  }

  var host = event.headers['x-forwarded-host'] || event.headers.host || '';
  try { if (origin) host = new URL(origin).hostname; } catch (e) {}
  var account = accountFor(host);
  var token = ACCOUNTS[account];
  if (!token) return { statusCode: 200, headers: cors, body: JSON.stringify({ found: false, reason: 'no token for ' + account }) };

  try {
    var res = await fetch('https://unification.useinsider.com/api/user/v1/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PARTNER-NAME': account, 'X-REQUEST-TOKEN': token },
      body: JSON.stringify({
        identifiers: { email: email },
        attributes: ['uuid', 'email', 'name', 'surname', 'c_membership_tier', 'c_loyalty_points']
      })
    });
    var text = await res.text();
    var data = {};
    try { data = JSON.parse(text); } catch (e) {}
    // The profile API nests differently across versions; look in the usual places.
    var d = data.data || data;
    var ids = d.identifiers || (d.user && d.user.identifiers) || {};
    var attrs = d.attributes || (d.user && d.user.attributes) || {};
    var uuid = ids.uuid || attrs.uuid || (Array.isArray(ids.uuid) ? ids.uuid[0] : null);
    if (Array.isArray(uuid)) uuid = uuid[0];
    if (!res.ok || !uuid) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ found: false, status: res.status }) };
    }
    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({
        found: true, uuid: uuid, email: email,
        name: attrs.name || '', surname: attrs.surname || '',
        tier: attrs.c_membership_tier || '', points: attrs.c_loyalty_points || 0
      })
    };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ found: false, error: String(e && e.message || e) }) };
  }
};
