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
     Two different ids are in play and they are easy to confuse:

       Store.visitorId()      our own uuid, sent as `uuid` on the user push
       Insider.getUserId()    Insider's own profile id (spUID)

     User Profiles in the panel is keyed on the SECOND one. Searching the
     panel for our uuid finds nothing, which is a confusing five minutes for
     anyone who tries it.
     ---------------------------------------------------------------------- */
  function insiderProfileId() {
    try { return (window.Insider && Insider.getUserId && Insider.getUserId()) || null; }
    catch (e) { return null; }
  }

  function panelProfilesUrl() {
    var account = (window.ENVIRONMENT || {}).account;
    if (!account) return null;
    return 'https://' + account + '.inone.useinsider.com/user-profiles';
  }

  // Deep link straight to the profile. The panel resolves /user-profiles/<id>
  // for the same id that its search box accepts, which is Insider's own
  // profile id (spUID) — not our uuid, which it does not know about.
  function panelProfileUrl() {
    var base = panelProfilesUrl();
    var id = insiderProfileId();
    return base && id ? base + '/' + encodeURIComponent(id) : base;
  }

  function openProfileInPanel() {
    var url = panelProfileUrl();
    if (!url) return;
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

      // Profile id gets its own row, as a real link straight to the profile in
      // the panel. Styled inline so it reads as a link without depending on
      // the site stylesheet, which does not know about this component.
      if (profileId && panelProfileUrl()) {
        var stat = document.createElement('div');
        stat.className = 'ins-stat ins-stat--link';
        var a = document.createElement('a');
        a.href = panelProfileUrl();
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = profileId;
        a.title = 'Open this profile in the Insider panel';
        a.style.cssText = 'color:#7CC8A6;text-decoration:underline;' +
                          'text-underline-offset:2px;cursor:pointer;word-break:break-all';
        var dd = document.createElement('dd');
        dd.appendChild(a);
        var dt = document.createElement('dt');
        dt.textContent = 'Profile id';
        stat.appendChild(dt);
        stat.appendChild(dd);
        el.status.appendChild(stat);
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
