/* ============================================================================
   Vertical loader
   ----------------------------------------------------------------------------
   One deploy serves every subvertical. In production the vertical comes from
   the SUBDOMAIN, which gives each store its own hostname:

       https://beauty.insiderdemo.com      Lumen
       https://lifestyle.insiderdemo.com   Posh Street

   That matters for campaign targeting: a rule scoped to a hostname cannot
   collide with another vertical, whereas a shared domain would need every
   rule to also match a query parameter.

   ?v= still works, for localhost and Netlify deploy previews where there is
   no subdomain to read.

   This file must run BEFORE store.js and before any Insider push, because the
   page-type pushes in each <head> read from Store, which reads from CATALOG.

   The catalog is pulled in with document.write. That is deliberate: it is the
   one mechanism that loads a chosen script synchronously at parse time, which
   is what keeps the ordering above intact. An async loader would mean the
   product push fires before the catalog exists.
   ========================================================================== */
(function () {
  'use strict';

  var DEFAULT = 'beauty';
  var KEY = 'demo.vertical';

  /* --- environments -------------------------------------------------------
     A page carries one Insider tag, and a tag belongs to one account. So the
     account is decided by the hostname, via a suffix on the subdomain:

         beauty.insiderdemo.com           -> partnersandbox   (temporary)
         beauty-sandbox.insiderdemo.com   -> partnersandbox

     Locale and currency travel with the account, because they have to match
     the catalog the feed was loaded into.

     TEMPORARY — every subdomain currently points at partnersandbox.
     salesdemo has no working catalog or Eureka campaign for this build yet,
     so a bare subdomain served the wrong catalogue and Eureka returned
     records the renderer could not read. Rather than have half the estate
     broken, both environments resolve to the account that actually works.

     TO RESTORE the split once salesdemo's catalog is fixed: put the
     commented values below back into 'default'. Nothing else changes —
     the suffix mechanism is untouched and '-sandbox' keeps working
     throughout, so the switch is one edit here plus a deploy.
     --------------------------------------------------------------------- */
  var ENVIRONMENTS = {
    'default': {
      // Restore when salesdemo is ready:
      //   account: 'salesdemo', partnerId: '10002548',
      suffix: null, account: 'partnersandbox', partnerId: '10006846',
      locale: 'en_GB', currency: 'EUR'
    },
    'sandbox': {
      suffix: '-sandbox', account: 'partnersandbox', partnerId: '10006846',
      locale: 'en_GB', currency: 'EUR'
    }
  };

  function resolveEnvironment(sub) {
    for (var key in ENVIRONMENTS) {
      var env = ENVIRONMENTS[key];
      if (env.suffix && sub && sub.slice(-env.suffix.length) === env.suffix) {
        return { key: key, env: env, vertical: sub.slice(0, -env.suffix.length) };
      }
    }
    return { key: 'default', env: ENVIRONMENTS['default'], vertical: sub };
  }

  // Hostnames that are never a vertical — the apex, www, and Netlify's own.
  var RESERVED = ['www', 'insiderdemo', 'localhost', 'netlify'];

  function fromSubdomain() {
    var parts = location.hostname.split('.');
    if (parts.length < 3) return null;            // apex domain or localhost
    var sub = parts[0].toLowerCase();
    if (RESERVED.indexOf(sub) > -1) return null;
    if (/^deploy-preview|^branch-/.test(sub)) return null;
    return sub;
  }

  function pick() {
    // Subdomain wins in production; ?v= is the local and preview escape hatch.
    var sub = fromSubdomain();
    if (sub) return sub;

    var q = new URLSearchParams(location.search).get('v');
    if (q) {
      try { localStorage.setItem(KEY, q); } catch (e) {}
      return q;
    }
    try { return localStorage.getItem(KEY) || DEFAULT; } catch (e) { return DEFAULT; }
  }

  var raw = pick();
  var resolved = resolveEnvironment(fromSubdomain() ? raw : null);
  var vertical = resolved.vertical || raw;

  window.VERTICAL_KEY = vertical;
  window.ENVIRONMENT = resolved.env;
  window.ENVIRONMENT_KEY = resolved.key;

  /* --- favicon ------------------------------------------------------------
     One estate, twelve storefronts, so the tab mark is the Insider One ring
     recoloured per vertical — same shape, twelve hues. Injected here rather
     than in each page's <head> because the vertical is only known once the
     hostname has resolved, and putting it in twelve HTML files would drift.

     Runs immediately, not on DOMContentLoaded: browsers request the favicon
     early, and a late <link> means a flash of the default page icon.

     `apple-touch-icon` is included so a bookmarked storefront on iOS gets the
     mark rather than a screenshot of the page. */
  (function favicon() {
    var href = 'assets/img/favicon/' + vertical + '.svg';
    // Pages all sit at the site root, so a relative path is correct. Absolute
    // would break local preview and the ?v= URLs.
    [['icon', 'image/svg+xml'], ['apple-touch-icon', null]].forEach(function (pair) {
      var link = document.createElement('link');
      link.rel = pair[0];
      if (pair[1]) link.type = pair[1];
      link.href = href;
      document.head.appendChild(link);
    });
  })();

  /* --- legacy insider_object seed ----------------------------------------
     This MUST run before ins.js is written, and it is inline rather than a
     separate file so the ordering cannot drift.

     The tag reads page data through:

         getInsiderObject = Insider.insiderObject || window.insider_object

     `Insider.insiderObject` is built by draining window.InsiderQueue — the
     Web SDK path — and that is gated on an account flag (`inioa` in the
     served ins.js). It is FALSE on partnersandbox, so the queue is never
     consumed: pushes pile up, insiderObject stays undefined, and everything
     that reads the IO falls back to defaults or is simply never sent.

     Two consequences, both silent:

       1. System rules return their hard-coded defaults. getLang reads
          getDataFromIO('user','language','en_US'), so getLocale resolves to
          en_US and Eureka serves the wrong locale's index.

       2. No user data reaches Insider at all. The Hit API builds its payload
          from getValidUserData(), which reads through getInsiderObject() —
          so uuid, email, opt-ins and custom attributes are never sent, and
          no profile appears in the panel.

     Seeding the legacy global fixes both, because the tag falls back to it
     and takes the legacy path anyway when `inioa` is false.

     Load order matters: getLocale caches on first call, and the Hit API
     builds its payload during init, so this has to run before ins.js.

     REMOVE THIS once Web SDK ingestion is enabled on the account:
     Insider.insiderObject then takes precedence automatically, and one
     source of page data is better than two.
     --------------------------------------------------------------------- */
  (function seedInsiderObject(env) {
    var locale = env.locale || 'en_GB';
    var currency = env.currency || 'EUR';
    // getLang splits on "_" and validates the country against its own list.
    // "en" permits GB, so en_GB passes through and getLocale returns it whole.
    var country = locale.split('_')[1] || 'GB';

    var io = window.insider_object = window.insider_object || {};

    io.user = io.user || {};
    io.user.language = locale;
    io.user.country = country;

    // getCurrency checks basket, then product, then transaction currency
    // before falling back to the account default. Seeding basket covers every
    // page type without implying the cart has items in it.
    io.basket = io.basket || {};
    if (io.basket.currency == null) io.basket.currency = currency;

    /* --- full user payload -----------------------------------------------
       store.js builds the real payload — uuid, identifiers, opt-ins, custom
       attributes — and pushes it to InsiderQueue, where nothing consumes it.
       Merge the same object in here so the Hit API can actually send it.

       store.js loads after this file and after the catalog, which for the
       larger verticals is several thousand products, so it can be seconds
       away. Poll generously and also hook DOMContentLoaded, then stop.

       Merge rather than replace, so the locale and country set above survive
       if the payload omits them.

       The uuid matters more than it looks: the panel's User Profiles detail
       page is keyed on it. Without this, no profile exists to open.
       ------------------------------------------------------------------ */
    var merged = false;

    function mergeUserPayload() {
      if (merged) return true;
      if (!(window.Store && window.Store.userPayload)) return false;
      try {
        var payload = window.Store.userPayload() || {};
        Object.keys(payload).forEach(function (k) {
          if (payload[k] === undefined) return;
          // Never let a payload value clobber the locale fields above.
          if (k === 'language' || k === 'country') return;
          io.user[k] = payload[k];
        });
        merged = true;
        if (window.insDebugNote) {
          window.insDebugNote('insider_object user seeded: ' +
            (payload.uuid || 'no uuid'), 'ok');
        }
        // The Hit API may already have built and sent its payload without
        // these fields. Resend the custom attributes so the profile is
        // populated either way; harmless if it was already correct.
        try {
          if (window.Insider && Insider.sendUserAttributes && payload.custom) {
            Insider.sendUserAttributes(payload.custom);
          }
        } catch (e) {}
        return true;
      } catch (e) { return false; }
    }

    if (!mergeUserPayload()) {
      var tries = 0;
      var t = setInterval(function () {
        if (mergeUserPayload() || ++tries > 600) clearInterval(t);
      }, 25);
      document.addEventListener('DOMContentLoaded', mergeUserPayload);
      window.addEventListener('load', mergeUserPayload);
    }

    /* --- re-merge on sign in / sign out ------------------------------------
       The merge above runs once, with whatever the user is at page load —
       usually anonymous. When someone signs in, store.js updates its own
       storage but nothing rebuilds the IO, so the profile keeps the Guest
       payload and the email never reaches the platform.

       Worse, the Hit API builds its payload during init and never resends,
       so even a corrected IO is not enough on its own: the attributes have
       to be pushed explicitly.

       Watch for the identity changing and redo both. Cheap, and it covers
       sign in, sign out, and profile edits without store.js needing to know
       this shim exists.
       ------------------------------------------------------------------- */
    var lastIdentity = null;

    function identityFingerprint() {
      try {
        var u = window.Store && window.Store.currentUser && window.Store.currentUser();
        return u ? (u.email || '') + '|' + (u.uuid || '') : 'anonymous';
      } catch (e) { return null; }
    }

    function syncIdentity() {
      var fp = identityFingerprint();
      if (fp === null || fp === lastIdentity) return;
      lastIdentity = fp;

      // Force a fresh read rather than the once-only merge.
      try {
        var payload = window.Store.userPayload() || {};
        Object.keys(payload).forEach(function (k) {
          if (payload[k] === undefined) return;
          if (k === 'language' || k === 'country') return;
          io.user[k] = payload[k];
        });

        // Send identifiers and attributes explicitly, since the Hit API will
        // not rebuild its payload on its own.
        if (window.Insider) {
          if (Insider.sendUserAttributes && payload.custom) {
            Insider.sendUserAttributes(payload.custom);
          }
          if (Insider.initializeHitAPI) {
            Insider.initializeHitAPI();
          }
        }

        if (window.insDebugNote) {
          window.insDebugNote('identity synced: ' +
            (payload.email || 'anonymous'), 'ok');
        }
      } catch (e) {}
    }

    // Poll rather than patching store.js, so the site stays unaware of this.
    // Cheap at this interval and stops mattering once the SDK path is on.
    setInterval(syncIdentity, 500);
    document.addEventListener('DOMContentLoaded', syncIdentity);

    /* --- page type, product, basket, transaction -------------------------
       The tag's page rules all read insider_object.page.type:

           isOnMainPage      -> 'Home'
           isOnCategoryPage  -> 'Category'
           isOnProductPage   -> 'Product'
           isOnCartPage      -> 'Basket'
           isOnAfterPaymentPage -> 'Confirmation'

       Without them every page resolves as "other", so User Profiles records
       "Other Page View" for the whole funnel and no product or purchase
       events are attributed. getCurrentProduct and getPaidProducts read
       insider_object.product and .basket for the same reason.

       The site already pushes exactly this data — the push TYPE is the page
       type ('home', 'product', ...) and its value is the payload. Mirror
       those pushes into the IO as they happen.

       Note the capitalisation: the rules compare against 'Home', 'Basket'
       and so on, while the pushes are lowercase. And the cart is called
       'basket' in the IO but pushed as 'basket' or 'cart' depending on the
       page, so both are mapped.
       ------------------------------------------------------------------ */
    var PAGE_TYPES = {
      home: 'Home',
      category: 'Category',
      product: 'Product',
      basket: 'Basket',
      cart: 'Basket',
      purchase: 'Confirmation',
      confirmation: 'Confirmation',
      other: 'Other'
    };

    /* --- basket shape ------------------------------------------------------
       The tag reads the cart as:

           getDataFromIO('basket', 'line_items')   ->  [{ product: {...},
                                                          quantity: n }, ...]

       The site pushes `items` instead, with the product fields flat on each
       entry and quantity among them. Two mismatches, and both fail silently:
       the tag sees an empty basket, logs a "Cart Clearance" event on the cart
       page, and never records add-to-cart or abandoned-cart behaviour.

       Translate rather than rename, and keep `items` in place as well so
       anything reading the original shape still works.
       ------------------------------------------------------------------- */
    function toLineItems(items) {
      if (!items || !items.length) return [];
      return items.map(function (it) {
        // Already wrapped — leave it alone.
        if (it && it.product) return it;
        var qty = it && it.quantity != null ? it.quantity : 1;
        return { product: it, quantity: qty };
      });
    }

    function applyPush(entry) {
      if (!entry || !entry.type) return;
      var type = String(entry.type).toLowerCase();

      // Page-type pushes set page.type and, where relevant, the object the
      // system rules read for that page.
      if (PAGE_TYPES[type]) {
        io.page = io.page || {};
        io.page.type = PAGE_TYPES[type];
        if (entry.value && typeof entry.value === 'object') {
          if (type === 'product') io.product = entry.value;
          else if (type === 'basket' || type === 'cart') {
            io.basket = io.basket || {};
            Object.keys(entry.value).forEach(function (k) {
              io.basket[k] = entry.value[k];
            });
            io.basket.line_items = toLineItems(entry.value.items ||
                                               entry.value.line_items);
          } else if (type === 'purchase' || type === 'confirmation') {
            io.transaction = entry.value || {};
            io.transaction.line_items = toLineItems(entry.value &&
              (entry.value.items || entry.value.line_items));
          } else if (type === 'category') {
            io.listing = entry.value;
          }
        }
        return;
      }

      if (type === 'currency' && entry.value) {
        io.basket = io.basket || {};
        io.basket.currency = entry.value;
      }
    }

    // Anything already queued before this ran.
    try { (window.InsiderQueue || []).forEach(applyPush); } catch (e) {}

    // And everything pushed afterwards. Wrapping push here is the same
    // technique the telemetry console uses; both can coexist.
    try {
      window.InsiderQueue = window.InsiderQueue || [];
      var nativePush = window.InsiderQueue.push;
      window.InsiderQueue.push = function () {
        for (var i = 0; i < arguments.length; i++) applyPush(arguments[i]);
        return nativePush.apply(window.InsiderQueue, arguments);
      };
    } catch (e) {}
  })(resolved.env);

  // The tag is written here rather than inline in each page, because which
  // account it points at depends on the hostname. Account and id are plainly
  // readable above and in the console panel.
  document.write(
    '<script async src="//' + resolved.env.account +
    '.api.useinsider.com/ins.js?id=' + resolved.env.partnerId + '"><\/script>'
  );

  // Synchronous by design — see the note above. The second inline script runs
  // only after the catalog has executed, which is where the theme gets applied;
  // calling applyVertical() from here would run it too early and see no data.
  document.write(
    '<script src="catalogs/' + encodeURIComponent(vertical) + '.js"><\/script>' +
    '<script>window.applyVertical();<\/script>'
  );

  /* --- theme + copy, applied once the catalog has parsed ----------------- */
  window.applyVertical = function () {
    var v = window.VERTICAL;
    if (!v) {
      // Unknown vertical in the URL — fall back rather than render an empty store.
      if (vertical !== DEFAULT && !fromSubdomain()) {
        try { localStorage.setItem(KEY, DEFAULT); } catch (e) {}
        location.replace(location.pathname + '?v=' + DEFAULT);
      } else if (fromSubdomain()) {
        // Subdomain names a vertical that was never built. Say so plainly
        // rather than silently showing a different store.
        document.addEventListener('DOMContentLoaded', function () {
          document.body.innerHTML =
            '<div style="font:16px/1.6 system-ui;max-width:34rem;margin:6rem auto;padding:0 1.5rem">' +
            '<h1 style="font-weight:500">No such vertical</h1>' +
            '<p>Nothing is built for <code>' + vertical + '</code>. ' +
            'Add it to <code>verticals.json</code> and run <code>python3 build.py ' +
            vertical + '</code>.</p></div>';
        });
      }
      return;
    }

    var t = v.theme || {};
    var root = document.documentElement;
    root.setAttribute('data-vertical', v.key);
    [['bg', '--bg'], ['alt', '--alt'], ['ink', '--ink'], ['muted', '--muted'],
     ['rule', '--rule'], ['accent', '--accent']].forEach(function (pair) {
      if (t[pair[0]]) root.style.setProperty(pair[1], t[pair[0]]);
    });
    if (t.accent) root.style.setProperty('--sale', t.accent);
    if (t.display) root.style.setProperty('--display', t.display);
    if (t.body) root.style.setProperty('--body', t.body);

    if (t.fonts) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?' + t.fonts + '&display=swap';
      document.head.appendChild(link);
    }
  };

  /* --- keep ?v= across navigation --------------------------------------- */
  // Links are written without the parameter; rewriting them here means the
  // page templates stay vertical-agnostic.
  document.addEventListener('DOMContentLoaded', function () {
    var v = window.VERTICAL_KEY;
    // On a subdomain the hostname already carries the vertical, so links stay
    // clean. Only local and preview URLs need the parameter appended.
    if (!fromSubdomain()) {
      document.querySelectorAll('a[href]').forEach(function (a) {
        var href = a.getAttribute('href');
        if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) return;
        if (/[?&]v=/.test(href)) return;
        a.setAttribute('href', href + (href.indexOf('?') > -1 ? '&' : '?') + 'v=' + v);
      });
    }

    // Brand and copy come from the catalog file, so one template serves all.
    var d = window.VERTICAL || {};
    set('[data-brand]', d.brand);
    set('[data-announce]', d.announce);
    set('[data-hero-lede]', d.hero_lede);
    set('[data-hero-cta]', d.hero_cta);
    set('[data-hero-eyebrow]', d.hero_eyebrow);
    set('[data-tiles-title]', d.tiles_title);
    set('[data-grid-title]', d.grid_title);
    set('[data-reco-title]', d.reco_title);
    set('[data-newsletter-title]', d.newsletter_title);
    set('[data-newsletter-lede]', d.newsletter_lede);
    setHTML('[data-hero-title]', d.hero_title);

    // Journey wording — "Add to cart" becomes "Reserve", "Get a quote" and so on.
    var labels = d.labels || {};
    document.querySelectorAll('[data-label]').forEach(function (n) {
      var v = labels[n.getAttribute('data-label')];
      if (v) n.textContent = v;
    });
    document.querySelectorAll('[data-search-placeholder]').forEach(function (n) {
      if (d.search_placeholder) n.setAttribute('placeholder', d.search_placeholder);
    });
    if (d.brand) {
      document.title = document.title.replace(/—.*$/, '— ' + d.brand).trim();
      if (document.title.indexOf(d.brand) === -1) document.title += ' — ' + d.brand;
    }

    function set(sel, val) {
      if (val == null) return;
      document.querySelectorAll(sel).forEach(function (n) { n.textContent = val; });
    }
    function setHTML(sel, val) {
      if (val == null) return;
      document.querySelectorAll(sel).forEach(function (n) { n.innerHTML = val; });
    }
  });
})();
