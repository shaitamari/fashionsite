/* ============================================================================
   SDK telemetry console
   ----------------------------------------------------------------------------
   Wraps window.InsiderQueue.push so every payload this site sends is visible
   on the page, in order, with a timestamp — no DevTools required.

   Load order matters. This file must run AFTER `window.InsiderQueue = []`
   and BEFORE the first push, otherwise early pushes are not captured.
   It does not modify, delay, or drop anything; it observes and forwards.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = (window.SITE_CONFIG || {});
  var OPTS = CFG.debugPanel || {};
  var params = new URLSearchParams(location.search);
  var forcedOff = params.get('debug') === '0';
  var enabled = OPTS.enabled !== false && !forcedOff;

  var log = [];
  var startedAt = Date.now();

  /* --- capture ----------------------------------------------------------- */

  window.InsiderQueue = window.InsiderQueue || [];

  function record(entry, source) {
    var item = {
      at: new Date(),
      ms: Date.now() - startedAt,
      type: (entry && entry.type) || '(no type)',
      payload: entry,
      source: source || 'page'
    };
    log.push(item);
    if (OPTS.mirrorToConsole !== false) {
      console.log('%c[InsiderQueue] ' + item.type, 'color:#1F4D3D;font-weight:600', entry);
    }
    render();
    return item;
  }

  // Anything pushed before this file ran.
  window.InsiderQueue.forEach(function (e) { record(e, 'pre-existing'); });

  var nativePush = window.InsiderQueue.push;
  window.InsiderQueue.push = function () {
    for (var i = 0; i < arguments.length; i++) record(arguments[i]);
    return nativePush.apply(window.InsiderQueue, arguments);
  };

  // Public helper so page code can annotate the timeline with non-SDK notes.
  window.insDebugNote = function (text, tone) {
    log.push({ at: new Date(), ms: Date.now() - startedAt, type: 'note',
               note: text, tone: tone || 'info', source: 'site' });
    render();
  };

  if (!enabled) return;

  /* --- status probes ------------------------------------------------------ */

  function tagState() {
    if (window.Insider && window.Insider.eventManager) return { label: 'loaded', ok: true };
    if (window.Insider) return { label: 'partial', ok: true };
    return { label: 'not loaded', ok: false };
  }

  function eurekaState() {
    if (window.Insider && window.Insider.eureka) return { label: 'available', ok: true };
    return { label: 'unavailable', ok: false };
  }

  /* --- resetting identity -------------------------------------------------
     Store.resetVisitor() clears our own keys, but Insider keeps its profile:
     the spUID lives in its own prefixed storage, so the panel would still
     show the same user. For a demo you almost always want a genuinely new
     profile, so clear both.
     ---------------------------------------------------------------------- */
  function resetEverything() {
    // Insider's own storage is prefixed; clearing it forces a new spUID on
    // the next init. Campaign state (shown/closed/joined) lives here too, so
    // this also re-arms any campaign already dismissed in this session.
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf('ins-') === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}

    // Cookies the tag may also be using.
    try {
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (name.indexOf('ins-') === 0) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        }
      });
    } catch (e) {}

    // Then our own keys, which reloads the page.
    if (window.Store && window.Store.resetVisitor) window.Store.resetVisitor();
    else location.reload();
  }

  function lastPageType() {
    var types = ['home', 'category', 'product', 'cart', 'purchase', 'other'];
    for (var i = log.length - 1; i >= 0; i--) {
      if (types.indexOf(log[i].type) > -1) return log[i].type;
    }
    return '—';
  }

  /* --- the Insider profile ------------------------------------------------
     Three ids are in play and they are easy to confuse:

       Store.visitorId()      our uuid, sent as `uuid` on the user push
       Insider.getUserId()    Insider's own spUID (178794192268422e0c19d52...)
       the panel's Profile ID a UUID, shown in User Profiles and in its URL

     The panel's detail page — /user-profiles/<id> — resolves the UUID, and
     that UUID is the `uuid` identifier we send. The spUID is a different
     value in a different format and the panel redirects to the listing when
     given one, so link on the uuid.

     Both are shown in the console: the spUID is still worth seeing, because
     it is what appears in Eureka request URLs and in the tag's own storage.
     ---------------------------------------------------------------------- */
  function insiderProfileId() {
    try { return (window.Insider && Insider.getUserId && Insider.getUserId()) || null; }
    catch (e) { return null; }
  }

  // The id the panel actually resolves.
  function panelProfileKey() {
    try { return (window.Store && window.Store.visitorId && window.Store.visitorId()) || null; }
    catch (e) { return null; }
  }

  function panelProfilesUrl() {
    var account = (window.ENVIRONMENT || {}).account;
    if (!account) return null;
    return 'https://' + account + '.inone.useinsider.com/user-profiles';
  }

  /* --- opening the profile in the panel -----------------------------------
     The panel's User Profiles detail page is /user-profiles/<insider_id>,
     where insider_id is UCD's own profile id — a UUID, distinct from both
     our uuid and the tag's spUID. The web SDK exposes no accessor for it
     (the mobile SDKs have getInsiderID()), but unification writes it to
     localStorage under `ins-mb-uid`, unwrapped: a bare JSON string rather
     than the usual { data, _expires } envelope.

     So read it there. If it is missing — before the first unification call
     completes — fall back to copying the uuid and opening the listing, whose
     search accepts it.
     ---------------------------------------------------------------------- */
  function insiderId() {
    try {
      var raw = localStorage.getItem('ins-mb-uid');
      if (!raw) return null;
      var value = JSON.parse(raw);
      if (typeof value !== 'string' || !value) return null;

      /* Two shapes are known to work as /user-profiles/<id>:

           178794192268422e0c19d52.6c7ec023   hex, a dot, more hex
           e46544a0-0378-4be3-8dfb-...        a 36-char UUID

         This used to accept only the UUID, on the assumption that the dotted
         form was the spUID and a UUID would replace it later. That was wrong:
         on partnersandbox the dotted value is what the panel resolves, and it
         never becomes a UUID. The guard therefore rejected the only id we had,
         insiderId() returned null, and every attempt to open a profile fell
         through to the listing — which looked like a redirect and cost an
         afternoon of chasing a data problem that did not exist.

         Both forms are allowed now. Anything else still falls back rather than
         opening a URL that 404s. */
      if (/^[0-9a-f]+\.[0-9a-f]+$/i.test(value)) return value;
      if (/^[0-9a-f-]{36}$/i.test(value)) return value;
      return null;
    } catch (e) { return null; }
  }

  function panelProfileUrl() {
    var base = panelProfilesUrl();
    var id = insiderId();
    return base && id ? base + '/' + encodeURIComponent(id) : null;
  }

  function openProfileInPanel() {
    var direct = panelProfileUrl();
    if (direct) { window.open(direct, '_blank', 'noopener'); return; }

    // No insider_id yet — copy the uuid and open the listing instead.
    var url = panelProfilesUrl();
    var key = panelProfileKey();
    if (!url) return;
    if (key && navigator.clipboard) {
      navigator.clipboard.writeText(key).catch(function () {});
    }
    window.open(url, '_blank', 'noopener');
  }

  /* --- panel -------------------------------------------------------------- */

  var el = {};
  var open = !!OPTS.startOpen;
  var built = false;

  function build() {
    if (built) return;
    built = true;

    var root = document.createElement('aside');
    root.className = 'ins-console';
    root.setAttribute('aria-label', 'Insider SDK telemetry console');
    root.innerHTML = [
      '<button class="ins-console__toggle" type="button" aria-expanded="false">',
        '<span class="ins-console__dot" data-role="dot"></span>',
        '<span class="ins-console__toggle-label">SDK</span>',
        '<span class="ins-console__count" data-role="count">0</span>',
      '</button>',
      '<div class="ins-console__panel" hidden>',
        '<header class="ins-console__head">',
          '<div>',
            '<p class="ins-console__title">Insider telemetry</p>',
            '<p class="ins-console__sub" data-role="account"></p>',
          '</div>',
          '<button class="ins-console__close" type="button" aria-label="Close console">&times;</button>',
        '</header>',
        '<dl class="ins-console__status" data-role="status"></dl>',
        '<div class="ins-console__bar">',
          '<button class="ins-console__btn" data-act="copy" type="button">Copy log</button>',
          '<button class="ins-console__btn" data-act="profile" type="button">Open profile</button>',
          '<button class="ins-console__btn" data-act="logout" type="button">Log out</button>',
          '<button class="ins-console__btn" data-act="clear" type="button">Clear</button>',
          '<button class="ins-console__btn" data-act="uuid" type="button">New visitor</button>',
        '</div>',
        '<ol class="ins-console__log" data-role="log"></ol>',
      '</div>'
    ].join('');
    document.body.appendChild(root);

    el.root = root;
    el.toggle = root.querySelector('.ins-console__toggle');
    el.panel = root.querySelector('.ins-console__panel');
    el.logEl = root.querySelector('[data-role="log"]');
    el.status = root.querySelector('[data-role="status"]');
    el.count = root.querySelector('[data-role="count"]');
    el.dot = root.querySelector('[data-role="dot"]');
    el.account = root.querySelector('[data-role="account"]');

    el.toggle.addEventListener('click', function () { setOpen(!open); });
    root.querySelector('.ins-console__close').addEventListener('click', function () { setOpen(false); });

    root.querySelector('.ins-console__bar').addEventListener('click', function (ev) {
      var act = ev.target.getAttribute('data-act');
      if (act === 'copy') {
        navigator.clipboard.writeText(JSON.stringify(
          log.map(function (l) { return { ms: l.ms, type: l.type, payload: l.payload, note: l.note }; }), null, 2
        ));
        ev.target.textContent = 'Copied';
        setTimeout(function () { ev.target.textContent = 'Copy log'; }, 1200);
      }
      if (act === 'clear') { log.length = 0; render(); }
      if (act === 'profile') { openProfileInPanel(); }
      // Signs out without resetting the visitor, so the profile keeps its
      // history and the uuid stays stable — the same person, logged out.
      // "New visitor" is the harder reset that starts a fresh profile.
      if (act === 'logout') {
        if (window.Store && window.Store.signOut) window.Store.signOut();
        if (window.insDebugNote) window.insDebugNote('signed out', 'info');
        location.reload();
      }
      if (act === 'uuid') { resetEverything(); }
    });

    setOpen(open);
  }

  function setOpen(next) {
    open = next;
    el.panel.hidden = !open;
    el.toggle.setAttribute('aria-expanded', String(open));
    el.root.classList.toggle('is-open', open);
    if (open) el.logEl.scrollTop = el.logEl.scrollHeight;
  }

  function row(item) {
    var li = document.createElement('li');
    var time = String(item.ms).padStart(5, ' ') + 'ms';

    if (item.type === 'note') {
      li.className = 'ins-row ins-row--note ins-row--' + item.tone;
      li.innerHTML = '<span class="ins-row__t">' + time + '</span>' +
                     '<span class="ins-row__note"></span>';
      li.querySelector('.ins-row__note').textContent = item.note;
      return li;
    }

    var critical = item.type === 'init';
    li.className = 'ins-row' + (critical ? ' ins-row--init' : '');
    li.innerHTML =
      '<div class="ins-row__head">' +
        '<span class="ins-row__t">' + time + '</span>' +
        '<span class="ins-row__type"></span>' +
        '<span class="ins-row__src"></span>' +
      '</div>' +
      '<pre class="ins-row__body"></pre>';
    li.querySelector('.ins-row__type').textContent = item.type;
    li.querySelector('.ins-row__src').textContent = item.source === 'page' ? '' : item.source;

    var body = li.querySelector('.ins-row__body');
    var v = item.payload && item.payload.value;
    body.textContent = v === undefined ? '{ type only }' : JSON.stringify(v, null, 2);
    if (v === undefined) body.classList.add('is-empty');
    return li;
  }

  var raf = null;
  function render() {
    if (!enabled) return;
    if (!built) { if (document.body) build(); else return; }
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;

      el.count.textContent = log.filter(function (l) { return l.type !== 'note'; }).length;

      var tag = tagState();
      el.dot.className = 'ins-console__dot ' + (tag.ok ? 'is-ok' : 'is-wait');
      // Read the resolved environment rather than static config, so the panel
      // never disagrees with the tag that actually loaded.
      var e = window.ENVIRONMENT || {};
      el.account.textContent = (e.account || CFG.partnerName || '?') + ' · ' +
                               (e.partnerId || CFG.partnerId || '?') +
                               (e.locale ? '  ·  ' + e.locale + ' ' + (e.currency || '') : '');

      var eu = eurekaState();
      var visitor = (window.Store && window.Store.visitorId && window.Store.visitorId()) || '—';
      var user = (window.Store && window.Store.currentUser && window.Store.currentUser());
      var profileId = insiderProfileId();
      var rows = [
        ['Insider tag', tag.label, tag.ok],
        ['Eureka SDK', eu.label, eu.ok],
        ['Page type', lastPageType(), true],
        ['Visitor uuid', visitor, true],
        ['Signed in', user ? user.email : 'anonymous', !!user]
      ];
      el.status.innerHTML = rows.map(function (r) {
        return '<div class="ins-stat' + (r[2] ? '' : ' is-off') + '">' +
               '<dt>' + r[0] + '</dt><dd title="' + String(r[1]).replace(/"/g, '') + '">' +
               String(r[1]) + '</dd></div>';
      }).join('');

      // Profile row. Once unification has run we have the insider_id and can
      // link straight to the profile; before that, fall back to copying the
      // uuid for the listing's search box.
      var profileKey = panelProfileKey();
      var directUrl = panelProfileUrl();
      if (profileKey && panelProfilesUrl()) {
        var stat = document.createElement('div');
        stat.className = 'ins-stat ins-stat--link';
        var linkStyle = 'color:#7CC8A6;text-decoration:underline;' +
                        'text-underline-offset:2px;cursor:pointer;' +
                        'word-break:break-all;background:none;border:0;' +
                        'padding:0;font:inherit;text-align:right';
        var node;
        if (directUrl) {
          node = document.createElement('a');
          node.href = directUrl;
          node.target = '_blank';
          node.rel = 'noopener';
          node.textContent = profileKey;
          node.title = 'Open this profile in the Insider panel';
          node.style.cssText = linkStyle;
        } else {
          node = document.createElement('button');
          node.type = 'button';
          node.textContent = profileKey;
          node.title = 'Copy this uuid and open User Profiles';
          node.style.cssText = linkStyle;
          node.addEventListener('click', function () {
            openProfileInPanel();
            node.textContent = 'copied — paste in search';
            setTimeout(function () { node.textContent = profileKey; }, 2000);
          });
        }
        var dd = document.createElement('dd');
        dd.appendChild(node);
        var dt = document.createElement('dt');
        dt.textContent = 'Profile';
        stat.appendChild(dt);
        stat.appendChild(dd);
        el.status.appendChild(stat);
      }

      // The spUID is not what the panel resolves, but it is what appears in
      // Eureka request URLs and the tag's storage, so it stays visible.
      if (profileId) {
        var sp = document.createElement('div');
        sp.className = 'ins-stat';
        sp.innerHTML = '<dt>spUID</dt><dd></dd>';
        sp.querySelector('dd').textContent = profileId;
        sp.querySelector('dd').style.cssText = 'word-break:break-all;opacity:.7';
        el.status.appendChild(sp);
      }

      if (!open) return;
      var stick = el.logEl.scrollTop + el.logEl.clientHeight >= el.logEl.scrollHeight - 40;
      el.logEl.innerHTML = '';
      log.forEach(function (item) { el.logEl.appendChild(row(item)); });
      if (stick) el.logEl.scrollTop = el.logEl.scrollHeight;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { build(); render(); });
  } else { build(); render(); }

  // The tag loads async — re-poll so the status flips to "loaded" when it lands.
  var polls = 0;
  var poll = setInterval(function () {
    render();
    if (++polls > 40 || tagState().ok) clearInterval(poll);
  }, 500);

  window.insDebugLog = log;
})();
