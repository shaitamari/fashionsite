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
    /* The bare subdomain runs on salesdemo, which already has Agent One, user
       engagement recommendations and a much richer attribute set. The
       -sandbox alias stays on partnersandbox, so both accounts are reachable
       from the same codebase and the same deploy:

           fashion.insiderdemo.com          -> salesdemo
           fashion-sandbox.insiderdemo.com  -> partnersandbox

       LOCALE. en_GB/EUR on salesdemo too, and deliberately NOT en_US.
       salesdemo's own catalogue lives in en_US, and an XML integration is
       configured per locale — so loading the master feed there would merge
       17,092 records into the same index as the existing products and neither
       catalogue would be trustworthy again. A separate locale keeps them
       apart, which is the same reason partnersandbox was built en_GB/EUR.

       The pair is load-bearing: a mismatch here silently returns the wrong
       catalogue rather than erroring. */
    /* The bare subdomain is salesdemo — its eventual home. It has Agent One,
       user-engagement recommendations, a far richer attribute set and a
       working onsite campaign history.

       UNTIL THE FEED LANDS THERE, these hostnames have no catalogue: search
       and category pages fall back to the local one and recommendation slots
       render nothing. That is deliberate rather than broken. Build and demo on
       -sandbox meanwhile, which stays on partnersandbox and has everything.

       Locale is en_GB/EUR here too, NOT en_US. An XML integration is per
       locale and salesdemo's own catalogue is en_US, so sharing the locale
       would merge 17,092 records into it and neither would be trustworthy. */
    'default': {
      suffix: null, account: 'salesdemo', partnerId: '10002548',
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
    var io = window.insider_object = window.insider_object || {};

    io.user = io.user || {};

    /* Language carries the locale, and getLang splits on "_" and validates the
       country half against its own list — "en" permits GB, so en_GB passes
       through and getLocale returns it whole. That is all the platform needs
       to match the catalogue.

       COUNTRY IS DELIBERATELY NOT SET.

       It used to be, derived from the locale string: en_GB gave GB, written on
       every page load. Which meant every visitor on this estate was recorded as
       being in the United Kingdom regardless of where they actually were — the
       site was overwriting the country the platform had derived from their IP.

       It showed up as a contradiction on a profile: City said Dublin, from the
       IP, and Country said GB, from us. The two cannot both be right.

       That matters beyond tidiness. Location segments and Weather rules key off
       the platform's own geo, and a hard-coded country either fights it or
       quietly wins. A demo whose whole point is "we know where this visitor is"
       cannot also be telling the platform where they are.

       So the site says nothing about location and lets the platform work it
       out. A country typed by a person at checkout is different and is still
       sent — see seedProfileFromStorage below. */
    io.user.language = locale;

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
    /* --- the profile, synchronously ---------------------------------------
       THE PROBLEM THIS SOLVES. The merge below waits for window.Store, which
       loads after this file AND after the catalog — catalogs/home.js is 8.9MB,
       so it can be seconds away. ins.js does not wait. The Hit API builds its
       payload during init from whatever io.user holds at that moment, which
       was language and country and nothing else, and it never rebuilds.

       The result was an asymmetry that looked like nothing was working, and
       was worse than that: CUSTOM attributes still landed, because the merge
       calls sendUserAttributes() explicitly once Store appears. STANDARD ones
       — email, name, surname, phone_number, city, the opt-ins — had no second
       chance and were lost silently.

       store.js is not actually needed for any of this. signIn() writes the
       profile to localStorage synchronously, and this file runs before the
       tag. So read storage directly and build io.user here, with no dependency
       on load order. The merge below still runs afterwards and refines what it
       finds — preferred_category comes from view history that only store.js
       tracks — but the identity no longer depends on it arriving in time.

       Deliberately duplicates a little of userPayload(). The alternative is
       moving store.js ahead of the catalog, which is a bigger change to a file
       every page depends on, for a workaround that should disappear the moment
       Web SDK ingestion is enabled on the account.
       ------------------------------------------------------------------ */
    (function seedProfileFromStorage() {
      function readJSON(key) {
        try {
          var raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
      }

      // Same keys store.js uses. Kept in sync by hand; if store.js renames
      // them this goes quiet rather than wrong, which the debug note catches.
      var visitor = null;
      try { visitor = localStorage.getItem('lmn.visitor'); } catch (e) {}
      var u = readJSON('lmn.user');

      if (visitor) io.user.uuid = visitor;
      io.user.gdpr_optin = true;

      if (!u) {
        if (window.insDebugNote) {
          window.insDebugNote('insider_object: anonymous visitor seeded', 'ok');
        }
        return;
      }

      // Standard attributes. Only set what exists, so an absent field does not
      // overwrite anything the merge finds later with an empty string.
      [['email', 'email'], ['name', 'name'], ['surname', 'surname'],
       ['phone_number', 'phone_number'], ['gender', 'gender'],
       ['birthday', 'birthday'], ['city', 'city']].forEach(function (pair) {
        if (u[pair[1]]) io.user[pair[0]] = u[pair[1]];
      });

      if (u.country) io.user.country = String(u.country).toUpperCase();
      io.user.email_optin = !!u.email_optin;
      io.user.sms_optin = !!u.sms_optin;
      io.user.whatsapp_optin = !!u.whatsapp_optin;
      if (u.gdpr_optin === false) io.user.gdpr_optin = false;

      io.user.custom = io.user.custom || {};
      io.user.custom.membership_tier = u.membership_tier || 'Bronze';
      io.user.custom.loyalty_points =
        typeof u.loyalty_points === 'number' ? u.loyalty_points : 0;
      io.user.custom.is_vip = u.membership_tier === 'Gold';
      if (u.signup_date) io.user.custom.signup_date = u.signup_date;
      if (u.preferred_store) io.user.custom.preferred_store = u.preferred_store;
      if (u.uuid) io.user.custom.account_id = u.uuid;

      if (window.insDebugNote) {
        window.insDebugNote('insider_object: profile seeded from storage — ' +
          (u.email || 'no email') + ', before the tag', 'ok');
      }
    })();

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
        var line = (it && it.product) ? it : null;
        var qty = (it && it.quantity != null) ? it.quantity : 1;
        var p = line ? line.product : it;
        if (!p) return { product: {}, quantity: qty };

        /* The transaction object wants product_image_url, not the catalogue's
           own `image`, and it wants a per-line subtotal. Without those the line
           items are accepted but incomplete, and revenue reporting has nothing
           to break down by product. */
        if (p.image && !p.product_image_url) {
          p.product_image_url = p.image.indexOf('http') === 0
            ? p.image
            : location.origin + '/' + p.image.replace(/^\//, '');
        }
        var unit = Number(p.unit_sale_price != null ? p.unit_sale_price : p.unit_price) || 0;
        var out = line || { product: p, quantity: qty };
        if (out.subtotal == null) out.subtotal = Math.round(unit * qty * 100) / 100;
        return out;
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

            /* CURRENCY IS REQUIRED AND WAS MISSING. confirmation.html sends
               order_id, total, shipping_cost and items — no currency. The tag
               falls back through basket, product, then transaction currency,
               so the page rendered fine and the purchase looked sent, but
               revenue never landed on the profile.

               Take it from the environment, which is the same source the
               catalogue and the feed use. */
            if (io.transaction.currency == null) {
              io.transaction.currency = currency;
            }
            if (io.transaction.total != null) {
              io.transaction.total = Number(io.transaction.total) || 0;
            }
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

      /* --- custom events ----------------------------------------------------
         Everything above translates a push into page data on the insider
         object, which the tag reads. An EVENT has nowhere to live there — it
         is not page state — so custom_event pushes had no route at all and
         went nowhere. That is why flow.html's `fitting_booked` never landed:
         the page is correct, the queue that carries it is not consumed.

         Insider.track is the SDK's own entry point and works on this account
         even with the queue path off. Confirmed by probe:

             Insider.track('custom_event', [{ event_name: …, event_params: … }])

         Same two arguments as the queue entry, split. So forward it.

         DELIBERATELY ONLY custom_event. Every other type already reaches the
         platform through the insider object above, and forwarding those too
         would send each one twice. If the other types are ever needed here,
         confirm they are not already landing before widening this.

         Remove the whole thing once `inioa` is enabled — the queue will be
         drained natively and this becomes a duplicate. */
      if (type === 'custom_event' && entry.value) {
        trackEvent(entry.value);
      }
    }

    /* ins.js may not have run yet when the first event is pushed, so hold
       anything that arrives early and flush once Insider.track exists.
       Gives up after about fifteen seconds rather than polling forever. */
    var pendingEvents = [];

    function flushEvents() {
      if (!(window.Insider && typeof Insider.track === 'function')) return false;
      while (pendingEvents.length) {
        var value = pendingEvents.shift();
        try {
          Insider.track('custom_event', value);
          if (window.insDebugNote) {
            var name = (value && value[0] && value[0].event_name) || 'event';
            window.insDebugNote('custom event sent via Insider.track: ' + name, 'ok');
          }
        } catch (e) {
          if (window.insDebugNote) {
            window.insDebugNote('Insider.track threw on a custom event: ' +
                                (e && e.message), 'error');
          }
        }
      }
      return true;
    }

    function trackEvent(value) {
      pendingEvents.push(value);
      if (flushEvents()) return;
      if (trackEvent.waiting) return;
      trackEvent.waiting = true;
      var tries = 0;
      var t = setInterval(function () {
        if (flushEvents() || ++tries > 600) {
          clearInterval(t);
          trackEvent.waiting = false;
          if (tries > 600 && window.insDebugNote) {
            window.insDebugNote('Insider.track never appeared — ' +
                                pendingEvents.length + ' custom event(s) dropped', 'error');
          }
        }
      }, 25);
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

    /* The service journey — the non-transactional path that matters for
       banking, insurance and telco, where nobody adds a policy to a basket.
       Every vertical configures its own wording: "Book a fitting" on fashion,
       "Get a quote" on insurance, "Manage a trip" on airlines.

       The link used to appear only in flow.html's own masthead, so the page
       was unreachable unless you already knew the URL. It is in every
       masthead now; this gives it the right words. */
    var flow = d.flow || {};
    if (flow.title) set('[data-flow-link]', flow.title);

    /* --- the sandbox orientation link --------------------------------------
       -sandbox hostnames only. These are the copies colleagues and prospects
       are pointed at, and they arrive with no idea what they are looking at or
       how to see the platform working. The bare subdomains are the polished
       ones and stay clean.

       Injected here rather than added to ten HTML files, and only when the
       resolved environment is the sandbox one — so it cannot leak onto a
       storefront being demoed. */
    /* --- demo links, top right of the announce bar --------------------------
       Where these go matters more than it looks.

       The FOOTER is where this kind of thing usually lives, and it is where it
       goes unfound. The UTILS NAV is discoverable but wrong: "Feedback" sitting
       beside Cart and Log in breaks the illusion of a real shop at exactly the
       moment a prospect is meant to forget they are looking at a demo.

       The announce bar is neither. It is the top of every page, always visible,
       and already non-product chrome — so brand copy keeps the middle and the
       demo links sit to the right, plainly not part of the storefront.

       Ask a question appears everywhere. The sandbox copies are the ones
       customers get hands on, so that is where questions actually come from —
       someone exploring alone, without a person beside them to ask. The bare
       storefronts are usually being demoed by a colleague who is answering in
       real time, so the link matters less there, but it costs nothing.

       Start here is sandbox-only, and it is a guided route rather than a page
       of tips: three acts, in order, ending with the visitor looking at their
       own profile filling up. The sandbox is where a customer explores before
       buying, usually alone and with no stated goal — so the page supplies the
       goal the environment does not. On the bare storefronts a colleague is
       driving, and a guide would be in the way.

       Injected here rather than added to a dozen HTML files. */
    (function demoLinks() {
      var bar = document.querySelector('.announce');
      if (!bar || bar.querySelector('[data-demo-links]')) return;

      var sandbox = window.ENVIRONMENT_KEY === 'sandbox';
      var here = location.pathname;
      var links = sandbox
        ? [['about.html', 'Start here'], ['ask.html', 'Ask a question'],
           ['feedback.html', 'Feedback']]
        : [['ask.html', 'Ask a question'], ['feedback.html', 'Feedback']];

      var wrap = document.createElement('span');
      wrap.setAttribute('data-demo-links', '');
      wrap.style.cssText =
        'position:absolute;right:1rem;top:50%;transform:translateY(-50%);' +
        'display:flex;gap:1.1rem;letter-spacing:.04em';

      links.forEach(function (l) {
        if (here.indexOf(l[0]) > -1) return;      // don't link to the page you are on
        var a = document.createElement('a');
        a.href = l[0];
        a.textContent = l[1];
        a.style.cssText = 'color:inherit;opacity:.72;text-decoration:none;' +
                          'border-bottom:1px solid rgba(255,255,255,.35)';
        a.addEventListener('mouseenter', function () { a.style.opacity = '1'; });
        a.addEventListener('mouseleave', function () { a.style.opacity = '.72'; });
        wrap.appendChild(a);
      });

      if (!wrap.children.length) return;
      bar.style.position = 'relative';
      bar.appendChild(wrap);
    })();
    setHTML('[data-hero-title]', d.hero_title);


    /* Reveal the page once the hero image has actually decoded, not merely once
       its src has been set. Revealing earlier means the text arrives, then the
       photograph pops in a beat later — the same flicker moved rather than
       removed.

       Capped, because a slow or broken image must not hold the page. */
    function revealPage(cap) {
      var done = false;
      function go() {
        if (done) return;
        done = true;
        document.documentElement.classList.add('hero-ready');
      }
      var img = document.getElementById('hero-img');
      if (!img || !img.getAttribute('src')) { go(); return; }
      if (img.complete && img.naturalWidth) { go(); return; }
      img.addEventListener('load', go);
      img.addEventListener('error', go);
      setTimeout(go, cap || 900);
    }

    /* Reveal the hero — but only if nothing else is about to rewrite it.

       On a campaign arrival the onsite campaign paints a different headline
       and a different photograph a frame or two after this runs. Revealing
       here would show the default first and the campaign second, which is the
       flicker anti-flicker exists to prevent. So on those page loads we stay
       hidden and let the campaign reveal instead.

       The test is the URL rather than a platform signal, because there is no
       event that fires to say "no campaign applies to this page". A UTM is
       present on exactly the arrivals a campaign targets, and index.html's
       failsafe covers the case where one is present but no campaign runs. */
    if (!/[?&]utm_/.test(location.search)) {
      revealPage(700);
    }

    /* --- category links in the templates ----------------------------------
       The page templates were written against beauty, so the hero button and
       the "View all" link both point at category.html?c=Makeup. The COPY is
       templated above — every vertical gets the right words — but the HREF
       never was, so Ashford Lane's "Shop new in" led to a Makeup collection
       that does not exist in fashion: page renders, Eureka declines to serve
       it, nought products.

       Repoint anything aimed at a collection this vertical does not have.
       Destination is `hero_category` from verticals.json, chosen to match each
       vertical's own hero copy — fashion says "Dress for the life you have"
       and now lands on Dresses rather than Tops, which is merely first in the
       order. Falls back to the first collection if none is declared.

       Only rewrites links whose target is genuinely absent, so a template that
       already names a real collection is left alone. And affinity.js sets the
       hero href itself when it swaps the hero; it registers its handler after
       this one, so it wins, which is correct — a hero about outerwear should
       lead to outerwear. */
    (function fixCategoryLinks() {
      var cols = Object.keys(window.COLLECTIONS || {});
      if (!cols.length) return;

      var target = d.hero_category;
      if (!target || cols.indexOf(target) === -1) {
        if (target && window.insDebugNote) {
          window.insDebugNote('hero_category "' + target + '" is not a collection ' +
                              'in this vertical — falling back to "' + cols[0] + '"', 'warn');
        }
        target = cols[0];
      }

      document.querySelectorAll('a[href*="category"]').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        var m = /[?&]c=([^&#]*)/.exec(href);
        if (!m) return;
        if (cols.indexOf(decodeURIComponent(m[1])) > -1) return;   // real here, leave it
        a.setAttribute('href',
          href.replace(/([?&]c=)[^&#]*/, '$1' + encodeURIComponent(target)));
      });
    })();

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
